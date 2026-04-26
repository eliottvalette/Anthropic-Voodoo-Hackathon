export const REQUIRED_SECTIONS = [
  "# Game to build",
  "# Mechanic name",
  "# Assets",
  "# Required behaviour",
  "# Numeric parameters",
  "# Win / Loss",
  "# CTA",
  "# Constraints reminder",
] as const;

const HALLUCINATION_TRIGGERS: Array<{ word: RegExp; reason: string }> = [
  { word: /\btilt(s|ed|ing)?\b/i, reason: "tilt" },
  { word: /\btread(s|ed|ing)?\b/i, reason: "treads" },
  { word: /\bcrumble(s|d|ing)?\b/i, reason: "crumble" },
  { word: /\bpivot(s|ed|ing)?\b/i, reason: "pivot" },
  { word: /\bshatter(s|ed|ing)?\b/i, reason: "shatter" },
  { word: /\bfragment(s|ed|ing)?\b/i, reason: "fragment" },
  { word: /\bphysics[- ]based\b/i, reason: "physics-based" },
  { word: /\bdestructible\b/i, reason: "destructible" },
];

export class ScaffoldError extends Error {
  constructor(public missing: string[]) {
    super(`codegen_prompt missing required sections: ${missing.join(", ")}`);
    this.name = "ScaffoldError";
  }
}

export class HallucinationError extends Error {
  constructor(public triggers: string[]) {
    super(`codegen_prompt contains hallucinated mechanic words not grounded in evidence: ${triggers.join(", ")}`);
    this.name = "HallucinationError";
  }
}

export function scaffoldCheck(
  codegenPrompt: string,
  mechanicName: string,
): void {
  const missing = REQUIRED_SECTIONS.filter((s) => !codegenPrompt.includes(s));
  if (missing.length > 0) throw new ScaffoldError(missing);
  if (!codegenPrompt.includes(mechanicName)) {
    throw new ScaffoldError([
      `mechanic_name "${mechanicName}" must appear verbatim in codegen_prompt`,
    ]);
  }
}

export function hallucinationCheck(
  codegenPrompt: string,
  evidenceTexts: Array<string | null | undefined>,
): void {
  const evidence = evidenceTexts.filter((s): s is string => typeof s === "string" && s.length > 0).join(" \n ");
  const triggers: string[] = [];
  for (const { word, reason } of HALLUCINATION_TRIGGERS) {
    if (word.test(codegenPrompt) && !word.test(evidence)) {
      triggers.push(reason);
    }
  }
  if (triggers.length > 0) throw new HallucinationError(triggers);
}
