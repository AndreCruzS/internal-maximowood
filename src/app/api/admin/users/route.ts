import { NextResponse } from "next/server";
import { requireAdmin, isAdminUser } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { generatePassword } from "@/lib/password";
import { ALLOWED_EMAIL_DOMAINS, isCompanyEmail } from "@/lib/intranet";

export const dynamic = "force-dynamic";

export type AdminUser = {
  id: string;
  email: string | null;
  name: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  isAdmin: boolean;
};

function toAdminUser(u: {
  id: string;
  email?: string | null;
  created_at?: string;
  last_sign_in_at?: string | null;
  user_metadata?: Record<string, unknown> | null;
  app_metadata?: Record<string, unknown> | null;
}): AdminUser {
  return {
    id: u.id,
    email: u.email ?? null,
    name: (u.user_metadata?.name as string | undefined) ?? null,
    createdAt: u.created_at ?? "",
    lastSignInAt: u.last_sign_in_at ?? null,
    isAdmin: isAdminUser({ email: u.email ?? null, app_metadata: u.app_metadata ?? {} }),
  };
}

// ── GET — list every calculator login ────────────────────────────────────────
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY / SUPABASE_URL are not configured" },
      { status: 500 },
    );
  }

  const users: AdminUser[] = [];
  const perPage = 200;
  for (let page = 1; page <= 25; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) return NextResponse.json({ error: error.message }, { status: 502 });
    users.push(...data.users.map(toAdminUser));
    if (data.users.length < perPage) break;
  }

  users.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return NextResponse.json({ users });
}

// ── POST — create a new login with a generated temp password ─────────────────
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY / SUPABASE_URL are not configured" },
      { status: 500 },
    );
  }

  let body: { email?: unknown; name?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const customPassword =
    typeof body.password === "string" && body.password.length > 0 ? body.password : null;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }
  if (!isCompanyEmail(email)) {
    return NextResponse.json(
      { error: `Use a company email address (${ALLOWED_EMAIL_DOMAINS.join(", ")})` },
      { status: 400 },
    );
  }
  if (customPassword && customPassword.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const password = customPassword ?? generatePassword();

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // no confirmation email — login works immediately
    user_metadata: name ? { name } : undefined,
  });

  if (error) {
    const status = /already been registered|already exists/i.test(error.message) ? 409 : 502;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({
    user: toAdminUser(data.user),
    // Returned once, only here — the admin copies it and shares it with the user.
    password,
  });
}
