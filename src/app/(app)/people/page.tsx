import { getSupabaseServer } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin";
import { selectCompat } from "@/server/compat";
import PeopleView, { type Person, type Position } from "@/components/PeopleView";

export const dynamic = "force-dynamic";
export const metadata = { title: "People · GMX Group Intranet" };

const BASE_COLUMNS =
  "id, full_name, email, phone, location, photo_url, company_id, user_id, languages, office, birth_month, birth_day, start_date, skills, start_year, nickname, nationality, companies, slack_id";

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ person?: string; dept?: string }> }) {
  const { person, dept } = await searchParams;
  const supabase = await getSupabaseServer();
  if (!supabase) return <p className="text-sm text-red-700">Supabase is not configured.</p>;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [people, positions] = await Promise.all([
    // Newest columns first (rippling_id: 0025, headline/pronouns: 0015), older lists while a migration is pending.
    selectCompat(
      cols => selectCompat(c => supabase.from("people").select(c).eq("active", true).order("full_name"), cols, `${BASE_COLUMNS}, headline, pronouns`),
      `${BASE_COLUMNS}, headline, pronouns, rippling_id`,
      BASE_COLUMNS,
    ),
    selectCompat(
      cols => supabase.from("positions").select(cols).order("sort"),
      "id, person_id, title, department_id, team, reports_to, sort, level",
      "id, person_id, title, department_id, team, reports_to, sort", // before migration 0020
    ),
  ]);
  const error = people.error?.message ?? positions.error?.message ?? null;
  return (
    <PeopleView
      people={(people.data as Person[] | null) ?? []}
      positions={(positions.data as unknown as Position[] | null) ?? []}
      me={user?.id ?? null}
      isAdmin={isAdminUser(user)}
      error={error}
      initialPerson={person ?? null}
      initialDept={dept ?? null}
    />
  );
}
