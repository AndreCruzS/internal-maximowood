import type { SupabaseClient, User } from "@supabase/supabase-js";
import { HIRE_COLUMNS, MODULE_COLUMNS, hireProgress, trainingPath, type AttemptSummary, type HireProgress, type NewHire, type TrainingModule } from "@/lib/onboarding";
export type { AttemptSummary } from "@/lib/onboarding";
import type { HireContact } from "@/components/onboarding/NewHireHome";

/** Best score and pass per module from raw attempts. */
export function summarizeAttempts(rows: { module_id: string; score: number; passed: boolean }[]): Record<string, AttemptSummary> {
  const out: Record<string, AttemptSummary> = {};
  for (const r of rows) {
    const s = (out[r.module_id] ??= { module_id: r.module_id, best: 0, passed: false, tries: 0 });
    s.best = Math.max(s.best, r.score);
    s.passed ||= r.passed;
    s.tries++;
  }
  return out;
}

const rpcTrue = async (supabase: SupabaseClient, fn: string) => {
  const { data, error } = await supabase.rpc(fn);
  return !error && data === true;
};

/** Who may do what in onboarding (all false until migration 0014 is applied). */
export async function onboardingPermissions(supabase: SupabaseClient) {
  const [canAddHires, isIt, canEditTraining] = await Promise.all([
    rpcTrue(supabase, "can_add_hires"),
    rpcTrue(supabase, "is_it"),
    rpcTrue(supabase, "can_edit_training"),
  ]);
  return { canAddHires, isIt, canEditTraining };
}

/** The signed-in person's brands and departments (for their training path). */
async function myScope(supabase: SupabaseClient, user: User) {
  const [profile, person] = await Promise.all([
    supabase.from("profiles").select("company_id, department_id").eq("user_id", user.id).maybeSingle(),
    supabase.from("people").select("id, company_id, companies, positions(department_id)").eq("user_id", user.id).maybeSingle(),
  ]);
  const p = person.data as { id: string; company_id: string | null; companies: string[] | null; positions: { department_id: string | null }[] } | null;
  const pr = profile.data as { company_id: string | null; department_id: string | null } | null;
  const brands = [...new Set([p?.company_id, ...(p?.companies ?? []), pr?.company_id].filter(Boolean) as string[])];
  const departments = [...new Set([pr?.department_id, ...(p?.positions ?? []).map(x => x.department_id)].filter(Boolean) as string[])];
  return { personId: p?.id ?? null, brands, departments };
}

export async function loadMyTraining(supabase: SupabaseClient, user: User) {
  const [modules, attempts, scope, profile] = await Promise.all([
    supabase.from("training_modules").select(MODULE_COLUMNS).eq("published", true),
    supabase.from("training_attempts").select("module_id, score, passed").eq("user_id", user.id),
    myScope(supabase, user),
    supabase.from("profiles").select("onboarded_at").eq("user_id", user.id).maybeSingle(),
  ]);
  const hire = scope.personId
    ? ((await supabase.from("new_hires").select(HIRE_COLUMNS).eq("person_id", scope.personId).maybeSingle()).data as NewHire | null)
    : null;
  return {
    path: trainingPath((modules.data as TrainingModule[] | null) ?? [], scope.brands, scope.departments),
    attempts: summarizeAttempts((attempts.data as AttemptRow[] | null) ?? []),
    hire,
    departments: scope.departments,
    brands: scope.brands,
    welcomeDone: !!(profile.data as { onboarded_at: string | null } | null)?.onboarded_at,
    modules: (modules.data as TrainingModule[] | null) ?? [],
  };
}

type AttemptRow = { module_id: string; score: number; passed: boolean };

/** A new hire's own path (their brand and departments, no samples) and their attempts. */
export function hirePath(modules: TrainingModule[], h: NewHire) {
  return trainingPath(modules, h.company_id ? [h.company_id] : [], [h.department_id, ...h.access_departments].filter(Boolean) as string[], false);
}

