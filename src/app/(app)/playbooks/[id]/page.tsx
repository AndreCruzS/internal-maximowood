import { notFound, redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin";
import { PLAYBOOK_COLUMNS, canEditDepartment, type Playbook } from "@/server/playbooks";
import PlaybookDetail from "@/components/playbooks/PlaybookDetail";

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
  const { data } = await supabase.from("playbooks").select(PLAYBOOK_COLUMNS).eq("id", id).maybeSingle();
  if (!data) notFound();
  const playbook = data as Playbook;
  const [acks, owner, canEdit] = await Promise.all([
    supabase.from("playbook_acks").select("user_id, acked_at").eq("playbook_id", id),
    playbook.owner_person_id ? supabase.from("people").select("full_name").eq("id", playbook.owner_person_id).maybeSingle() : Promise.resolve({ data: null }),
    canEditDepartment(supabase, playbook.department_id, isAdminUser(user)),
  ]);
  const ackRows = (acks.data as { user_id: string; acked_at: string }[] | null) ?? [];
  return (
    <PlaybookDetail
      playbook={playbook}
      ownerName={(owner.data as { full_name: string } | null)?.full_name ?? null}
      ackCount={ackRows.length}
      myAck={ackRows.find(a => a.user_id === user.id)?.acked_at ?? null}
      canEdit={canEdit}
    />
  );
}
