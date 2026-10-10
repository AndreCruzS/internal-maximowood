import { notFound, redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { LINK_COLUMNS } from "@/server/links";
import { loadMyTraining } from "@/server/onboarding";
import ModuleView from "@/components/onboarding/ModuleView";
import { firstOpenStep, type TrainingQuestion } from "@/lib/onboarding";
import type { LinkRow } from "@/components/resources/ResourceList";

export const dynamic = "force-dynamic";
export const metadata = { title: "Training · GMX Group Intranet" };

/** One training step: the presentation (or department resources), then its quiz. Locked until earlier steps pass. */
export default async function LearnPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) redirect("/login");
  const { path, attempts, hire } = await loadMyTraining(supabase, user);
  const index = path.findIndex(m => m.id === id);
  if (index === -1) notFound();
  if (index > firstOpenStep(path, attempts)) redirect("/onboarding");
  const mod = path[index];

  const [questions, links, access] = await Promise.all([
    supabase.from("training_questions").select("id, module_id, question, options, multiple, sort").eq("module_id", id).order("sort"),
    mod.content_kind === "resources" && mod.department_id
      ? supabase.from("links").select(LINK_COLUMNS).eq("department_id", mod.department_id).order("pinned", { ascending: false }).order("sort")
      : Promise.resolve({ data: [] }),
    mod.content_kind === "resources" ? supabase.rpc("my_departments") : Promise.resolve({ data: [] }),
  ]);

  return (
    <ModuleView
      module={mod}
      step={index + 1}
      total={path.length}
      nextId={path[index + 1]?.id ?? null}
      questions={(questions.data as TrainingQuestion[] | null) ?? []}
      best={attempts[id] ?? null}
      links={(links.data as LinkRow[] | null) ?? []}
      accounts={hire?.accounts ?? []}
      access={(access.data as string[] | null) ?? []}
    />
  );
}
