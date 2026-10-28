import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getDict } from "@/lib/i18n/server";
import { REQUIRED_TRAINING_COLUMNS, type RequiredTraining } from "@/lib/requiredTrainings";
import RequiredTrainingsEditor from "@/components/hr/RequiredTrainingsEditor";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getDict();
  return { title: `${t.requiredTrainings.manageTitle} · GMX Group Intranet` };
}

/** HR and admins: the mandatory trainings new hires take in Rippling (0035). */
export default async function RequiredTrainingsPage() {
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) redirect("/login");
  const { data: hr } = await supabase.rpc("is_hr_editor");
  if (hr !== true) redirect("/hr");
  const { data, error } = await supabase.from("required_trainings").select(REQUIRED_TRAINING_COLUMNS).order("sort");
  return <RequiredTrainingsEditor initial={(data as RequiredTraining[] | null) ?? []} error={error?.message ?? null} />;
}
