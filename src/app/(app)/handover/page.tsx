import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getDict } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/locale";
import { HANDOVER_COLUMNS, type HandoverRow } from "@/lib/handover";
import { HandoverForm, HandoverSummary, type PersonOption } from "@/components/onboarding/Handover";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getDict();
  return { title: `${t.handover.page} · GMX Group Intranet` };
}

/**
 * The offboarding handover. The person leaving fills theirs; a leader or HR opens
 * one with ?id=; whoever takes over sees what was handed to them.
 */
export default async function HandoverPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) redirect("/login");
  const { id } = await searchParams;
  const { t } = await getDict();

  const [mineRes, peopleRes, canAdd] = await Promise.all([
    supabase.rpc("my_handovers"),
    supabase.from("people").select("id, full_name").eq("active", true).order("full_name"),
    supabase.rpc("can_add_hires"),
  ]);
  const people = (peopleRes.data as PersonOption[] | null) ?? [];
  const names = Object.fromEntries(people.map(p => [p.id, p.full_name]));
  const mine = (mineRes.data as (HandoverRow & { mine: boolean })[] | null) ?? [];

  // A leader / HR opening someone's handover from the offboarding list or their profile.
  let opened: HandoverRow | null = null;
  if (id && /^[0-9a-f-]{36}$/i.test(id) && canAdd.data === true) {
    const { data } = await supabase.from("offboardings").select(`id, person_id, last_day, status, ${HANDOVER_COLUMNS}`).eq("id", id).maybeSingle();
    opened = (data as HandoverRow | null) ?? null;
    if (opened && !names[opened.person_id]) {
      const { data: p } = await supabase.from("people").select("full_name").eq("id", opened.person_id).maybeSingle();
      names[opened.person_id] = (p as { full_name: string } | null)?.full_name ?? "—";
    }
  }
  const own = mine.filter(r => r.mine);
  const takingOver = mine.filter(r => !r.mine && r.id !== opened?.id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href={opened ? "/onboarding?tab=offboarding" : "/"} className="inline-flex items-center gap-1 text-sm font-bold text-[#00704a] hover:underline">
        <ArrowLeft className="h-4 w-4" /> {opened ? t.offboarding.back : t.nav.home}
      </Link>
      <h1 className="text-3xl font-black text-gray-900">{t.handover.page}</h1>

      {opened && (
        opened.status === "requested"
          ? <HandoverForm row={opened} name={names[opened.person_id] ?? "—"} mine={false} people={people} />
          : <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><HandoverSummary row={opened} names={names} /></section>
      )}
      {!opened && own.map(r => <HandoverForm key={r.id} row={r} name={names[r.person_id] ?? ""} mine people={people} />)}

      {takingOver.map(r => (
        <section key={r.id} className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="font-black text-gray-900">{fmt(t.handover.takingOver, { name: names[r.person_id] ?? "—" })}</h2>
          <HandoverSummary row={r} names={names} />
        </section>
      ))}

      {!opened && !own.length && !takingOver.length && (
        <p className="rounded-xl border border-dashed border-gray-300 bg-white px-5 py-8 text-center text-sm text-gray-500">{t.handover.empty}</p>
      )}
    </div>
  );
}
