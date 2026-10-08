"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Cake, Check, Loader2, MapPin, PartyPopper, X } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { LANGUAGES, OFFICES, officeById, yearsSince } from "@/lib/intranet";
import { useI18n } from "@/components/I18nProvider";
import { plural } from "@/lib/i18n/dictionaries";
import { monthName } from "@/lib/i18n/text";

export type MyPerson = {
  id: string;
  full_name: string;
  phone: string | null;
  languages: string[];
  office: string | null;
  birth_month: number | null;
  birth_day: number | null;
  start_date: string | null;
  skills?: string[] | null;
};

const field = "h-9 w-full rounded-lg border border-gray-300 bg-white px-2.5 text-sm outline-none focus:border-[#009f67]";
const label = "mb-1 block text-xs font-bold text-gray-500";

/** Personal details people keep themselves: office, birthday, start date, phone, languages, "ask me about". */
export default function AboutMeCard({ person }: { person: MyPerson | null }) {
  const router = useRouter();
  const { t, tag } = useI18n();
  const [draft, setDraft] = useState({
    phone: person?.phone ?? "",
    languages: person?.languages ?? [],
    office: person?.office ?? "",
    birth_month: person?.birth_month ? String(person.birth_month) : "",
    birth_day: person?.birth_day ? String(person.birth_day) : "",
    start_date: person?.start_date ?? "",
    skills: person?.skills ?? [],
  });
  const [skill, setSkill] = useState("");
  const [busy, setBusy] = useState(false);

  if (!person) {
    return (
      <section className="rounded-xl border-2 border-[#009f67] bg-[#f2fbf7] p-5">
        <h2 className="font-black text-gray-900">{t.about.title}</h2>
        <p className="mt-1 text-sm text-gray-600">{t.about.linkFirst}</p>
        <Link href="/people" className="mt-3 inline-block rounded-lg bg-[#009f67] px-4 py-2 text-sm font-bold text-white">
          {t.about.goPeople}
        </Link>
      </section>
    );
  }

  const toggleLang = (l: string) =>
    setDraft(d => ({ ...d, languages: d.languages.includes(l) ? d.languages.filter(x => x !== l) : [...d.languages, l] }));
  const addSkill = () => {
    const v = skill.trim();
    if (v && !draft.skills.some(s => s.toLowerCase() === v.toLowerCase())) setDraft(d => ({ ...d, skills: [...d.skills, v].slice(0, 15) }));
    setSkill("");
  };

  const save = async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    if (!!draft.birth_month !== !!draft.birth_day) return toast.error(t.about.pickBoth);
    const skills = skill.trim() ? [...draft.skills, skill.trim()] : draft.skills;
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
        skills,
      })
      .eq("id", person.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    setSkill("");
    toast.success(t.about.saved);
    router.refresh();
  };

  const office = officeById(draft.office);
  const years = draft.start_date ? yearsSince(draft.start_date) : null;
  const daysInMonth = draft.birth_month ? new Date(2024, Number(draft.birth_month), 0).getDate() : 31;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm lg:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-black text-gray-900">{t.about.title}</h2>
          <p className="text-sm text-gray-500">{t.about.subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-bold">
          {office && (
            <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-gray-700">
              <MapPin className="h-3.5 w-3.5" /> {office.name}
            </span>
          )}
          {draft.birth_month && draft.birth_day && (
            <span className="flex items-center gap-1 rounded-full bg-pink-50 px-2.5 py-1 text-pink-700">
              <Cake className="h-3.5 w-3.5" /> {monthName(tag, Number(draft.birth_month))} {draft.birth_day}
            </span>
          )}
          {years !== null && (
            <span className="flex items-center gap-1 rounded-full bg-[#e6f6f0] px-2.5 py-1 text-[#00704a]">
              <PartyPopper className="h-3.5 w-3.5" /> {years === 0 ? t.about.joinedThisYear : plural(t.about, "years", years)}
            </span>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className={label} htmlFor="office">{t.about.office}</label>
          <select id="office" value={draft.office} onChange={e => setDraft(d => ({ ...d, office: e.target.value }))} className={field}>
            <option value="">{t.common.choose}</option>
            {OFFICES.map(o => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </div>
        <div>
          <span className={label}>{t.about.birthday}</span>
          <div className="flex gap-2">
            <select aria-label={t.about.month} value={draft.birth_month} onChange={e => setDraft(d => ({ ...d, birth_month: e.target.value }))} className={field}>
              <option value="">{t.about.month}</option>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i} value={i + 1}>{monthName(tag, i + 1)}</option>
              ))}
            </select>
            <select aria-label={t.about.day} value={draft.birth_day} onChange={e => setDraft(d => ({ ...d, birth_day: e.target.value }))} className={`${field} w-24`}>
              <option value="">{t.about.day}</option>
              {Array.from({ length: daysInMonth }, (_, i) => (
                <option key={i + 1} value={i + 1}>{i + 1}</option>
              ))}
            </select>
          </div>
          <p className="mt-1 text-[11px] text-gray-400">{t.about.ageHidden}</p>
        </div>
        <div>
          <label className={label} htmlFor="start">{t.about.startDate}</label>
          <input id="start" type="date" min="1990-01-01" value={draft.start_date} onChange={e => setDraft(d => ({ ...d, start_date: e.target.value }))} className={field} />
        </div>
        <div>
          <label className={label} htmlFor="phone">{t.about.phone}</label>
          <input id="phone" value={draft.phone} onChange={e => setDraft(d => ({ ...d, phone: e.target.value }))} placeholder="+55 41 99999 0000" className={field} />
        </div>
      </div>

      <div className="mt-4">
        <span className={label}>{t.about.languages}</span>
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

      <div className="mt-4">
        <label className={label} htmlFor="skill">{t.about.askMe}</label>
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-300 bg-white p-1.5 focus-within:border-[#009f67]">
          {draft.skills.map(s => (
            <span key={s} className="flex items-center gap-1 rounded-full bg-[#e6f6f0] px-2.5 py-0.5 text-sm font-bold text-[#00704a]">
              {s}
              <button type="button" onClick={() => setDraft(d => ({ ...d, skills: d.skills.filter(x => x !== s) }))} aria-label={`${t.common.delete} ${s}`}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <input
            id="skill"
            value={skill}
            onChange={e => setSkill(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addSkill();
              }
            }}
            onBlur={addSkill}
            placeholder="Thermowood, Excel, Export…"
            className="min-w-40 flex-1 px-1 text-sm outline-none"
          />
        </div>
        <p className="mt-1 text-[11px] text-gray-400">{t.about.askMeHint}</p>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 border-t border-gray-100 pt-4">
        <Link href="/people" className="text-sm font-bold text-[#00704a] hover:underline">
          {t.about.editPosition}
        </Link>
        <button type="button" onClick={save} disabled={busy} className="flex h-9 items-center gap-2 rounded-lg bg-[#009f67] px-5 text-sm font-bold text-white disabled:opacity-50">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t.common.save}
        </button>
      </div>
    </section>
  );
}
