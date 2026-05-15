// Vitest setup — runs before any test file imports.
// Set env vars used by ./_core/env.ts so that ENV captures sensible test values
// at module-load time. Real values are injected via Vercel env vars in production.
process.env.SUPABASE_INVENTORY_URL = "https://example.supabase.co";
process.env.SUPABASE_INVENTORY_APIKEY = "test-apikey";
process.env.MAXIMO_READER_JWT = "test-jwt";
