import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getDict } from "@/lib/i18n/server";
import { HIRE_COLUMNS, MODULE_COLUMNS, PLAN_PHASES, type NewHire, type TrainingModule } from "@/lib/onboarding";
import { hirePath, loadHireContacts, loadMyTraining, onboardingPermissions, summarizeAttempts } from "@/server/onboarding";
import NewHireHome from "@/components/onboarding/NewHireHome";

export const dynamic = "force-dynamic";
export const metadata = { title: "Onboarding preview · GMX Group Intranet" };

const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/**
 * What a new hire sees on their onboarding page. ?hire=<id> previews a real hire;
 * without it, a made-up hire (with the sample training) shows the whole flow.
 */
export default async function PreviewPage({ searchParams }: { searchParams: Promise<{ hire?: string }> }) {
  const { hire: hireId } = await searchParams;
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) redirect("/login");
  const [{ t }, perms] = await Promise.all([getDict(), onboardingPermissions(supabase)]);
  if (!perms.canAddHires && !perms.canEditTraining && !perms.isIt) redirect("/onboarding");

  const back = (
    <Link href={hireId ? `/onboarding/hires/${hireId}` : "/onboarding"} className="text-sm font-bold text-[#00704a] hover:underline">
      {hireId ? t.prehire.backToHire : t.prehire.backToOnboarding}
    </Link>
  );

  if (hireId) {
    const { data } = await supabase.from("new_hires").select(HIRE_COLUMNS).eq("id", hireId).maybeSingle();
    if (!data) notFound();
    const hire = data as NewHire;
    const [contacts, modules, person] = await Promise.all([
      loadHireContacts(supabase, hire),
      supabase.from("training_modules").select(MODULE_COLUMNS).eq("published", true),
      supabase.from("people").select("user_id").eq("id", hire.person_id).maybeSingle(),
    ]);
    const hireUser = (person.data as { user_id: string | null } | null)?.user_id ?? null;
    const [attempts, profile] = hireUser
      ? await Promise.all([
          supabase.from("training_attempts").select("module_id, score, passed").eq("user_id", hireUser),
          supabase.from("profiles").select("onboarded_at").eq("user_id", hireUser).maybeSingle(),
        ])
      : [{ data: [] }, { data: null }];
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        {back}
        <NewHireHome preview trainingLinks={false} hire={hire} firstName={hire.full_name.split(" ")[0]} contacts={contacts}
          path={hirePath((modules.data as TrainingModule[] | null) ?? [], hire)}
          attempts={summarizeAttempts((attempts.data as { module_id: string; score: number; passed: boolean }[] | null) ?? [])}
          welcomeDone={!!(profile.data as { onboarded_at: string | null } | null)?.onboarded_at} />
      </div>
    );
  }

  // Demo: a made-up hire reporting to the viewer, with the viewer's own training path (including the sample modules).
  const training = await loadMyTraining(supabase, user);
  const start = daysFromNow(3);
  const demo: NewHire = {
    id: "demo", person_id: "demo", full_name: t.roadmap.demoName, personal_email: "jordan@example.com", title: t.roadmap.demoTitle,
    department_id: "commercial", reports_to: null, company_id: "maximo", start_date: start, needs_email: true, needs_phone: true,
    phone_area_code: "305", access_departments: [], notes: "", company_email: "jordan.rivera@maximowood.com", phone_number: "+1 305 555 0100",
    accounts: [
      { name: "Gmail", login: "jordan.rivera@maximowood.com", url: "https://mail.google.com" },
      { name: "Slack", login: "jordan.rivera@maximowood.com", url: "https://gmxg.slack.com" },
      { name: "RingCentral", login: "+1 305 555 0100", url: "https://app.ringcentral.com" },
    ],
    it_notes: "", status: "ready", it_done_at: null, linked_at: null, created_by: user.id, created_at: "",
    buddy_id: null, first_day: t.roadmap.demoFirstDay, checklist: {},
    plan: PLAN_PHASES.flatMap(phase => t.prehire.template[phase].map(text => ({ phase, text }))),
  };
  const contacts = await loadHireContacts(supabase, demo);
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {back}
      <NewHireHome preview hire={demo} firstName={demo.full_name.split(" ")[0]} contacts={{ ...contacts, manager: contacts.addedBy }}
        path={training.path} attempts={training.attempts} welcomeDone />
    </div>
  );
}
