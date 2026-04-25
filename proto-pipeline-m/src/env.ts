import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoEnv = resolve(here, "../../.env");

config({ path: repoEnv });

const key = process.env.GEMINI_API_KEY;
if (!key) {
  throw new Error(
    `GEMINI_API_KEY missing. Expected in ${repoEnv} (repo-root .env).`,
  );
}

export const GEMINI_API_KEY: string = key;
