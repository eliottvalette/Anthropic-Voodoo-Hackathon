import { readFile } from "node:fs/promises";
import { ANTHROPIC_API_KEY } from "../env.ts";

const API_URL = "https://openrouter.ai/api/v1/chat/completions";

export type GenerateResult<T = unknown> = {
  data: T;
  rawText: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  model: string;
};

export type AnthropicContent =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type GenerateOptions = {
  temperature?: number;
  maxTokens?: number;
};

const SYSTEM_JSON_SUFFIX =
  "\n\nReturn ONLY a single JSON object that matches the schema described above. No markdown fences, no prose, no commentary.";

export async function imagePartFromPath(path: string): Promise<AnthropicContent> {
  const bytes = await readFile(path);
  const data = Buffer.from(bytes).toString("base64");
  const lower = path.toLowerCase();
  let media = "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) media = "image/jpeg";
  else if (lower.endsWith(".webp")) media = "image/webp";
  else if (lower.endsWith(".gif")) media = "image/gif";
  return {
    type: "image_url",
    image_url: { url: `data:${media};base64,${data}` },
  };
}

function extractJson(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return trimmed;
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) return fence[1]!.trim();
  const objStart = trimmed.indexOf("{");
  const arrStart = trimmed.indexOf("[");
  const start =
    objStart === -1
      ? arrStart
      : arrStart === -1
        ? objStart
        : Math.min(objStart, arrStart);
  if (start < 0) return trimmed;
  return trimmed.slice(start);
}

export async function generateJson<T = unknown>(
  model: string,
  systemInstruction: string,
  userParts: AnthropicContent[],
  options: GenerateOptions = {},
): Promise<GenerateResult<T>> {
  const body = {
    model,
    max_tokens: options.maxTokens ?? 16000,
    temperature: options.temperature ?? 0.4,
    messages: [
      { role: "system", content: systemInstruction + SYSTEM_JSON_SUFFIX },
      { role: "user", content: userParts },
    ],
  };
  const t0 = Date.now();
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ANTHROPIC_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/proto-pipeline-m",
      "X-Title": "proto-pipeline-m",
    },
    body: JSON.stringify(body),
  });
  const latencyMs = Date.now() - t0;
  if (!res.ok) {
    throw new Error(
      `openrouter ${model} ${res.status}: ${await res.text()}`,
    );
  }
  const j = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const text = j.choices?.[0]?.message?.content ?? "";
  if (!text) {
    throw new Error(`Empty response from ${model}: ${JSON.stringify(j)}`);
  }
  const jsonText = extractJson(text);
  let data: T;
  try {
    data = JSON.parse(jsonText) as T;
  } catch (e) {
    throw new Error(
      `Non-JSON response from ${model}: ${(e as Error).message}\nRaw: ${text.slice(0, 500)}`,
    );
  }
  return {
    data,
    rawText: text,
    tokensIn: j.usage?.prompt_tokens ?? 0,
    tokensOut: j.usage?.completion_tokens ?? 0,
    latencyMs,
    model,
  };
}

export const CLAUDE_MODELS = {
  sonnet: "anthropic/claude-sonnet-4.5",
} as const;
