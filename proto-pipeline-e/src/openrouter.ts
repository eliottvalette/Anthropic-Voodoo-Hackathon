import { OPENROUTER_API_KEY } from "./env.ts";

const URL = "https://openrouter.ai/api/v1/chat/completions";

export type OpenRouterResult<T = unknown> = {
  data: T;
  rawText: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  model: string;
};

export const OPENROUTER_MODELS = {
  sonnet: "anthropic/claude-sonnet-4.5",
  sonnet35: "anthropic/claude-3.5-sonnet",
  haiku: "anthropic/claude-haiku-4.5",
} as const;

async function callOnce<T>(
  model: string,
  systemInstruction: string,
  userText: string,
  options: { temperature?: number; maxTokens?: number },
): Promise<OpenRouterResult<T>> {
  if (!OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY missing in env (expecting sk-or-... in ANTHROPIC_API_KEY)");
  }
  const body = {
    model,
    messages: [
      { role: "system", content: systemInstruction },
      { role: "user", content: userText },
    ],
    temperature: options.temperature ?? 0.2,
    max_tokens: options.maxTokens ?? 16000,
    response_format: { type: "json_object" },
  };
  const t0 = Date.now();
  const res = await fetch(URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://voodoo.io",
      "X-Title": "voodoo-hackathon-pipeline",
    },
    body: JSON.stringify(body),
  });
  const latencyMs = Date.now() - t0;
  if (!res.ok) {
    const errText = await res.text();
    const err = new Error(`openrouter ${model} ${res.status}: ${errText.slice(0, 500)}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  const j = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    model?: string;
  };
  const text = j.choices?.[0]?.message?.content ?? "";
  if (!text) throw new Error(`empty response from ${model}: ${JSON.stringify(j).slice(0, 300)}`);
  const stripped = text
    .replace(/^\s*```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
  let data: T;
  try {
    data = JSON.parse(stripped) as T;
  } catch (e) {
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        data = JSON.parse(stripped.slice(start, end + 1)) as T;
      } catch {
        throw new Error(`non-JSON from ${model}: ${(e as Error).message}\nraw: ${stripped.slice(0, 500)}`);
      }
    } else {
      throw new Error(`non-JSON from ${model}: ${(e as Error).message}\nraw: ${stripped.slice(0, 500)}`);
    }
  }
  return {
    data,
    rawText: text,
    tokensIn: j.usage?.prompt_tokens ?? 0,
    tokensOut: j.usage?.completion_tokens ?? 0,
    latencyMs,
    model: j.model ?? model,
  };
}

export async function generateJson<T = unknown>(
  model: string,
  systemInstruction: string,
  userText: string,
  options: { temperature?: number; maxTokens?: number } = {},
): Promise<OpenRouterResult<T>> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      return await callOnce<T>(model, systemInstruction, userText, options);
    } catch (e) {
      lastErr = e;
      const status = (e as Error & { status?: number }).status ?? 0;
      const transient = status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
      if (!transient) throw e;
      if (attempt === 4) throw e;
      const wait = Math.min(60000, 2000 * Math.pow(2, attempt - 1));
      console.warn(`[openrouter] ${model} ${status}; retry in ${wait}ms (attempt ${attempt}/4)`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
