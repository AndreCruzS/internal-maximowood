import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import AssignmentsView, { type TrackedAssignment } from "@/components/playbooks/AssignmentsView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Assignments · GMX Group Intranet" };

/** Who has read the playbooks sent to them. Each person sees what the database lets them (their team's, or all for leaders/HR/admins). */
export default async function AssignmentsPage({ searchParams }: { searchParams: Promise<{ dept?: string }> }) {
  const { dept } = await searchParams;
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) redirect("/login");
  const [rows, people] = await Promise.all([
    supabase
      .from("playbook_assignments")
      .select("id, playbook_id, person_id, assigned_by_person_id, due_on, note, created_at, completed_at, playbooks(title, department_id)")
      .order("created_at", { ascending: false })
      .limit(2000),
    supabase.from("people").select("id, full_name, photo_url"),
  ]);
  const everyone = (people.data as { id: string; full_name: string; photo_url: string | null }[] | null) ?? [];
  return (
    <AssignmentsView
      rows={(rows.data as unknown as TrackedAssignment[] | null) ?? []}
      people={Object.fromEntries(everyone.map(p => [p.id, { name: p.full_name, photo: p.photo_url }]))}
      initialDept={dept ?? ""}
    />
  );
}
