#!/usr/bin/env node
// Build the self-contained airplane-evolution playable by inlining Three.js
// into the .src.html template. Output: templates/airplane-evolution.html

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SRC = path.join(ROOT, 'templates/airplane-evolution.src.html')
const OUT = path.join(ROOT, 'templates/airplane-evolution.html')
const THREE = path.join(ROOT, '.cache/three.min.js')

const tpl = fs.readFileSync(SRC, 'utf8')
const three = fs.readFileSync(THREE, 'utf8')
// Use a function replacement to avoid $-pattern interpretation in the
// replacement string — minified Three.js contains "$&" sequences that would
// otherwise re-insert the matched marker into the output.
const replacement = `<script>\n${three}\n</script>`
const out = tpl.replace('<!-- INJECT_THREE -->', () => replacement)
fs.writeFileSync(OUT, out)

const sz = fs.statSync(OUT).size
const mb = (sz / 1024 / 1024).toFixed(2)
console.log(`built ${path.relative(process.cwd(), OUT)} — ${mb} MB (${sz} bytes)`)
if (sz > 5 * 1024 * 1024) {
  console.error(`⚠  exceeds 5 MB limit`)
  process.exit(1)
}
