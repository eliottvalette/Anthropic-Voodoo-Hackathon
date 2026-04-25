import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export async function prepareOutputDir(outputRoot: string, run: string): Promise<string> {
  if (!/^[a-zA-Z0-9_-]+$/.test(run)) {
    throw new Error("--run may only contain letters, numbers, underscores, and hyphens.");
  }
  const outputDir = resolve(outputRoot, run);
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
  return outputDir;
}

export async function writeJson(outputDir: string, filename: string, data: unknown): Promise<void> {
  await writeFile(join(outputDir, filename), `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export async function writeText(outputDir: string, filename: string, text: string): Promise<void> {
  await writeFile(join(outputDir, filename), text, "utf8");
}

