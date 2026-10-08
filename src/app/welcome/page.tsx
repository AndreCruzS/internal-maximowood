import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getDict } from "@/lib/i18n/server";
import WelcomeWizard, { type WelcomePerson, type WelcomePosition } from "@/components/welcome/WelcomeWizard";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getDict();
  return { title: `${t.welcome.title} · GMX Group Intranet` };
}

/** First-sign-in questionnaire: links the login to the org chart and fills the directory. */
export default async function WelcomePage() {
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) redirect("/login");
  await supabase.rpc("ensure_my_profile");
  const [people, positions, relations] = await Promise.all([
    supabase
      .from("people")
      .select("id, full_name, first_name, last_name, nickname, nationality, location, office, languages, companies, birth_month, birth_day, start_date, start_year, user_id, email")
      .eq("active", true)
      .order("full_name"),
    supabase.from("positions").select("id, person_id, title, department_id, team, reports_to, sort").order("sort"),
    supabase.from("team_relations").select("person_id, other_person_id, relation"),
  ]);
  const all = (people.data as WelcomePerson[] | null) ?? [];
  const me = all.find(p => p.user_id === user.id) ?? null;
  return (
    <WelcomeWizard
      email={user.email ?? ""}
      metaName={(user.user_metadata?.name as string | undefined) ?? ""}
      people={all}
      positions={(positions.data as WelcomePosition[] | null) ?? []}
      me={me}
      savedTeam={((relations.data as { person_id: string; other_person_id: string; relation: string }[] | null) ?? []).filter(r => r.person_id === me?.id)}
    />
  );
}
