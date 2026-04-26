#!/usr/bin/env node
/**
 * AppLovin Playable Preview compliance check.
 *
 * Spec source: project memory `project_architecture.md` (Q13/Q14) + AppLovin docs.
 * Hard requirements:
 *   R1  size <= 5 MB
 *   R2  single self-contained HTML (no <iframe>, no external script/link/img refs except mraid.js)
 *   R3  MRAID 2.0 shim: <script src="mraid.js"> reference present
 *   R4  mraid ready wiring present
 *   R5  mraid.open(...) call present (CTA)
 *   R6  viewport meta tag present
 *   R7  no document.write
 *
 * Run:  node --experimental-strip-types scripts/verify-applovin.mts [path ...]
 *       (Node 25 strips TS natively; no build step.)
 *       With no args, scans slides/public + proto-pipeline-{m,e} outputs.
 * Exit 0 if every checked file passes, 1 otherwise.
 */
import { readFileSync, statSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_BYTES = 5 * 1024 * 1024;

const RE = {
  iframe: /<\s*iframe\b/i,
  script: /<\s*script\b[^>]*\bsrc\s*=\s*['"]([^'"]+)['"]/gi,
  link: /<\s*link\b[^>]*\bhref\s*=\s*['"]([^'"]+)['"]/gi,
  img: /<\s*img\b[^>]*\bsrc\s*=\s*['"]([^'"]+)['"]/gi,
  viewport: /<\s*meta\b[^>]*name\s*=\s*['"]viewport['"]/i,
  mraidScript: /<\s*script\b[^>]*\bsrc\s*=\s*['"]mraid\.js['"]/i,
  mraidReady:
    /mraid\.addEventListener\(\s*['"]ready['"]|mraid\.getState\(\)\s*===?\s*['"]loading['"]|mraid\.ready\b/i,
  mraidOpen: /mraid\.open\s*\(/i,
  docWrite: /document\.write\s*\(/i,
};

type Result = { path: string; size: number; failures: string[] };

const isExternal = (u: string) => /^(https?:)?\/\//i.test(u.trim());

function check(path: string): Result {
  const size = statSync(path).size;
  const failures: string[] = [];
  if (size > MAX_BYTES) failures.push(`R1 size ${size.toLocaleString()} B > 5 MB`);

  const text = readFileSync(path, 'utf8');

  if (RE.iframe.test(text)) failures.push('R2 contains <iframe>');

  const externals: string[] = [];
  for (const m of text.matchAll(RE.script)) {
    const src = m[1];
    if (src.toLowerCase() === 'mraid.js') continue;
    if (isExternal(src)) externals.push(`script:${src}`);
  }
  for (const m of text.matchAll(RE.link)) {
    if (isExternal(m[1])) externals.push(`link:${m[1]}`);
  }
  for (const m of text.matchAll(RE.img)) {
    if (isExternal(m[1])) externals.push(`img:${m[1]}`);
  }
  if (externals.length) {
    const head = externals.slice(0, 3).join(', ');
    const tail = externals.length > 3 ? ` (+${externals.length - 3} more)` : '';
    failures.push(`R2 external refs: ${head}${tail}`);
  }

  if (!RE.mraidScript.test(text)) failures.push('R3 missing <script src="mraid.js">');
  if (!RE.mraidReady.test(text)) failures.push('R4 missing mraid ready listener');
  if (!RE.mraidOpen.test(text)) failures.push('R5 missing mraid.open(...) CTA call');
  if (!RE.viewport.test(text)) failures.push('R6 missing viewport meta');
  if (RE.docWrite.test(text)) failures.push('R7 contains document.write');

  return { path, size, failures };
}

async function walk(dir: string, predicate: (name: string) => boolean): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p, predicate)));
    else if (e.isFile() && predicate(e.name)) out.push(p);
  }
  return out;
}

async function collect(args: string[]): Promise<string[]> {
  if (args.length) return args.map((a) => resolve(a));
  const targets: string[] = [];
  const slidesPublic = join(ROOT, 'slides', 'public');
  targets.push(...(await walk(slidesPublic, (n) => n.endsWith('.html'))));
  for (const sub of ['proto-pipeline-m/outputs', 'proto-pipeline-e/targets']) {
    targets.push(...(await walk(join(ROOT, sub), (n) => n === 'playable.html')));
  }
  return targets.sort();
}

async function main() {
  const targets = await collect(process.argv.slice(2));
  if (!targets.length) {
    console.log('no targets found');
    process.exit(1);
  }

  const results = targets.map(check);
  const width = Math.max(
    ...results.map((r) => (r.path.startsWith(ROOT) ? relative(ROOT, r.path) : r.path).length),
  );

  for (const r of results) {
    const rel = r.path.startsWith(ROOT) ? relative(ROOT, r.path) : r.path;
    const tag = r.failures.length === 0 ? 'PASS' : 'FAIL';
    const kb = (r.size / 1024).toFixed(1).padStart(8);
    console.log(`[${tag}] ${rel.padEnd(width)}  ${kb} KB`);
    for (const f of r.failures) console.log(`        - ${f}`);
  }

  const passed = results.filter((r) => r.failures.length === 0).length;
  console.log(`\nsummary: ${passed}/${results.length} pass, ${results.length - passed} fail`);
  process.exit(passed === results.length ? 0 : 1);
}

main();
