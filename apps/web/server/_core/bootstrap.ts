/**
 * Local-dev env bootstrap. Must be imported as the FIRST import of any
 * entry point that reads process.env at module-load time (e.g. `_core/env.ts`).
 * ES module imports run in source order, so this side-effect import populates
 * process.env before any downstream module captures values.
 *
 * Relative paths are CWD-based — they resolve from `apps/web/` in dev and from
 * `/var/task/...` on Vercel. On Vercel the files don't exist; dotenv quietly
 * does nothing and the platform's injected env vars are used.
 *
 * No `import.meta.url` here on purpose — that pattern gets externalized by the
 * serverless bundler and the file ends up missing at deploy time.
 */
import { config as dotenvConfig } from "dotenv";

dotenvConfig({ path: "../../.env.local", quiet: true });
dotenvConfig({ path: "../../.env", quiet: true });
