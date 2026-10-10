import { notFound, redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { MODULE_COLUMNS, type TrainingModule, type TrainingQuestion } from "@/lib/onboarding";
import { onboardingPermissions } from "@/server/onboarding";
import ModuleEditor, { type EditorQuestion } from "@/components/onboarding/ModuleEditor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit training module · GMX Group Intranet" };

export default async function ModuleEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) redirect("/login");
  if (!(await onboardingPermissions(supabase)).canEditTraining) redirect("/onboarding");
  if (id === "new") return <ModuleEditor module={null} questions={[]} />;

  const { data } = await supabase.from("training_modules").select(MODULE_COLUMNS).eq("id", id).maybeSingle();
  if (!data) notFound();
  const { data: qs } = await supabase.from("training_questions").select("id, module_id, question, options, multiple, sort").eq("module_id", id).order("sort");
  const questions = (qs as TrainingQuestion[] | null) ?? [];
  const { data: ans } = questions.length
    ? await supabase.from("training_answers").select("question_id, correct, explanation").in("question_id", questions.map(q => q.id))
    : { data: [] };
  const byQ = new Map(((ans as { question_id: string; correct: number[]; explanation: string }[] | null) ?? []).map(a => [a.question_id, a]));
  const merged: EditorQuestion[] = questions.map(q => ({
    question: q.question, options: q.options, multiple: q.multiple, correct: byQ.get(q.id)?.correct ?? [], explanation: byQ.get(q.id)?.explanation ?? "",
  }));
  return <ModuleEditor module={data as TrainingModule} questions={merged} />;
}
