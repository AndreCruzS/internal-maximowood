import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// ── PATCH — update the signed-in user's display name ────────────────────────
export async function PATCH(request: Request) {
  const supabase = await getSupabaseServer();
  if (!supabase) return NextResponse.json({ error: "Supabase auth is not configured" }, { status: 401 });

  let body: { name?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";

  // Same user_metadata.name the admin panel shows and sets on create.
  const { data, error } = await supabase.auth.updateUser({ data: { name: name || null } });
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });

  return NextResponse.json({ name: (data.user?.user_metadata?.name as string | undefined) ?? null });
}
