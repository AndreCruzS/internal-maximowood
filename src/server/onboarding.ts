import type { SupabaseClient, User } from "@supabase/supabase-js";
import { HIRE_COLUMNS, MODULE_COLUMNS, trainingPath, type AttemptSummary, type NewHire, type TrainingModule } from "@/lib/onboarding";
export type { AttemptSummary } from "@/lib/onboarding";

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
  const [modules, attempts, scope] = await Promise.all([
    supabase.from("training_modules").select(MODULE_COLUMNS).eq("published", true),
    supabase.from("training_attempts").select("module_id, score, passed").eq("user_id", user.id),
    myScope(supabase, user),
  ]);
  const hire = scope.personId
    ? ((await supabase.from("new_hires").select(HIRE_COLUMNS).eq("person_id", scope.personId).maybeSingle()).data as NewHire | null)
    : null;
  return {
    path: trainingPath((modules.data as TrainingModule[] | null) ?? [], scope.brands, scope.departments),
    attempts: summarizeAttempts((attempts.data as { module_id: string; score: number; passed: boolean }[] | null) ?? []),
    hire,
    departments: scope.departments,
  };
}

/** New hires the user can see (RLS: added by them, IT, admins, their department's leader). */
export async function loadHires(supabase: SupabaseClient) {
  const [hires, people] = await Promise.all([
    supabase.from("new_hires").select(HIRE_COLUMNS).neq("status", "cancelled").order("start_date", { ascending: true, nullsFirst: false }),
    supabase.from("people").select("id, full_name, user_id"),
  ]);
  const rows = (people.data as { id: string; full_name: string; user_id: string | null }[] | null) ?? [];
  return {
    hires: (hires.data as NewHire[] | null) ?? [],
    names: Object.fromEntries(rows.map(p => [p.id, p.full_name])) as Record<string, string>,
    userNames: Object.fromEntries(rows.filter(p => p.user_id).map(p => [p.user_id!, p.full_name])) as Record<string, string>,
  };
}
