import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { z } from "zod";
import {
  generateJson,
  MODELS,
  type ContentPart,
  type GenerateOptions,
} from "./gemini.ts";
import { GEMINI_API_KEY } from "../env.ts";
import { GameSpecSchema, type GameSpec } from "../schemas/gameSpec.ts";
import {
  SubsystemBriefsSchema,
  type SubsystemBriefs,
} from "../schemas/subsystemBriefs.ts";
import { getTemplate } from "../templates/index.ts";

const API_BASE = "https://generativelanguage.googleapis.com";

export type SubsystemName = "input" | "physics" | "render" | "state" | "winloss";

const SUBSYSTEM_NAMES: SubsystemName[] = ["input", "physics", "render", "state", "winloss"];

const PROMPT_FILE: Record<SubsystemName, string> = {
  input: "4_input.md",
  physics: "4_physics.md",
  render: "4_render.md",
  state: "4_state.md",
  winloss: "4_winloss.md",
};

export type SubMeta = {
  step: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  attempt: number;
};

export type SubsystemWinner = {
  name: SubsystemName;
  source: string;
  judgeRationale: string;
  concerns: string[];
  candidatesParsed: number;
};

export type P4SubsystemsOutput = {
  winners: Record<SubsystemName, SubsystemWinner>;
  meta: { subCalls: SubMeta[] };
};

const JudgeSchema = z
  .object({
    winner_index: z.number().int().min(0),
    rationale: z.string(),
    concerns_about_winner: z.array(z.string()).default([]),
  })
  .passthrough();

const N_CANDIDATES = 3;
const TEMP_CODEGEN = 0.8;
const TEMP_JUDGE = 0.2;

function stripFencesText(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^```[a-zA-Z]*\n?/, "");
  s = s.replace(/\n?```\s*$/, "");
  return s.trim();
}

