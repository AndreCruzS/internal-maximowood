import { notFound, redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { HIRE_COLUMNS, MODULE_COLUMNS, type NewHire, type TrainingModule } from "@/lib/onboarding";
import { hirePath, onboardingPermissions, summarizeAttempts } from "@/server/onboarding";
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
  const [perms, people, modules] = await Promise.all([
    onboardingPermissions(supabase),
    supabase.from("people").select("id, full_name, user_id").eq("active", true).order("full_name"),
    supabase.from("training_modules").select(MODULE_COLUMNS).eq("published", true),
  ]);
  const rows = (people.data as { id: string; full_name: string; user_id: string | null }[] | null) ?? [];
  const hireUser = rows.find(p => p.id === hire.person_id)?.user_id ?? null;
  const [attempts, profile] = hireUser
    ? await Promise.all([
        supabase.from("training_attempts").select("module_id, score, passed").eq("user_id", hireUser),
        supabase.from("profiles").select("onboarded_at").eq("user_id", hireUser).maybeSingle(),
      ])
    : [{ data: [] }, { data: null }];
  return (
    <HireDetail
      hire={hire}
      people={rows.filter(p => p.id !== hire.person_id).map(p => ({ id: p.id, full_name: p.full_name }))}
      names={Object.fromEntries(rows.map(p => [p.id, p.full_name]))}
      creator={rows.find(p => p.user_id === hire.created_by)?.full_name ?? null}
      canEditIt={perms.isIt}
      canEditPlan={perms.canAddHires || hire.created_by === user.id}
      canCancel={perms.canAddHires || hire.created_by === user.id}
      path={hirePath((modules.data as TrainingModule[] | null) ?? [], hire)}
      attempts={summarizeAttempts((attempts.data as { module_id: string; score: number; passed: boolean }[] | null) ?? [])}
      welcomeDone={!!(profile.data as { onboarded_at: string | null } | null)?.onboarded_at}
    />
  );
}
