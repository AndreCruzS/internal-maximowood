import { notFound, redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin";
import { getDict } from "@/lib/i18n/server";
import { deptName } from "@/lib/i18n/text";
import { fmt } from "@/lib/i18n/locale";
import { selectPlaybooks, canEditDepartment, type Playbook } from "@/server/playbooks";
import { loadEditorData } from "@/server/playbookEditor";
import PlaybookEditor from "@/components/playbooks/PlaybookEditor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit playbook · GMX Group Intranet" };

export default async function EditPlaybookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) redirect("/login");
  const { data } = await selectPlaybooks(cols => supabase.from("playbooks").select(cols).eq("id", id).maybeSingle());
  if (!data) notFound();
  const playbook = data as Playbook;
  if (!(await canEditDepartment(supabase, playbook.department_id, isAdminUser(user)))) {
    const { t } = await getDict();
    return <p className="rounded-xl border border-dashed border-gray-300 bg-white px-5 py-6 text-sm text-gray-500">{fmt(t.playbooks.onlyTeam, { dept: deptName(t, playbook.department_id) })}</p>;
  }
  const { people, categories } = await loadEditorData(supabase, playbook.department_id);
  return <PlaybookEditor department={playbook.department_id} playbook={playbook} people={people} categories={categories} />;
}
