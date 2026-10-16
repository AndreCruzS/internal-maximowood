import { notFound, redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin";
import { selectCompat } from "@/server/compat";
import { canAssignPlaybook, canEditDepartment, selectPlaybooks, type Playbook } from "@/server/playbooks";
import { ackIsCurrent } from "@/lib/playbooks";
import PlaybookDetail, { type Assignment } from "@/components/playbooks/PlaybookDetail";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServer();
  const { data } = supabase ? await supabase.from("playbooks").select("title").eq("id", id).maybeSingle() : { data: null };
  return { title: `${data?.title ?? "Playbook"} · GMX Group Intranet` };
}

export default async function PlaybookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) redirect("/login");
  const { data } = await selectPlaybooks(cols => supabase.from("playbooks").select(cols).eq("id", id).maybeSingle());
  if (!data) notFound();
  const playbook = data as unknown as Playbook;
  const [acks, people, canEdit, canAssign, assignments, positions] = await Promise.all([
    selectCompat(
      cols => supabase.from("playbook_acks").select(cols).eq("playbook_id", id),
      "user_id, acked_at, version",
      "user_id, acked_at",
    ),
    supabase.from("people").select("id, full_name, user_id, active").order("full_name"),
    canEditDepartment(supabase, playbook.department_id, isAdminUser(user)),
    canAssignPlaybook(supabase, id),
    // Before migration 0019 this errors and the panel stays empty.
    supabase.from("playbook_assignments").select("id, person_id, assigned_by_person_id, due_on, note, created_at, completed_at").eq("playbook_id", id).order("created_at", { ascending: false }),
    supabase.from("positions").select("person_id, department_id"),
  ]);
  const everyone = (people.data as { id: string; full_name: string; user_id: string | null; active: boolean }[] | null) ?? [];
  const names = Object.fromEntries(everyone.map(p => [p.id, p.full_name]));
  const myPersonId = everyone.find(p => p.user_id === user.id)?.id ?? null;
  const ackRows = (acks.data as unknown as { user_id: string; acked_at: string; version?: number }[] | null) ?? [];
  const mine = ackRows.find(a => a.user_id === user.id) ?? null;
  const rows = (assignments.data as Assignment[] | null) ?? [];

  // People by department, for "add a whole department" when assigning.
  const byDept: Record<string, string[]> = {};
  for (const p of (positions.data as { person_id: string; department_id: string | null }[] | null) ?? []) {
    if (!p.department_id) continue;
    const list = (byDept[p.department_id] ??= []);
    if (!list.includes(p.person_id)) list.push(p.person_id);
  }

  return (
    <PlaybookDetail
      playbook={playbook}
      names={names}
      ackCount={ackRows.filter(a => ackIsCurrent(a.version ?? 1, playbook)).length}
      myAck={mine ? { at: mine.acked_at, version: mine.version ?? 1 } : null}
      canEdit={canEdit}
      canAssign={canAssign}
      assignments={canAssign ? rows : []}
      myAssignment={rows.find(a => a.person_id === myPersonId && !a.completed_at) ?? null}
      people={canAssign ? everyone.filter(p => p.active).map(p => ({ id: p.id, full_name: p.full_name })) : []}
      departments={canAssign ? byDept : {}}
      myPersonId={myPersonId}
    />
  );
}
