import { notFound, redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { HIRE_COLUMNS, MODULE_COLUMNS, trainingPath, type NewHire, type TrainingModule } from "@/lib/onboarding";
import { onboardingPermissions, summarizeAttempts } from "@/server/onboarding";
import HireDetail from "@/components/onboarding/HireDetail";

export const dynamic = "force-dynamic";
export const metadata = { title: "New hire · GMX Group Intranet" };

export default async function HirePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) redirect("/login");
  const { data } = await supabase.from("new_hires").select(HIRE_COLUMNS).eq("id", id).maybeSingle();
  if (!data) notFound();
  const hire = data as NewHire;
  const [perms, people, person, modules] = await Promise.all([
    onboardingPermissions(supabase),
    supabase.from("people").select("id, full_name, user_id"),
    supabase.from("people").select("user_id").eq("id", hire.person_id).maybeSingle(),
    supabase.from("training_modules").select(MODULE_COLUMNS).eq("published", true),
  ]);
  const hireUser = (person.data as { user_id: string | null } | null)?.user_id ?? null;
  const attempts = hireUser
    ? ((await supabase.from("training_attempts").select("module_id, score, passed").eq("user_id", hireUser)).data as { module_id: string; score: number; passed: boolean }[] | null) ?? []
    : [];
  const rows = (people.data as { id: string; full_name: string; user_id: string | null }[] | null) ?? [];
  return (
    <HireDetail
      hire={hire}
      names={Object.fromEntries(rows.map(p => [p.id, p.full_name]))}
      creator={rows.find(p => p.user_id === hire.created_by)?.full_name ?? null}
      canEditIt={perms.isIt}
      canCancel={perms.canAddHires || hire.created_by === user.id}
      path={trainingPath((modules.data as TrainingModule[] | null) ?? [], hire.company_id ? [hire.company_id] : [], hire.department_id ? [hire.department_id] : [])}
      attempts={summarizeAttempts(attempts)}
    />
  );
}
