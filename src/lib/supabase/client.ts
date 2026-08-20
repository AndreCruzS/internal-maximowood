"use client";

import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client (auth only — app data comes from the API routes).
export function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createBrowserClient(url, anonKey);
}
