import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { GEMINI_API_KEY } from "../env.ts";
import { MODELS } from "./gemini.ts";
import {
  buildAssetsBlock,
  injectAssets,
  stripFences,
  assertSize,
} from "./assemble.ts";
import { GameSpecSchema, type GameSpec } from "../schemas/gameSpec.ts";
import type { SubMeta, SubsystemName } from "./p4_subsystems.ts";

const API_BASE = "https://generativelanguage.googleapis.com";

export type P4LegacyOutput = {
  htmlPath: string;
  bytes: number;
  meta: {
    totalLatencyMs: number;
    totalTokensIn: number;
    totalTokensOut: number;
    subCalls: SubMeta[];
  };
};

async function generateHtml(
  systemInstruction: string,
  userPrompt: string,
): Promise<{ html: string; tokensIn: number; tokensOut: number; latencyMs: number }> {
  const url = `${API_BASE}/v1beta/models/${MODELS.pro}:generateContent?key=${GEMINI_API_KEY}`;
  const body = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    generationConfig: { temperature: 0.5, maxOutputTokens: 32768 },
  };
  const t0 = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const latencyMs = Date.now() - t0;
  if (!res.ok) {
    throw new Error(`P4-legacy generateContent ${res.status}: ${await res.text()}`);
  }
  const j = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) throw new Error(`Empty P4-legacy response: ${JSON.stringify(j)}`);
  return {
    html: stripFences(text),
    tokensIn: j.usageMetadata?.promptTokenCount ?? 0,
    tokensOut: j.usageMetadata?.candidatesTokenCount ?? 0,
    latencyMs,
  };
}

export async function runP4Legacy(
  runId: string,
  assetsDir: string,
  variant = "_default",
  failedSubsystems: SubsystemName[] = [],
): Promise<P4LegacyOutput> {
  const t0 = Date.now();
  const outDir = resolve("outputs", runId);
  await mkdir(outDir, { recursive: true });

  const systemInstruction = await readFile(
    resolve("prompts", variant, "4_codegen_legacy.md"),
    "utf8",
  );
  const baseUserPrompt = await readFile(
    join(outDir, "03_codegen_prompt.txt"),
    "utf8",
  );
  const fallbackNote = failedSubsystems.length
    ? `\n\n# FALLBACK CONTEXT — modular codegen exhausted retries\nThe split-subsystem codegen failed verify ≥2 times on: ${failedSubsystems.join(", ")}. You are the monolithic last-resort path. Produce the entire single-file HTML in one shot, exercising extra care on those subsystems.`
    : "";
  const userPrompt = baseUserPrompt + fallbackNote;
  const gameSpec: GameSpec = GameSpecSchema.parse(
    JSON.parse(await readFile(join(outDir, "03_game_spec.json"), "utf8")),
  );

  console.log(`[p4-legacy] generating monolithic HTML on ${MODELS.pro}...`);
  const gen = await generateHtml(systemInstruction, userPrompt);
  console.log(`[p4-legacy] received ${gen.html.length} chars, injecting assets...`);

  const assetsBlock = await buildAssetsBlock(assetsDir, gameSpec.asset_role_map);
  const final = injectAssets(gen.html, assetsBlock);
  assertSize(final);

  const htmlPath = join(outDir, "playable.html");
  await writeFile(htmlPath, final, "utf8");

  const meta: SubMeta = {
    step: "4_codegen_legacy",
    model: MODELS.pro,
    tokensIn: gen.tokensIn,
    tokensOut: gen.tokensOut,
    latencyMs: gen.latencyMs,
    attempt: 1,
  };
  await writeFile(
    join(outDir, "04_codegen_legacy_meta.json"),
    JSON.stringify(
      {
        totalLatencyMs: Date.now() - t0,
        failed_subsystems: failedSubsystems,
        subCalls: [meta],
      },
      null,
      2,
    ),
    "utf8",
  );

  return {
    htmlPath,
    bytes: Buffer.byteLength(final, "utf8"),
    meta: {
      totalLatencyMs: Date.now() - t0,
      totalTokensIn: meta.tokensIn,
      totalTokensOut: meta.tokensOut,
      subCalls: [meta],
    },
  };
}
