import type { User } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/supabase/server";

/**
 * Intranet admins: INTRANET_ADMIN_EMAILS (comma-separated). Deliberately NOT
 * the calculator's CALCULATOR_ADMIN_EMAILS or auth app_metadata.role — the
 * intranet shares the login system with the calculator app, and being an
 * admin there must not make someone an intranet admin.
 */
export function adminEmails(): string[] {
  return (process.env.INTRANET_ADMIN_EMAILS ?? "")
    .split(",")
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminUser(
  user: { email?: string | null; app_metadata?: User["app_metadata"] | null } | null | undefined,
): boolean {
  if (!user) return false;
  const email = user.email?.toLowerCase();
  return !!email && adminEmails().includes(email);
}

type AdminCheck =
  | { ok: true; user: User }
  | { ok: false; status: 401 | 403; error: string };

/**
 * Resolve the signed-in user and confirm they are an admin.
 * Route handlers past the middleware already have a session, but this adds the
 * admin gate and hands back the user object.
 */
export async function requireAdmin(): Promise<AdminCheck> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, status: 401, error: "Supabase auth is not configured" };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, status: 401, error: "Unauthorized" };
  if (!isAdminUser(user)) return { ok: false, status: 403, error: "Admin access required" };

  return { ok: true, user };
}
