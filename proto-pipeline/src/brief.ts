import type { JsonObject } from "./gemini.ts";

export function renderBrief(videoBreakdown: JsonObject, featureSpec: JsonObject): string {
  const coreLoop = objectAt(videoBreakdown, "core_loop");
  const gameplay = objectAt(featureSpec, "gameplay");
  const assets = arrayAt(featureSpec, "asset_plan");
  const parameters = arrayAt(featureSpec, "parameters");
  const criteria = arrayAt(featureSpec, "acceptance_criteria");

  const lines = [
    `# ${stringAt(featureSpec, "prototype_name", "Playable Prototype")}`,
    "",
    "## Video Understanding",
    `- Core loop: ${stringAt(coreLoop, "one_sentence", "n/a")}`,
    `- Player goal: ${stringAt(coreLoop, "player_goal", "n/a")}`,
    `- Fun driver: ${stringAt(coreLoop, "why_it_is_fun", "n/a")}`,
    "",
    "## Playable Spec",
    `- Summary: ${stringAt(featureSpec, "implementation_summary", "n/a")}`,
    `- Objective: ${stringAt(gameplay, "objective", "n/a")}`,
    `- Primary interaction: ${stringAt(gameplay, "primary_interaction", "n/a")}`,
    `- Win condition: ${stringAt(gameplay, "win_condition", "n/a")}`,
    "",
    "## Assets",
    ...assets.slice(0, 12).map((asset) => {
      const item = asObject(asset);
      return `- ${stringAt(item, "asset_path", "n/a")}: ${stringAt(item, "use", "n/a")} (${stringAt(item, "processing", "n/a")})`;
    }),
    "",
    "## Variation Parameters",
    ...parameters.map((parameter) => {
      const item = asObject(parameter);
      return `- ${stringAt(item, "name", "n/a")} = ${String(item.default ?? "n/a")}: ${stringAt(item, "gameplay_effect", "n/a")}`;
    }),
    "",
    "## Acceptance Criteria",
    ...criteria.map((criterion) => `- ${String(criterion)}`),
    "",
  ];

  return lines.join("\n");
}

function objectAt(object: JsonObject, key: string): JsonObject {
  return asObject(object[key]);
}

function arrayAt(object: JsonObject, key: string): unknown[] {
  return Array.isArray(object[key]) ? object[key] : [];
}

function asObject(value: unknown): JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as JsonObject) : {};
}

function stringAt(object: JsonObject, key: string, fallback: string): string {
  return typeof object[key] === "string" ? object[key] : fallback;
}

