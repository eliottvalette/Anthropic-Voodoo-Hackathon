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

export class ScaffoldError extends Error {
  constructor(public missing: string[]) {
    super(`codegen_prompt missing required sections: ${missing.join(", ")}`);
    this.name = "ScaffoldError";
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
