import Link from "next/link";
import { redirect } from "next/navigation";
import { selectCompat } from "@/server/compat";
import { HANDOVER_COLUMNS } from "@/lib/handover";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getDict } from "@/lib/i18n/server";
import Checklist from "@/components/onboarding/Checklist";
import TrainingPath from "@/components/onboarding/TrainingPath";
import HireList from "@/components/onboarding/HireList";
import NewHireHome from "@/components/onboarding/NewHireHome";
import OffboardingList, { type OffboardingRow } from "@/components/onboarding/OffboardingList";
import type { OnboardingItem } from "@/server/intranet";
import { loadHireContacts, loadHires, loadMyTraining, loadRequiredTrainings, onboardingPermissions } from "@/server/onboarding";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getDict();
  return { title: `${t.onboarding.title} · GMX Group Intranet` };
}

type Tab = "mine" | "hires" | "it" | "offboarding";

/**
 * Onboarding, both ways: "My onboarding" (training path + first-steps checklist)
 * for everyone; "New hires" for leaders and admins; "IT setup" for the IT team.
 */
export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) redirect("/login");
  const { tab: raw } = await searchParams;
  const [{ t }, perms] = await Promise.all([getDict(), onboardingPermissions(supabase)]);

  const tabs: Tab[] = ["mine", ...(perms.canAddHires ? (["hires"] as const) : []), ...(perms.isIt ? (["it"] as const) : []),
    ...(perms.canAddHires || perms.isIt ? (["offboarding"] as const) : [])];
  const tab: Tab = tabs.includes(raw as Tab) ? (raw as Tab) : "mine";

  let body: React.ReactNode;
  if (tab === "mine") {
    const [training, items, progress] = await Promise.all([
      loadMyTraining(supabase, user),
      supabase.from("onboarding_items").select("id, title, description, link, department_id, sort").order("sort"),
      supabase.from("onboarding_progress").select("item_id").eq("user_id", user.id),
    ]);
    const checklist = (
      <Checklist
        items={(items.data as OnboardingItem[] | null) ?? []}
        done={((progress.data as { item_id: string }[] | null) ?? []).map(p => p.item_id)}
      />
    );
    // New hires get their full onboarding page; everyone else their training and the first-steps checklist.
    if (training.hire) {
      const [contacts, required] = await Promise.all([loadHireContacts(supabase, training.hire), loadRequiredTrainings(supabase, training.hire.person_id)]);
      return (
        <div className="mx-auto max-w-5xl space-y-8">
          <NewHireHome hire={training.hire} firstName={training.hire.full_name.split(" ")[0]} contacts={contacts}
            path={training.path} attempts={training.attempts} welcomeDone={training.welcomeDone} required={required} />
          {checklist}
        </div>
      );
    }
    body = (
      <div className="space-y-8">
        <TrainingPath path={training.path} attempts={training.attempts} />
        {checklist}
      </div>
    );
  } else if (tab === "offboarding") {
    const [rows, people] = await Promise.all([
      selectCompat(
        cols => supabase.from("offboardings").select(cols).neq("status", "cancelled").order("last_day", { ascending: false }).limit(100),
        `id, person_id, last_day, notes, status, created_by, created_at, done_at, ${HANDOVER_COLUMNS}`,
        "id, person_id, last_day, notes, status, created_by, created_at, done_at",
      ),
      supabase.from("people").select("id, full_name, user_id"),
    ]);
    const list = (people.data as { id: string; full_name: string; user_id: string | null }[] | null) ?? [];
    body = (
      <OffboardingList
        rows={(rows.data as OffboardingRow[] | null) ?? []}
        names={Object.fromEntries(list.map(p => [p.id, p.full_name]))}
        userNames={Object.fromEntries(list.filter(p => p.user_id).map(p => [p.user_id!, p.full_name]))}
        isIt={perms.isIt}
      />
    );
  } else {
    const { hires, progress, names, userNames } = await loadHires(supabase);
    const list = tab === "it" ? hires.filter(h => h.status === "it_setup") : hires;
    body = <HireList hires={list} progress={progress} names={names} userNames={userNames} mode={tab} canAdd={perms.canAddHires} />;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900">{t.onboarding.title}</h1>
          <p className="text-gray-500">{t.onboarding.subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(perms.canAddHires || perms.canEditTraining) && (
            <Link href="/onboarding/preview" className="flex h-9 items-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-bold text-gray-800 hover:bg-gray-50">
              {t.prehire.previewDemo}
            </Link>
          )}
          {perms.canEditTraining && (
            <Link href="/onboarding/courses" className="flex h-9 items-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-bold text-gray-800 hover:bg-gray-50">
              {t.hires.tabs.courses}
            </Link>
          )}
        </div>
      </div>
      {tabs.length > 1 && (
        <nav className="flex rounded-lg border border-gray-200 bg-white p-0.5 text-sm font-bold" aria-label={t.onboarding.title}>
          {tabs.map(id => (
            <Link key={id} href={id === "mine" ? "/onboarding" : `/onboarding?tab=${id}`} aria-current={tab === id ? "page" : undefined}
              className={`flex-1 rounded-md px-3 py-1.5 text-center ${tab === id ? "bg-[#009f67] text-white" : "text-gray-500 hover:text-gray-900"}`}>
              {t.hires.tabs[id]}
            </Link>
          ))}
        </nav>
      )}
      {body}
    </div>
  );
}
