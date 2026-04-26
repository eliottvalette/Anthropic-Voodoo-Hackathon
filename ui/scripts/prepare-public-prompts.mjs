import { cpSync, existsSync, lstatSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(here, '..')
const sourceDir = resolve(projectRoot, '../proto-pipeline-m/prompts/_default')
const publicPromptsDir = resolve(projectRoot, 'public/prompts')
const targetDir = resolve(publicPromptsDir, '_default')

if (!existsSync(sourceDir)) {
  throw new Error(`Prompt source directory not found: ${sourceDir}`)
}

mkdirSync(publicPromptsDir, { recursive: true })

if (existsSync(targetDir)) {
  const stat = lstatSync(targetDir)
  if (stat.isSymbolicLink() || stat.isDirectory()) {
    rmSync(targetDir, { recursive: true, force: true })
  } else {
    throw new Error(`Refusing to replace non-directory prompt target: ${targetDir}`)
  }
}

cpSync(sourceDir, targetDir, { recursive: true })

console.log(`Prepared prompt assets in ${targetDir}`)
