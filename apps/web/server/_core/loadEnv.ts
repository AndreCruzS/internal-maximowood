/**
 * Local dev env loader. Reads .env.local (priority) then .env from the repo
 * root, so a single Vercel-style file at the workspace root supplies vars
 * to every entry point. No-op for missing files. On Vercel, env vars are
 * injected by the platform and this loader is harmless.
 */
import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
// server/_core/loadEnv.ts → server/_core → server → web → apps → repo root
const repoRoot = resolve(here, "..", "..", "..", "..");

// dotenv default is "don't override existing values" — load .env.local first
// so it wins over .env for any overlapping key.
dotenvConfig({ path: resolve(repoRoot, ".env.local") });
dotenvConfig({ path: resolve(repoRoot, ".env") });
