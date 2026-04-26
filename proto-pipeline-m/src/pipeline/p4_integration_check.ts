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

const IDENT_RE = /[A-Za-z_$][A-Za-z0-9_$]*/g;

function tokensIn(js: string): Set<string> {
  const out = new Set<string>();
  const m = js.match(IDENT_RE);
  if (m) for (const t of m) out.add(t);
  return out;
}

export function integrationCheck(
  plan: P4Plan,
  sketches: Record<SceneElementName, P4Sketch>,
): IntegrationReport {
  const findings: IntegrationFinding[] = [];

  const fieldNames = new Set(plan.shared_state_shape.map((f) => f.name));

  const writersByField: Record<string, SceneElementName[]> = {};
  const readersByField: Record<string, SceneElementName[]> = {};
  for (const f of plan.shared_state_shape) {
    writersByField[f.name] = [...f.written_by];
    readersByField[f.name] = [...f.read_by];
  }

  for (const [name, writers] of Object.entries(writersByField)) {
    if (writers.length === 0) {
      findings.push({
        severity: "warn",
        element: "global",
        message: `state.${name} has no declared writer (will stay at initial value)`,
      });
    }
    if (writers.length > 1) {
      const isEventQueue = /events?$|queue$|pending/i.test(name);
      if (!isEventQueue) {
        findings.push({
          severity: "warn",
          element: "global",
          message: `state.${name} written by ${writers.length} elements (${writers.join(", ")}) — risk of race; consider event queue`,
        });
      }
    }
  }

  for (const [name, readers] of Object.entries(readersByField)) {
    if (readers.length === 0) {
      findings.push({
        severity: "warn",
        element: "global",
        message: `state.${name} has no declared reader (dead state)`,
      });
    }
  }

  for (const el of SCENE_ELEMENT_NAMES) {
    const sketch = sketches[el];
    if (!sketch) {
      findings.push({
        severity: "error",
        element: el,
        message: `sketch missing`,
      });
      continue;
    }
    const tokens = tokensIn(sketch.js);
    const contract = plan.scene_elements[el];

    for (const w of contract.writes) {
      if (!fieldNames.has(w)) continue;
      if (!tokens.has(w)) {
        findings.push({
          severity: "warn",
          element: el,
          message: `contract says ${el}.writes ${w} but identifier not found in JS`,
        });
      }
    }

    for (const r of contract.reads) {
      if (!fieldNames.has(r)) continue;
      if (!tokens.has(r)) {
        findings.push({
          severity: "warn",
          element: el,
          message: `contract says ${el}.reads ${r} but identifier not found in JS`,
        });
      }
    }

    for (const f of plan.shared_state_shape) {
      const isWriter = (writersByField[f.name] ?? []).includes(el);
      if (isWriter) continue;
      const writePattern = new RegExp(`state\\.${f.name}\\s*[+\\-*/]?=`);
      if (writePattern.test(sketch.js)) {
        findings.push({
          severity: "warn",
          element: el,
          message: `${el} appears to write state.${f.name} but is not a declared writer`,
        });
      }
    }
  }

  if (sketches.actors && !/__engineState\.snapshot/.test(sketches.actors.js)) {
    findings.push({
      severity: "error",
      element: "actors",
      message: `actors must override window.__engineState.snapshot`,
    });
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
