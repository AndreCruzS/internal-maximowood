"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Cake, Check, Loader2, MapPin, PartyPopper } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { LANGUAGES, MONTHS, OFFICES, officeById, yearsSince } from "@/lib/intranet";

export type MyPerson = {
  id: string;
  full_name: string;
  phone: string | null;
  languages: string[];
  office: string | null;
  birth_month: number | null;
  birth_day: number | null;
  start_date: string | null;
};

const field = "h-9 w-full rounded-lg border border-gray-300 bg-white px-2.5 text-sm outline-none focus:border-[#009f67]";
const label = "mb-1 block text-xs font-bold text-gray-500";

/** Personal details people keep themselves: languages, office, birthday, start date, phone. */
export default function AboutMeCard({ person }: { person: MyPerson | null }) {
  const router = useRouter();
  const [draft, setDraft] = useState({
    phone: person?.phone ?? "",
    languages: person?.languages ?? [],
    office: person?.office ?? "",
    birth_month: person?.birth_month ? String(person.birth_month) : "",
    birth_day: person?.birth_day ? String(person.birth_day) : "",
    start_date: person?.start_date ?? "",
  });
  const [busy, setBusy] = useState(false);

  if (!person) {
    return (
      <section className="rounded-xl border-2 border-[#009f67] bg-[#f2fbf7] p-5">
        <h2 className="font-black text-gray-900">About me</h2>
        <p className="mt-1 text-sm text-gray-600">
          First, find yourself in the org chart so your profile is linked to it.
        </p>
        <Link href="/people" className="mt-3 inline-block rounded-lg bg-[#009f67] px-4 py-2 text-sm font-bold text-white">
          Go to People
        </Link>
      </section>
    );
  }

  const toggleLang = (l: string) =>
    setDraft(d => ({ ...d, languages: d.languages.includes(l) ? d.languages.filter(x => x !== l) : [...d.languages, l] }));

  const save = async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    if (!!draft.birth_month !== !!draft.birth_day) return toast.error("Pick both the day and the month of your birthday.");
    setBusy(true);
    const { error } = await supabase
      .from("people")
      .update({
        phone: draft.phone.trim() || null,
        languages: draft.languages,
        office: draft.office || null,
        birth_month: draft.birth_month ? Number(draft.birth_month) : null,
        birth_day: draft.birth_day ? Number(draft.birth_day) : null,
        start_date: draft.start_date || null,
      })
      .eq("id", person.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Profile updated");
    router.refresh();
  };

  const office = officeById(draft.office);
  const years = draft.start_date ? yearsSince(draft.start_date) : null;
  const daysInMonth = draft.birth_month ? new Date(2024, Number(draft.birth_month), 0).getDate() : 31;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm lg:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-black text-gray-900">About me</h2>
          <p className="text-sm text-gray-500">Shown on your People card and the org chart.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-bold">
          {office && (
            <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-gray-700">
              <MapPin className="h-3.5 w-3.5" /> {office.name}
            </span>
          )}
          {draft.birth_month && draft.birth_day && (
            <span className="flex items-center gap-1 rounded-full bg-pink-50 px-2.5 py-1 text-pink-700">
              <Cake className="h-3.5 w-3.5" /> {MONTHS[Number(draft.birth_month) - 1]} {draft.birth_day}
            </span>
          )}
          {years !== null && (
            <span className="flex items-center gap-1 rounded-full bg-[#e6f6f0] px-2.5 py-1 text-[#00704a]">
              <PartyPopper className="h-3.5 w-3.5" /> {years === 0 ? "Joined this year" : `${years} year${years === 1 ? "" : "s"} with us`}
            </span>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className={label} htmlFor="office">Office</label>
          <select id="office" value={draft.office} onChange={e => setDraft(d => ({ ...d, office: e.target.value }))} className={field}>
            <option value="">Choose…</option>
            {OFFICES.map(o => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </div>
        <div>
          <span className={label}>Birthday</span>
          <div className="flex gap-2">
            <select aria-label="Birthday month" value={draft.birth_month} onChange={e => setDraft(d => ({ ...d, birth_month: e.target.value }))} className={field}>
              <option value="">Month</option>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </select>
            <select aria-label="Birthday day" value={draft.birth_day} onChange={e => setDraft(d => ({ ...d, birth_day: e.target.value }))} className={`${field} w-24`}>
              <option value="">Day</option>
              {Array.from({ length: daysInMonth }, (_, i) => (
                <option key={i + 1} value={i + 1}>{i + 1}</option>
              ))}
            </select>
          </div>
          <p className="mt-1 text-[11px] text-gray-400">Day and month only — your age isn&apos;t shown.</p>
        </div>
        <div>
          <label className={label} htmlFor="start">Started at GMX Group</label>
          <input id="start" type="date" min="1990-01-01" value={draft.start_date} onChange={e => setDraft(d => ({ ...d, start_date: e.target.value }))} className={field} />
        </div>
        <div>
          <label className={label} htmlFor="phone">Phone / WhatsApp</label>
          <input id="phone" value={draft.phone} onChange={e => setDraft(d => ({ ...d, phone: e.target.value }))} placeholder="+55 41 99999 0000" className={field} />
        </div>
      </div>

      <div className="mt-4">
        <span className={label}>Languages I speak</span>
        <div className="flex flex-wrap gap-2">
          {LANGUAGES.map(l => {
            const on = draft.languages.includes(l);
            return (
              <button
                key={l}
                type="button"
                onClick={() => toggleLang(l)}
                aria-pressed={on}
                className={`flex items-center gap-1 rounded-full border px-3 py-1 text-sm font-bold transition-colors ${
                  on ? "border-[#009f67] bg-[#e6f6f0] text-[#00704a]" : "border-gray-300 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {on && <Check className="h-3.5 w-3.5" />} {l}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 border-t border-gray-100 pt-4">
        <Link href="/people" className="text-sm font-bold text-[#00704a] hover:underline">
          Edit my position in the org chart →
        </Link>
        <button type="button" onClick={save} disabled={busy} className="flex h-9 items-center gap-2 rounded-lg bg-[#009f67] px-5 text-sm font-bold text-white disabled:opacity-50">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save
        </button>
      </div>
    </section>
  );
}
