import type { User } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/supabase/server";

/**
 * Admin allowlist. Set CALCULATOR_ADMIN_EMAILS in the environment to a
 * comma-separated list, e.g. "anna@lumberplus.com, performance@lumberplus.com".
 * A user whose auth `app_metadata.role` is "admin" also counts, so you can
 * promote people without a redeploy once the first admin is in place.
 */
export function adminEmails(): string[] {
  return (process.env.CALCULATOR_ADMIN_EMAILS ?? "")
    .split(",")
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminUser(
  user: { email?: string | null; app_metadata?: User["app_metadata"] | null } | null | undefined,
): boolean {
  if (!user) return false;
  if (user.app_metadata?.role === "admin") return true;
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
