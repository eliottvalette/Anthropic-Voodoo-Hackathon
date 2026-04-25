import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function loadApiKey(repoRoot: string): Promise<string> {
  if (process.env.GEMINI_API_KEY) {
    return process.env.GEMINI_API_KEY;
  }

  const envPath = join(repoRoot, ".env");
  if (!existsSync(envPath)) {
    throw new Error("GEMINI_API_KEY is not set and repo .env was not found.");
  }

  const text = await readFile(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }
    const [key, ...rest] = trimmed.split("=");
    if (key.trim() === "GEMINI_API_KEY") {
      const value = rest.join("=").trim().replace(/^['"]|['"]$/g, "");
      if (value) {
        return value;
      }
    }
  }

  throw new Error("GEMINI_API_KEY was not found in repo .env.");
}

