import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { generatePassword } from "@/lib/password";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// ── PATCH — reset a login's password (returns the new one once) ──────────────
export async function PATCH(request: Request, { params }: Ctx) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY / SUPABASE_URL are not configured" },
      { status: 500 },
    );
  }

  const { id } = await params;

  let body: { password?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    // Empty body is fine — we generate one.
  }
  const custom =
    typeof body.password === "string" && body.password.length > 0 ? body.password : null;
  if (custom && custom.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }
  const password = custom ?? generatePassword();

  const { error } = await admin.auth.admin.updateUserById(id, { password });
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });

  return NextResponse.json({ password });
}

// ── DELETE — remove a login ─────────────────────────────────────────────────
export async function DELETE(_request: Request, { params }: Ctx) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY / SUPABASE_URL are not configured" },
      { status: 500 },
    );
  }

  const { id } = await params;

  if (id === auth.user.id) {
    return NextResponse.json({ error: "You can't delete your own login" }, { status: 400 });
  }

  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });

  return NextResponse.json({ ok: true });
}
