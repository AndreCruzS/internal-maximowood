import { notFound, redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin";
import { getDict } from "@/lib/i18n/server";
import { deptName } from "@/lib/i18n/text";
import { fmt } from "@/lib/i18n/locale";
import { canEditDepartment, selectPlaybooks, type Playbook } from "@/server/playbooks";
import PlaybookHistory, { type Version } from "@/components/playbooks/PlaybookHistory";

export const dynamic = "force-dynamic";
export const metadata = { title: "Version history · GMX Group Intranet" };

export default async function PlaybookHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) redirect("/login");
  const { data } = await selectPlaybooks(cols => supabase.from("playbooks").select(`${cols}, updated_by, created_by`).eq("id", id).maybeSingle());
  if (!data) notFound();
  const playbook = data as unknown as Playbook & { updated_by: string | null; created_by: string | null };
  if (!(await canEditDepartment(supabase, playbook.department_id, isAdminUser(user)))) {
    const { t } = await getDict();
    return <p className="rounded-xl border border-dashed border-gray-300 bg-white px-5 py-6 text-sm text-gray-500">{fmt(t.playbooks.onlyTeam, { dept: deptName(t, playbook.department_id) })}</p>;
  }
  const [versions, people] = await Promise.all([
    // Errors (→ no history) until migration 0019.
    supabase.from("playbook_versions").select("version, snapshot, edited_by, edited_at").eq("playbook_id", id).order("version", { ascending: false }).limit(100),
    supabase.from("people").select("id, full_name, user_id"),
  ]);
  const everyone = (people.data as { id: string; full_name: string; user_id: string | null }[] | null) ?? [];
  return (
    <PlaybookHistory
      playbook={playbook}
      currentBy={playbook.updated_by ?? playbook.created_by}
      versions={(versions.data as Version[] | null) ?? []}
      names={Object.fromEntries(everyone.map(p => [p.id, p.full_name]))}
      userNames={Object.fromEntries(everyone.filter(p => p.user_id).map(p => [p.user_id!, p.full_name]))}
    />
  );
}
