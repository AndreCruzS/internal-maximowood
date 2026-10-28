import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { accessDecision, emailsOf, parseAccessSettings, wouldBeRefused, type AccessDecision, type AccessPerson, type AccessRow } from "@/lib/access";

/** For PostgREST filters: a quoted value. */
const quoted = (v: string) => `"${v.replace(/["\\]/g, "")}"`;

/** The directory entry for an address: its main email or one of its other addresses. */
export async function personByEmail(db: SupabaseClient, email: string): Promise<(AccessPerson & { id: string }) | null> {
  const e = email.trim().toLowerCase();
  if (!e) return null;
  const { data, error } = await db
    .from("people")
    .select("id, active, employment_type, work_country, email, alt_emails")
    .or(`email.ilike.${quoted(e)},alt_emails.cs.{${quoted(e)}}`)
    .order("active", { ascending: false })
    .limit(5);
  if (error) throw new Error(error.message); // checkAccess fails open
  // ilike treats _ as a wildcard: keep exact matches only.
  type Row = AccessPerson & { id: string; email: string | null; alt_emails: string[] | null };
  const hit = ((data as Row[] | null) ?? []).find(p => emailsOf(p).includes(e));
  return hit ? { id: hit.id, active: hit.active, employment_type: hit.employment_type, work_country: hit.work_country ?? null } : null;
}

export async function accessEnforced(db: SupabaseClient) {
  const { data } = await db.from("app_settings").select("value").eq("key", "access").maybeSingle();
  return parseAccessSettings((data as { value: unknown } | null)?.value).enforce;
}

/**
 * May this signed-in user use the intranet? Fails open when the service role or the 0033
 * columns are missing, so a set-up problem never locks the whole company out.
 */
export async function checkAccess(user: Pick<User, "id" | "email">): Promise<AccessDecision> {
  const admin = getSupabaseAdmin();
  if (!admin) return { ok: true };
  try {
    if (!(await accessEnforced(admin))) return { ok: true };
    const [role, person] = await Promise.all([
      admin.from("profiles").select("role").eq("user_id", user.id).maybeSingle(),
      // The entry linked to this login wins over an email match.
      admin.from("people").select("id, active, employment_type, work_country").eq("user_id", user.id).maybeSingle(),
    ]);
    const linked = (person.data as (AccessPerson & { id: string }) | null) ?? null;
    if (person.error) return { ok: true };
    return accessDecision({
      enforce: true,
      isAdmin: (role.data as { role?: string } | null)?.role === "admin",
      person: linked ?? (await personByEmail(admin, user.email ?? "")),
    });
  } catch {
    return { ok: true };
  }
}

export const ACCESS_ROW_COLUMNS = "id, full_name, email, alt_emails, employment_type, legal_entity, holiday_calendar, work_country, office, company_id, active, user_id";

/** HR's Access page: every directory entry, the switch, and who the check would refuse right now. */
export async function loadAccessPage(admin: SupabaseClient) {
  const [people, profiles, enforce] = await Promise.all([
    admin.from("people").select(ACCESS_ROW_COLUMNS).order("full_name"),
    admin.from("profiles").select("user_id, email, role"),
    accessEnforced(admin),
  ]);
  if (people.error) return { ready: false as const, error: people.error.message };
  const rows = (people.data as AccessRow[] | null) ?? [];
  const accounts = ((profiles.data as { user_id: string; email: string | null; role: string | null }[] | null) ?? [])
    .filter(a => a.email)
    .map(a => ({ user_id: a.user_id, email: a.email!, role: a.role ?? "member" }));
  return { ready: true as const, enforce, people: rows, refused: wouldBeRefused(accounts, rows) };
}