function tryParseExpression(src: string): { ok: boolean; error: string | null } {
  try {
    new Function(`"use strict"; return (${src});`);
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

async function generateText(
  model: string,
  systemInstruction: string,
  userParts: ContentPart[],
  options: GenerateOptions = {},
): Promise<{ text: string; tokensIn: number; tokensOut: number; latencyMs: number }> {
  const url = `${API_BASE}/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
  const body = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: "user", parts: userParts }],
    generationConfig: {
      temperature: options.temperature ?? 0.7,
      ...(options.responseMimeType ? { responseMimeType: options.responseMimeType } : {}),
    },
  };
  const t0 = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const latencyMs = Date.now() - t0;
  if (!res.ok) {
    throw new Error(`generateContent ${model} ${res.status}: ${await res.text()}`);
  }
  const j = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) throw new Error(`Empty response from ${model}`);
  return {
    text,
    tokensIn: j.usageMetadata?.promptTokenCount ?? 0,
    tokensOut: j.usageMetadata?.candidatesTokenCount ?? 0,
    latencyMs,
  };
}

function buildCodegenUserPayload(
  name: SubsystemName,
  gameSpec: GameSpec,
  briefs: SubsystemBriefs,
  templateHint: string | undefined,
): string {
  const brief = briefs.briefs[name];
  const payload: Record<string, unknown> = {
    subsystem: name,
    game_spec: gameSpec,
    shared_state_shape: briefs.shared_state_shape,
    brief,
  };
  if (name === "state") {
    payload.mechanic_name = gameSpec.mechanic_name;
  }
  if (templateHint) {
    payload.template_hints = templateHint;
  }
  return JSON.stringify(payload, null, 2);
}

function buildJudgeUserPayload(
  name: SubsystemName,
  gameSpec: GameSpec,
  briefs: SubsystemBriefs,
  candidates: Array<{ index: number; source: string; parses: boolean; syntax_error: string | null }>,
): string {
  const payload: Record<string, unknown> = {
    subsystem: name,
    brief: briefs.briefs[name],
    shared_state_shape: briefs.shared_state_shape,
    candidates,
  };
  if (name === "state") payload.mechanic_name = gameSpec.mechanic_name;
  return JSON.stringify(payload, null, 2);
}

async function runSubsystem(
  name: SubsystemName,
  variant: string,
  gameSpec: GameSpec,
  briefs: SubsystemBriefs,
  templateHint: string | undefined,
): Promise<{ winner: SubsystemWinner; subCalls: SubMeta[] }> {
  const subCalls: SubMeta[] = [];
  const systemInstruction = await readFile(
    resolve("prompts", variant, PROMPT_FILE[name]),
    "utf8",
  );
  const userPayload = buildCodegenUserPayload(name, gameSpec, briefs, templateHint);

  const candidatePromises = Array.from({ length: N_CANDIDATES }, async (_, i) => {
    const r = await generateText(MODELS.pro, systemInstruction, [{ text: userPayload }], {
      temperature: TEMP_CODEGEN,
    });
    const source = stripFencesText(r.text);
    const parsed = tryParseExpression(source);
    return {
      index: i,
      source,
      parses: parsed.ok,
      syntax_error: parsed.error,
      meta: {
        step: `4_${name}_cand${i}`,
        model: MODELS.pro,
        tokensIn: r.tokensIn,
        tokensOut: r.tokensOut,
        latencyMs: r.latencyMs,
        attempt: 1,
      } as SubMeta,
    };
  });

  const candidates = await Promise.all(candidatePromises);
  for (const c of candidates) subCalls.push(c.meta);

  const judgeSystem = await readFile(resolve("prompts", variant, "4_judge.md"), "utf8");
  const judgeUser = buildJudgeUserPayload(
    name,
    gameSpec,
    briefs,
    candidates.map((c) => ({
      index: c.index,
      source: c.source,
      parses: c.parses,
      syntax_error: c.syntax_error,
    })),
  );
  const judgeResp = await generateJson(
    MODELS.pro,
    judgeSystem,
    [{ text: judgeUser }],
    { temperature: TEMP_JUDGE },
  );
  subCalls.push({
    step: `4_${name}_judge`,
    model: MODELS.pro,
    tokensIn: judgeResp.tokensIn,
    tokensOut: judgeResp.tokensOut,
    latencyMs: judgeResp.latencyMs,
    attempt: 1,
  });
  const judge = JudgeSchema.parse(judgeResp.data);

  let chosenIdx = judge.winner_index;
  if (chosenIdx < 0 || chosenIdx >= candidates.length) chosenIdx = 0;
  let chosen = candidates[chosenIdx]!;
  if (!chosen.parses) {
    const firstParsing = candidates.find((c) => c.parses);
    if (firstParsing) chosen = firstParsing;
  }

  return {
    winner: {
      name,
      source: chosen.source,
      judgeRationale: judge.rationale,
      concerns: judge.concerns_about_winner ?? [],
      candidatesParsed: candidates.filter((c) => c.parses).length,
    },
    subCalls,
  };
}

async function loadExistingWinner(
  outDir: string,
  name: SubsystemName,
): Promise<SubsystemWinner> {
  const source = await readFile(join(outDir, `04_subsystem_${name}.js`), "utf8");
  return {
    name,
    source,
    judgeRationale: "(reused from previous attempt on disk)",
    concerns: [],
    candidatesParsed: 1,
  };
}

export async function runP4Subsystems(
  runId: string,
  variant = "_default",
  regenerate?: SubsystemName[],
): Promise<P4SubsystemsOutput> {
  const outDir = resolve("outputs", runId);
  await mkdir(outDir, { recursive: true });

  const gameSpec = GameSpecSchema.parse(
    JSON.parse(await readFile(join(outDir, "03_game_spec.json"), "utf8")),
  );
  const briefs = SubsystemBriefsSchema.parse(
    JSON.parse(await readFile(join(outDir, "03_subsystem_briefs.json"), "utf8")),
  );
  const tpl = getTemplate(gameSpec.template_id);

  const targets = regenerate ?? SUBSYSTEM_NAMES;
  const targetSet = new Set(targets);

  const subsystemPromises = SUBSYSTEM_NAMES.map(async (name) => {
    if (targetSet.has(name)) {
      return await runSubsystem(name, variant, gameSpec, briefs, tpl?.subsystem_hints[name]);
    }
    const winner = await loadExistingWinner(outDir, name);
    return { winner, subCalls: [] as SubMeta[] };
  });
  const results = await Promise.all(subsystemPromises);

  const winners = {} as Record<SubsystemName, SubsystemWinner>;
  const subCalls: SubMeta[] = [];
  for (let i = 0; i < SUBSYSTEM_NAMES.length; i++) {
    const name = SUBSYSTEM_NAMES[i]!;
    winners[name] = results[i]!.winner;
    subCalls.push(...results[i]!.subCalls);
    if (targetSet.has(name)) {
      await writeFile(
        join(outDir, `04_subsystem_${name}.js`),
        results[i]!.winner.source,
        "utf8",
      );
    }
  }

  await writeFile(
    join(outDir, "04_subsystems_meta.json"),
    JSON.stringify(
      {
        template_id: gameSpec.template_id,
        template_used: tpl ? tpl.id : null,
        winners: Object.fromEntries(
          SUBSYSTEM_NAMES.map((n) => [
            n,
            {
              judge_rationale: winners[n].judgeRationale,
              concerns: winners[n].concerns,
              candidates_parsed: winners[n].candidatesParsed,
            },
          ]),
        ),
      },
      null,
      2,
    ),
    "utf8",
  );

  return { winners, meta: { subCalls } };
}
