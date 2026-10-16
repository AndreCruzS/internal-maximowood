import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { DEPARTMENTS, departmentById } from "@/lib/intranet";
import { getSupabaseServer } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin";
import { getDict } from "@/lib/i18n/server";
import { deptName } from "@/lib/i18n/text";
import { loadLinks } from "@/server/links";
import { selectPlaybooks, canEditDepartment, type Playbook } from "@/server/playbooks";
import DepartmentView, { type TeamMember } from "@/components/DepartmentView";
import type { Faq } from "@/components/help/FaqList";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return DEPARTMENTS.map(d => ({ id: d.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const { t } = await getDict();
  return { title: departmentById(id) ? `${deptName(t, id)} · GMX Group Intranet` : "GMX Group Intranet" };
}

type Pos = { id: string; title: string; team: string | null; sort: number; people: { id: string; full_name: string; photo_url: string | null; active: boolean } | null };

export default async function DepartmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dept = departmentById(id);
  if (!dept) notFound();
  const supabase = await getSupabaseServer();
  if (!supabase) notFound();
  const user = (await supabase.auth.getUser()).data.user;
  const [{ links, owners }, faqs, playbooks, positions, names, canEdit] = await Promise.all([
    loadLinks(supabase, id),
    supabase.from("faqs").select("id, department_id, question, answer, language, sort").eq("department_id", id),
    selectPlaybooks(cols => supabase.from("playbooks").select(cols).eq("department_id", id).order("updated_at", { ascending: false })),
    supabase.from("positions").select("id, title, team, sort, people(id, full_name, photo_url, active)").eq("department_id", id).order("sort"),
    supabase.from("people").select("id, full_name"),
    canEditDepartment(supabase, id, isAdminUser(user)),
  ]);

  // One row per person (someone can hold several positions in the same department).
  const team: TeamMember[] = [];
  for (const p of (positions.data as unknown as Pos[] | null) ?? []) {
    if (!p.people || !p.people.active) continue;
    const existing = team.find(m => m.personId === p.people!.id);
    if (existing) existing.titles.push(p.title);
    else team.push({ personId: p.people.id, name: p.people.full_name, photo: p.people.photo_url, titles: [p.title], team: p.team });
  }

  return (
    <DepartmentView
      id={dept.id}
      links={links}
      owners={owners}
      faqs={(faqs.data as Faq[] | null) ?? []}
      playbooks={(playbooks.data as Playbook[] | null) ?? []}
      peopleNames={Object.fromEntries(((names.data as { id: string; full_name: string }[] | null) ?? []).map(p => [p.id, p.full_name]))}
      team={team}
      canEdit={canEdit}
    />
  );
}
