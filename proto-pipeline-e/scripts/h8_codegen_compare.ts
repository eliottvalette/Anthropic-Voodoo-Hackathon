import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { generateJson as gemGen, GEMINI_MODELS, type ContentPart } from "../src/gemini.ts";
import { generateJson as orGen, OPENROUTER_MODELS } from "../src/openrouter.ts";

const args = process.argv.slice(2);
const observationPath =
  args[0] ?? "outputs/h1_fps/B01_3fps/observation.json";
const expectedBehaviorPath =
  args[1] ?? "targets/castle_clashers_gold/expected_behavior.json";

const promptPath = resolve("prompts/codegen.md");
const outRoot = resolve("outputs", "h8_codegen");
await mkdir(outRoot, { recursive: true });

const sys = await readFile(promptPath, "utf8");
const observation = JSON.parse(await readFile(resolve(observationPath), "utf8"));
const behavior = JSON.parse(await readFile(resolve(expectedBehaviorPath), "utf8"));

const assetMap: Record<string, string | null> = {
  player_castle: "castle_player.png",
  enemy_castle: "castle_enemy.png",
  background_gameplay: "bg_gameplay.png",
  background_endcard: "bg_endcard.png",
  unit_player_0: "char_skeleton/full.png",
  unit_player_1: "char_goblin_green/full.png",
  unit_player_2: "char_cyclops_red/full.png",
  unit_enemy_0: "char_ninja/full.png",
  unit_enemy_1: "char_ninja/full.png",
  unit_enemy_2: "char_ninja/full.png",
  projectile_0: "proj_poison.png",
  projectile_1: "proj_fireball.png",
  projectile_2: "proj_missile.png",
  hud_top_bar: "ui_top_bar.png",
  hud_unit_panel: "ui_unit_panel.png",
  ui_play_button: "ui_play_button.png",
  ui_battle_failed: "ui_battle_failed.png",
};

const userPayload = JSON.stringify(
  { behavior, observation, assets: assetMap },
  null,
  2,
);

console.log(`[h8] payload size: ${userPayload.length} chars`);
console.log(`[h8] running Gemini Pro and OpenRouter Sonnet in parallel...`);

type Result = {
  label: string;
  ok: boolean;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  model: string;
  htmlPath: string | null;
  rationale: string | null;
  error: string | null;
};

async function runGemini(): Promise<Result> {
  try {
    const userParts: ContentPart[] = [{ text: userPayload }];
    const r = await gemGen<{ html: string; rationale: string }>(
      GEMINI_MODELS.flash,
      sys,
      userParts,
      { temperature: 0.2 },
    );
    if (typeof r.data !== "object" || r.data === null || typeof (r.data as any).html !== "string") {
      throw new Error("output missing html field");
    }
    const dir = join(outRoot, "gemini");
    await mkdir(dir, { recursive: true });
    const htmlPath = join(dir, "playable.html");
    await writeFile(htmlPath, r.data.html, "utf8");
    await writeFile(join(dir, "meta.json"), JSON.stringify({
      model: r.model,
      tokensIn: r.tokensIn,
      tokensOut: r.tokensOut,
      latencyMs: r.latencyMs,
      htmlBytes: r.data.html.length,
      rationale: r.data.rationale,
    }, null, 2), "utf8");
    console.log(`[h8] gemini ✓ tokensIn=${r.tokensIn} tokensOut=${r.tokensOut} latency=${r.latencyMs}ms html=${r.data.html.length}b`);
    return {
      label: "gemini",
      ok: true,
      tokensIn: r.tokensIn,
      tokensOut: r.tokensOut,
      latencyMs: r.latencyMs,
      model: r.model,
      htmlPath,
      rationale: r.data.rationale,
      error: null,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[h8] gemini ✗ ${msg.slice(0, 300)}`);
    return { label: "gemini", ok: false, tokensIn: 0, tokensOut: 0, latencyMs: 0, model: "", htmlPath: null, rationale: null, error: msg };
  }
}

async function runSonnet(): Promise<Result> {
  try {
    const r = await orGen<{ html: string; rationale: string }>(
      OPENROUTER_MODELS.sonnet,
      sys,
      userPayload,
      { temperature: 0.2, maxTokens: 32000 },
    );
    if (typeof r.data !== "object" || r.data === null || typeof (r.data as any).html !== "string") {
      throw new Error("output missing html field");
    }
    const dir = join(outRoot, "sonnet");
    await mkdir(dir, { recursive: true });
    const htmlPath = join(dir, "playable.html");
    await writeFile(htmlPath, r.data.html, "utf8");
    await writeFile(join(dir, "meta.json"), JSON.stringify({
      model: r.model,
      tokensIn: r.tokensIn,
      tokensOut: r.tokensOut,
      latencyMs: r.latencyMs,
      htmlBytes: r.data.html.length,
      rationale: r.data.rationale,
    }, null, 2), "utf8");
    console.log(`[h8] sonnet ✓ tokensIn=${r.tokensIn} tokensOut=${r.tokensOut} latency=${r.latencyMs}ms html=${r.data.html.length}b`);
    return {
      label: "sonnet",
      ok: true,
      tokensIn: r.tokensIn,
      tokensOut: r.tokensOut,
      latencyMs: r.latencyMs,
      model: r.model,
      htmlPath,
      rationale: r.data.rationale,
      error: null,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[h8] sonnet ✗ ${msg.slice(0, 300)}`);
    return { label: "sonnet", ok: false, tokensIn: 0, tokensOut: 0, latencyMs: 0, model: "", htmlPath: null, rationale: null, error: msg };
  }
}

const t0 = Date.now();
const [g, s] = await Promise.all([runGemini(), runSonnet()]);
console.log(`[h8] both done in ${((Date.now() - t0) / 1000).toFixed(1)}s wall`);

async function htmlBytes(r: Result): Promise<number> {
  if (!r.htmlPath) return 0;
  return Buffer.byteLength(await readFile(r.htmlPath, "utf8"), "utf8");
}

const csv = [
  "model,ok,tokensIn,tokensOut,latencyMs,htmlBytes,error",
];
for (const r of [g, s]) {
  csv.push(
    [
      r.label,
      r.ok,
      r.tokensIn,
      r.tokensOut,
      r.latencyMs,
      await htmlBytes(r),
      JSON.stringify((r.error ?? "").slice(0, 80)),
    ].join(","),
  );
}
const csvPath = join(outRoot, "h8_report.csv");
await writeFile(csvPath, csv.join("\n") + "\n", "utf8");
console.log(`\n[h8] report: ${csvPath}\n`);
console.log(csv.join("\n"));

console.log(`\n[h8] next: bun run scripts/score.ts ${join(outRoot, "gemini/playable.html")} --label h8_gemini`);
console.log(`[h8] next: bun run scripts/score.ts ${join(outRoot, "sonnet/playable.html")} --label h8_sonnet`);
