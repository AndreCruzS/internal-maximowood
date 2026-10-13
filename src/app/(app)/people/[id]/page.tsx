import { notFound, redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import PersonProfile, { type ProfileKudo } from "@/components/people/PersonProfile";
import type { Person, Position } from "@/components/PeopleView";
import { PROFILE_COLUMNS } from "@/lib/profile";
import type { OpenOffboarding } from "@/components/onboarding/OffboardPanel";
import { selectCompat } from "@/server/compat";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServer();
  const { data } = supabase ? await supabase.from("people").select("full_name").eq("id", id).maybeSingle() : { data: null };
  return { title: `${(data as { full_name: string } | null)?.full_name ?? "Profile"} · GMX Group Intranet` };
}

/** Someone's full profile page. */
export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) redirect("/login");
  const [person, positions, people, kudos] = await Promise.all([
    supabase.from("people").select(PROFILE_COLUMNS).eq("id", id).maybeSingle(),
    supabase.from("positions").select("id, person_id, title, department_id, team, reports_to, sort").order("sort"),
    supabase.from("people").select("id, full_name, photo_url").eq("active", true),
    selectCompat(
      cols => supabase.from("kudos").select(cols).eq("to_person_id", id).order("created_at", { ascending: false }).limit(6),
      "id, from_person_id, message, created_at, category, gif",
      "id, from_person_id, message, created_at, category",
    ),
  ]);
  if (!person.data) notFound();
  const p = person.data as Person;
  const [canOffboard, offboarding] = await Promise.all([
    supabase.rpc("can_add_hires"),
    supabase.from("offboardings").select("id, last_day, notes").eq("person_id", id).eq("status", "requested").maybeSingle(),
  ]);
  return (
    <PersonProfile
      person={p}
      positions={(positions.data as Position[] | null) ?? []}
      people={(people.data as Pick<Person, "id" | "full_name" | "photo_url">[] | null) ?? []}
      kudos={(kudos.data as ProfileKudo[] | null) ?? []}
      isMe={p.user_id === user.id}
      offboard={canOffboard.data === true && p.user_id !== user.id ? { open: (offboarding.data as OpenOffboarding) ?? null } : null}
    />
  );
}
