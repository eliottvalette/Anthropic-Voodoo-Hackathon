import { stat } from "node:fs/promises";
import { resolve } from "node:path";

async function exists(p: string): Promise<boolean> {
  try { await stat(p); return true; } catch { return false; }
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

export async function stampRunId(runId: string): Promise<string> {
  const stamp = timestamp();
  let candidate = `${runId}_${stamp}`;
  let i = 2;
  while (await exists(resolve("outputs", candidate))) {
    candidate = `${runId}_${stamp}_${i++}`;
  }
  return candidate;
}
