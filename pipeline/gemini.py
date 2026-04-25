from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any


class GeminiError(RuntimeError):
    """Raised when Gemini returns an API or transport error."""


@dataclass(frozen=True)
class UploadedFile:
    name: str
    uri: str
    mime_type: str
    state: str


class GeminiClient:
    def __init__(self, api_key: str, timeout_seconds: int = 180) -> None:
        self._api_key = api_key
        self._timeout_seconds = timeout_seconds

    def upload_file(
        self,
        path: Path,
        mime_type: str,
        display_name: str,
        poll_interval_seconds: float,
        poll_timeout_seconds: int,
    ) -> UploadedFile:
        upload_url = self._start_upload(path, mime_type, display_name)
        response = self._upload_bytes(upload_url, path)
        file_payload = response.get("file", {})
        uploaded = UploadedFile(
            name=file_payload["name"],
            uri=file_payload["uri"],
            mime_type=file_payload.get("mimeType", mime_type),
            state=file_payload.get("state", "PROCESSING"),
        )
        return self.wait_until_active(uploaded, poll_interval_seconds, poll_timeout_seconds)

    def wait_until_active(
        self,
        uploaded: UploadedFile,
        poll_interval_seconds: float,
        poll_timeout_seconds: int,
    ) -> UploadedFile:
        deadline = time.monotonic() + poll_timeout_seconds
        last_state = uploaded.state
        while time.monotonic() < deadline:
            payload = self._request_json("GET", self._api_url(uploaded.name))
            last_state = payload.get("state", last_state)
            if last_state == "ACTIVE":
                return UploadedFile(
                    name=payload["name"],
                    uri=payload["uri"],
                    mime_type=payload.get("mimeType", uploaded.mime_type),
                    state=last_state,
                )
            if last_state == "FAILED":
                raise GeminiError(f"Gemini file processing failed for {uploaded.name}")
            time.sleep(poll_interval_seconds)
        raise GeminiError(f"Timed out waiting for {uploaded.name}; last state={last_state}")

    def generate_json(
        self,
        model: str,
        prompt: str,
        file: UploadedFile | None = None,
        temperature: float = 0.2,
    ) -> dict[str, Any]:
        parts: list[dict[str, Any]] = [{"text": prompt}]
        if file is not None:
            parts.append({"file_data": {"mime_type": file.mime_type, "file_uri": file.uri}})
        payload = {
            "contents": [{"role": "user", "parts": parts}],
            "generationConfig": {
                "response_mime_type": "application/json",
                "temperature": temperature,
            },
        }
        model_resource = model if model.startswith("models/") else f"models/{model}"
        return self._request_json("POST", self._api_url(f"{model_resource}:generateContent"), payload)

    def _start_upload(self, path: Path, mime_type: str, display_name: str) -> str:
        headers = {
            "X-Goog-Upload-Protocol": "resumable",
            "X-Goog-Upload-Command": "start",
            "X-Goog-Upload-Header-Content-Length": str(path.stat().st_size),
            "X-Goog-Upload-Header-Content-Type": mime_type,
            "Content-Type": "application/json",
        }
        payload = {"file": {"display_name": display_name}}
        response, response_headers = self._request(
            "POST",
            self._upload_url("files"),
            payload,
            headers=headers,
        )
        upload_url = response_headers.get("x-goog-upload-url")
        if not upload_url:
            raise GeminiError(f"Upload start did not return x-goog-upload-url: {response}")
        return upload_url

    def _upload_bytes(self, upload_url: str, path: Path) -> dict[str, Any]:
        data = path.read_bytes()
        headers = {
            "Content-Length": str(len(data)),
            "X-Goog-Upload-Offset": "0",
            "X-Goog-Upload-Command": "upload, finalize",
        }
        response, _ = self._request("POST", upload_url, raw_data=data, headers=headers)
        return response

    def _api_url(self, resource: str) -> str:
        return self._with_key(f"https://generativelanguage.googleapis.com/v1beta/{resource}")

    def _upload_url(self, resource: str) -> str:
        return self._with_key(f"https://generativelanguage.googleapis.com/upload/v1beta/{resource}")

    def _with_key(self, url: str) -> str:
        return f"{url}?{urllib.parse.urlencode({'key': self._api_key})}"

    def _request_json(
        self,
        method: str,
        url: str,
        payload: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        response, _ = self._request(method, url, payload, headers=headers)
        return response

    def _request(
        self,
        method: str,
        url: str,
        payload: dict[str, Any] | None = None,
        raw_data: bytes | None = None,
        headers: dict[str, str] | None = None,
    ) -> tuple[dict[str, Any], dict[str, str]]:
        request_headers = headers.copy() if headers else {}
        data = raw_data
        if payload is not None:
            data = json.dumps(payload).encode("utf-8")
            request_headers.setdefault("Content-Type", "application/json")
        request = urllib.request.Request(url, data=data, headers=request_headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=self._timeout_seconds) as response:
                body = response.read().decode("utf-8")
                parsed = json.loads(body) if body else {}
                return parsed, {key.lower(): value for key, value in response.headers.items()}
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            raise GeminiError(f"Gemini HTTP {exc.code}: {body}") from exc
        except urllib.error.URLError as exc:
            raise GeminiError(f"Gemini request failed: {exc}") from exc

