import type { P4Plan, SceneElementName } from "../schemas/p4Plan.ts";
import { SCENE_ELEMENT_NAMES } from "../schemas/p4Plan.ts";
import type { P4Sketch } from "../schemas/p4Sketch.ts";

export type IntegrationFinding = {
  severity: "warn" | "error";
  element: SceneElementName | "global";
  message: string;
};

export type IntegrationReport = {
  ok: boolean;
  findings: IntegrationFinding[];
};

export function integrationCheck(
  plan: P4Plan,
  sketches: Record<SceneElementName, P4Sketch>,
): IntegrationReport {
  const findings: IntegrationFinding[] = [];

  for (const el of SCENE_ELEMENT_NAMES) {
    const sketch = sketches[el];
    if (!sketch) {
      findings.push({
        severity: "error",
        element: el,
        message: `sketch missing`,
      });
    }
  }

  if (sketches.bg_ground) {
    const hasFill = /fillRect|fillStyle|drawImage|createLinearGradient/.test(
      sketches.bg_ground.js,
    );
    if (!hasFill) {
      findings.push({
        severity: "error",
        element: "bg_ground",
        message: `bg_ground must paint to canvas every frame (no fillRect/drawImage/gradient detected)`,
      });
    }
  }

  if (sketches.end_card) {
    if (!/state\.isOver/.test(sketches.end_card.js)) {
      findings.push({
        severity: "warn",
        element: "end_card",
        message: `end_card should gate on state.isOver`,
      });
    }
  }

  void plan;

  const errors = findings.filter((f) => f.severity === "error");
  return { ok: errors.length === 0, findings };
}

export function summarizeReport(report: IntegrationReport): string {
  if (report.findings.length === 0) return "integration: clean";
  const lines = report.findings.map(
    (f) => `  [${f.severity}] ${f.element}: ${f.message}`,
  );
  return `integration: ${report.ok ? "ok-with-warnings" : "FAIL"}\n${lines.join("\n")}`;
}