/** New hires the user can see (RLS: added by them, IT, admins, their department's leader), with tracker progress. */
export async function loadHires(supabase: SupabaseClient) {
  const [hires, people, modules] = await Promise.all([
    supabase.from("new_hires").select(HIRE_COLUMNS).neq("status", "cancelled").order("start_date", { ascending: true, nullsFirst: false }),
    supabase.from("people").select("id, full_name, user_id"),
    supabase.from("training_modules").select(MODULE_COLUMNS).eq("published", true),
  ]);
  const rows = (people.data as { id: string; full_name: string; user_id: string | null }[] | null) ?? [];
  const list = (hires.data as NewHire[] | null) ?? [];
  const userOf = new Map(rows.map(p => [p.id, p.user_id]));
  const users = list.map(h => userOf.get(h.person_id)).filter(Boolean) as string[];
  const [profiles, attempts] = users.length
    ? await Promise.all([
        supabase.from("profiles").select("user_id, onboarded_at").in("user_id", users),
        supabase.from("training_attempts").select("user_id, module_id, score, passed").in("user_id", users),
      ])
    : [{ data: [] }, { data: [] }];
  const welcomed = new Set(((profiles.data as { user_id: string; onboarded_at: string | null }[] | null) ?? []).filter(p => p.onboarded_at).map(p => p.user_id));
  const byUser = new Map<string, AttemptRow[]>();
  for (const a of (attempts.data as (AttemptRow & { user_id: string })[] | null) ?? []) byUser.set(a.user_id, [...(byUser.get(a.user_id) ?? []), a]);
  const mods = (modules.data as TrainingModule[] | null) ?? [];
  const progress: Record<string, HireProgress> = {};
  for (const h of list) {
    const u = userOf.get(h.person_id) ?? null;
    progress[h.id] = hireProgress(h, !!u && welcomed.has(u), hirePath(mods, h), summarizeAttempts(u ? byUser.get(u) ?? [] : []));
  }
  return {
    hires: list,
    progress,
    names: Object.fromEntries(rows.map(p => [p.id, p.full_name])) as Record<string, string>,
    userNames: Object.fromEntries(rows.filter(p => p.user_id).map(p => [p.user_id!, p.full_name])) as Record<string, string>,
  };
}

/** The people a new hire meets first: their manager, onboarding buddy and the leader who added them. */
export async function loadHireContacts(supabase: SupabaseClient, h: Pick<NewHire, "reports_to" | "buddy_id" | "created_by">) {
  const [byId, byUser] = await Promise.all([
    supabase.from("people").select("id, full_name, photo_url, email, slack_id, user_id, positions(title, department_id, sort)").in("id", [h.reports_to, h.buddy_id].filter(Boolean) as string[]),
    h.created_by
      ? supabase.from("people").select("id, full_name, photo_url, email, slack_id, user_id, positions(title, department_id, sort)").eq("user_id", h.created_by)
      : Promise.resolve({ data: [] }),
  ]);
  type Row = { id: string; full_name: string; photo_url: string | null; email: string | null; slack_id: string | null; user_id: string | null; positions: { title: string; department_id: string | null; sort: number }[] };
  const rows = [...((byId.data as Row[] | null) ?? []), ...((byUser.data as Row[] | null) ?? [])];
  const contact = (r: Row | undefined): HireContact | null => {
    if (!r) return null;
    const main = [...(r.positions ?? [])].sort((a, b) => a.sort - b.sort)[0];
    return { id: r.id, full_name: r.full_name, photo_url: r.photo_url, email: r.email, slack_id: r.slack_id, title: main?.title ?? "", department_id: main?.department_id ?? null };
  };
  return {
    manager: contact(rows.find(r => r.id === h.reports_to)),
    buddy: contact(rows.find(r => r.id === h.buddy_id)),
    addedBy: contact(rows.find(r => r.user_id === h.created_by)),
  };
}
