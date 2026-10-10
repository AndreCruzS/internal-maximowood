import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getDict } from "@/lib/i18n/server";
import { deptName } from "@/lib/i18n/text";
import { plural } from "@/lib/i18n/dictionaries";
import { companyInk, companyName, type CompanyId } from "@/lib/intranet";
import { MODULE_COLUMNS, trainingPath, type TrainingModule } from "@/lib/onboarding";
import { onboardingPermissions } from "@/server/onboarding";

export const dynamic = "force-dynamic";
export const metadata = { title: "Training courses · GMX Group Intranet" };

/** All training modules (drafts included), in path order: GMX, brands, departments. */
export default async function CoursesPage() {
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) redirect("/login");
  if (!(await onboardingPermissions(supabase)).canEditTraining) redirect("/onboarding");
  const [{ t }, modules, questions] = await Promise.all([
    getDict(),
    supabase.from("training_modules").select(MODULE_COLUMNS),
    supabase.from("training_questions").select("module_id"),
  ]);
  const all = (modules.data as TrainingModule[] | null) ?? [];
  const ordered = trainingPath(all.map(m => ({ ...m, published: true })), all.map(m => m.company_id ?? ""), all.map(m => m.department_id ?? ""))
    .map(m => all.find(x => x.id === m.id)!);
  const counts = new Map<string, number>();
  for (const q of (questions.data as { module_id: string }[] | null) ?? []) counts.set(q.module_id, (counts.get(q.module_id) ?? 0) + 1);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/onboarding" className="text-sm font-bold text-[#00704a] hover:underline">← {t.onboarding.title}</Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900">{t.training.editor}</h1>
          <p className="text-gray-500">{t.training.editorHint}</p>
        </div>
        <Link href="/onboarding/courses/new" className="flex h-10 items-center gap-1.5 rounded-lg bg-[#009f67] px-4 text-sm font-bold text-white">
          <Plus className="h-4 w-4" /> {t.training.newModule}
        </Link>
      </div>
      <ul className="space-y-2">
        {ordered.map(m => (
          <li key={m.id}>
            <Link href={`/onboarding/courses/${m.id}`} className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:border-[#009f67]">
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-black uppercase tracking-widest" style={{ color: m.scope === "brand" ? companyInk(m.company_id) : "#00704a" }}>
                  {m.scope === "gmx" ? t.training.scope.gmx : m.scope === "brand" ? companyName(m.company_id as CompanyId) : deptName(t, m.department_id)}
                </span>
                <span className="block font-bold text-gray-900">{m.title}</span>
                <span className="block text-xs text-gray-500">{t.training.kinds[m.content_kind]} · {plural(t.training, "questionsCount", counts.get(m.id) ?? 0)}</span>
              </span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${m.published ? "bg-[#e6f6f0] text-[#00704a]" : "bg-amber-100 text-amber-800"}`}>
                {m.published ? t.playbooks.publish : t.training.draft}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
