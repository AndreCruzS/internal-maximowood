import { getSupabaseServer } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin";
import PeopleView, { type Person, type Position } from "@/components/PeopleView";

export const dynamic = "force-dynamic";
export const metadata = { title: "People · GMX Group Intranet" };

export default async function PeoplePage() {
  const supabase = await getSupabaseServer();
  if (!supabase) return <p className="text-sm text-red-700">Supabase is not configured.</p>;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [people, positions] = await Promise.all([
    supabase.from("people").select("id, full_name, email, phone, location, photo_url, company_id, user_id, languages, office, birth_month, birth_day, start_date").eq("active", true).order("full_name"),
    supabase.from("positions").select("id, person_id, title, department_id, team, reports_to, sort").order("sort"),
  ]);
  const error = people.error?.message ?? positions.error?.message ?? null;
  return (
    <PeopleView
      people={(people.data as Person[] | null) ?? []}
      positions={(positions.data as Position[] | null) ?? []}
      me={user?.id ?? null}
      isAdmin={isAdminUser(user)}
      error={error}
    />
  );
}
