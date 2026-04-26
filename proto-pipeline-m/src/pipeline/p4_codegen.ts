import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { writeP4Monolithic } from "./p4_monolithic.ts";
import type { SceneElementName } from "../schemas/p4Plan.ts";

export type SubMeta = {
  step: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  attempt: number;
};

export type P4Output = {
  htmlPath: string;
  bytes: number;
  meta: {
    totalLatencyMs: number;
    totalTokensIn: number;
    totalTokensOut: number;
    subCalls: SubMeta[];
    repaired: boolean;
  };
};

export type P4RunOptions = {
  retryOnly?: SceneElementName[];
  referenceDir?: string | null;
};

export async function runP4(
  runId: string,
  assetsDir: string,
  variant = "_default",
  options: P4RunOptions = {},
): Promise<P4Output> {
  const t0 = Date.now();
  const outDir = resolve("outputs", runId);
  await mkdir(outDir, { recursive: true });

  const referenceDir = options.referenceDir ?? null;
  if (options.retryOnly !== undefined) {
    console.log(
      `[p4] --retry-only ignored: monolithic single-call codegen always regenerates`,
    );
  }

  console.log(`[p4] running monolithic single-call codegen (forced sonnet)...`);
  const { htmlPath, bytes, output } = await writeP4Monolithic(
    runId,
    assetsDir,
    variant,
    referenceDir,
  );

  const subCalls: SubMeta[] = [output.meta];
  const totalLatencyMs = Date.now() - t0;
  await writeFile(
    join(outDir, "04_codegen_meta.json"),
    JSON.stringify(
      {
        totalLatencyMs,
        repaired: false,
        subCalls,
      },
      null,
      2,
    ),
    "utf8",
  );

  return {
    htmlPath,
    bytes,
    meta: {
      totalLatencyMs,
      totalTokensIn: subCalls.reduce((s, x) => s + x.tokensIn, 0),
      totalTokensOut: subCalls.reduce((s, x) => s + x.tokensOut, 0),
      subCalls,
      repaired: false,
    },
  };
}

export async function writeP4(
  runId: string,
  assetsDir: string,
  variant = "_default",
  referenceDir: string | null = null,
): Promise<P4Output> {
  const outDir = resolve("outputs", runId);
  await mkdir(outDir, { recursive: true });
  return await runP4(runId, assetsDir, variant, { referenceDir });
}
