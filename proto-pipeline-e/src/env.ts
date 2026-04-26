import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoEnv = resolve(here, "../../.env");
config({ path: repoEnv, override: true });

const gemini = process.env.GEMINI_API_KEY?.trim();
if (!gemini) {
  throw new Error(`GEMINI_API_KEY missing. Expected in ${repoEnv}.`);
}

export const GEMINI_API_KEY: string = gemini;

const anthRaw = process.env.ANTHROPIC_API_KEY?.trim();
export const ANTHROPIC_API_KEY: string | undefined = anthRaw;
export const OPENROUTER_API_KEY: string | undefined = anthRaw?.startsWith("sk-or-")
  ? anthRaw
  : process.env.OPENROUTER_API_KEY?.trim();
export const ANTHROPIC_NATIVE_KEY: string | undefined = anthRaw?.startsWith("sk-ant-")
  ? anthRaw
  : undefined;
