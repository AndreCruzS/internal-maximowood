"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Globe, Loader2, PartyPopper, Plus, Trash2, UserCheck } from "lucide-react";
import { CITIES, countryName, countryOptions } from "@/lib/places";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { COMPANIES, DEPARTMENTS, LANGUAGES, OFFICES } from "@/lib/intranet";
import { saveLocale, useI18n } from "@/components/I18nProvider";
import { LOCALES, LOCALE_NAMES, fmt, type Locale } from "@/lib/i18n/locale";
import { deptName, monthName } from "@/lib/i18n/text";

export type WelcomePerson = {
  id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  nationality: string | null;
  location: string | null;
  live_country?: string | null;
  live_city?: string | null;
  office: string | null;
  languages: string[] | null;
  companies: string[] | null;
  birth_month: number | null;
  birth_day: number | null;
  start_date: string | null;
  start_year: number | null;
  user_id: string | null;
  email: string | null;
};
export type WelcomePosition = { id: string; person_id: string; title: string; department_id: string | null; team: string | null; reports_to: string | null; sort: number };
type Relation = "superior" | "peer" | "report";

const field = "h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-[15px] outline-none focus:border-[#009f67] focus:ring-2 focus:ring-[#009f67]/15";
const label = "mb-1.5 block text-sm font-bold text-gray-700";
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`flex items-center gap-1 rounded-full border px-3.5 py-1.5 text-sm font-bold transition-colors ${
        on ? "border-[#009f67] bg-[#e6f6f0] text-[#00704a]" : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
      }`}
    >
      {on && <Check className="h-3.5 w-3.5" />} {children}
    </button>
  );
}

/** First sign-in questionnaire (4 steps). Fills the person's People entry, position and team. */
export default function WelcomeWizard({ email, metaName, people, positions, me, savedTeam }: {
  email: string;
  metaName: string;
  people: WelcomePerson[];
  positions: WelcomePosition[];
  me: WelcomePerson | null;
  savedTeam: { other_person_id: string; relation: string }[];
}) {
  const { t, tag, locale } = useI18n();
  const w = t.welcome;
  const router = useRouter();
  const myPositions = me ? positions.filter(p => p.person_id === me.id).sort((a, b) => a.sort - b.sort) : [];
  const nameParts = (me?.full_name || metaName).trim().split(/\s+/);

  const [step, setStep] = useState(0); // 0..3 questions, 4 = done
  const [busy, setBusy] = useState(false);
  const [d, setD] = useState({
    first: me?.first_name || nameParts[0] || "",
    last: me?.last_name || nameParts.slice(1).join(" ") || "",
    nickname: me?.nickname ?? "",
    claim: "" as string, // person id of a matched org-chart entry, or "new"
    nationality: me?.nationality ?? "",
    birth_month: me?.birth_month ? String(me.birth_month) : "",
    birth_day: me?.birth_day ? String(me.birth_day) : "",
    country: me?.live_country ?? "",
    city: me?.live_city ?? "",
    cityOther: false,
    languages: me?.languages ?? [],
    office: me?.office ?? "",

    companies: me?.companies ?? [],
    isNew: null as boolean | null,
    startMode: (me?.start_year && !me?.start_date ? "year" : "exact") as "exact" | "year",
    start_date: me?.start_date ?? "",
    start_year: me?.start_year ? String(me.start_year) : "",
  });
  const set = (p: Partial<typeof d>) => setD(x => ({ ...x, ...p }));
  // One or more positions (title + department); "leadership" = no department.
  type Pos = { id?: string; title: string; department: string };
  const toPos = (p: WelcomePosition): Pos => ({ id: p.id, title: p.title, department: p.department_id ?? "leadership" });
  const [roles, setRoles] = useState<Pos[]>(myPositions.length ? myPositions.map(toPos) : [{ title: "", department: "" }]);
  const setRole = (i: number, patch: Partial<Pos>) => setRoles(list => list.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const [showAll, setShowAll] = useState(false);
  const [team, setTeam] = useState<{ person: string; relation: Relation }[]>(
    savedTeam.filter(r => ["superior", "peer", "report"].includes(r.relation)).map(r => ({ person: r.other_person_id, relation: r.relation as Relation })),
  );
  const [pick, setPick] = useState("");

  // Not linked yet: offer org-chart entries with a similar name.
  const matches = useMemo(() => {
    if (me) return [];
    const f = norm(d.first).split(/\s+/)[0];
    const l = norm(d.last).split(/\s+/).pop() ?? "";
    if (!f) return [];
    return people
      .filter(p => !p.user_id)
      .filter(p => {
        const n = norm(p.full_name);
        return n.includes(f) && (!l || n.includes(l));
      })
      .slice(0, 4);
  }, [people, me, d.first, d.last]);
  const titleOf = (personId: string) => positions.find(p => p.person_id === personId)?.title ?? "";
  // Team step: colleagues in my department(s) (Leadership = no department); everyone on request.
  const myself = me?.id ?? (d.claim && d.claim !== "new" ? d.claim : null);
  const myDepts = new Set(roles.map(r => r.department).filter(Boolean));
  const deptOf = (personId: string) => positions.filter(x => x.person_id === personId).map(x => x.department_id ?? "leadership");
  const deptColleagues = people.filter(p => p.id !== myself && deptOf(p.id).some(x => myDepts.has(x)));
  const colleagues = showAll ? people.filter(p => p.id !== myself) : deptColleagues;
  const hasTeamStep = deptColleagues.length > 0 || team.length > 0;
  const lastStep = hasTeamStep ? 3 : 2;
  const daysInMonth = d.birth_month ? new Date(2024, Number(d.birth_month), 0).getDate() : 31;
  const thisYear = new Date().getFullYear();

  const missing = (): string[] => {
    if (step === 0) return [!d.first.trim() && w.firstName, !d.last.trim() && w.lastName, !me && matches.length > 0 && !d.claim && w.isThisYou].filter(Boolean) as string[];
    if (step === 1) return [!d.country && w.country, !!d.country && !d.city.trim() && w.city].filter(Boolean) as string[];
    if (step === 2) return [!d.office && w.office, roles.some(r => !r.department) && w.department, roles.some(r => !r.title.trim()) && w.position].filter(Boolean) as string[];
    return [];
  };
  const next = () => {
    const m = missing();
    if (m.length) return toast.error(fmt(w.required, { fields: m.join(", ") }));
    setStep(s => s + 1);
  };

  const finish = async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    setBusy(true);
    const fail = (msg: string) => {
      setBusy(false);
      toast.error(msg);
    };
    const fullName = `${d.first.trim()} ${d.last.trim()}`.trim();

    // 1. Link the login to an org-chart entry (claim a seeded one, or create one).
    let personId = me?.id ?? null;
    if (!personId) {
      const res = d.claim && d.claim !== "new"
        ? await supabase.rpc("claim_person", { target: d.claim })
        : await supabase.rpc("create_my_person", { name: fullName });
      if (res.error) return fail(res.error.message);
      personId = res.data as string;
    }

    // 2. Personal details.
    const exact = d.startMode === "exact" && d.start_date;
    const { error: e1 } = await supabase
      .from("people")
      .update({
        full_name: fullName,
        first_name: d.first.trim(),
        last_name: d.last.trim(),
        nickname: d.nickname.trim(),
        nationality: d.nationality.trim(),
        live_country: d.country || null,
        live_city: d.city.trim(),
        location: d.country ? `${d.city.trim()}${d.city.trim() ? ", " : ""}${countryName(d.country, "en")}` : null,
        office: d.office || null,
        languages: d.languages,
        companies: d.companies,
        birth_month: d.birth_month && d.birth_day ? Number(d.birth_month) : null,
        birth_day: d.birth_month && d.birth_day ? Number(d.birth_day) : null,
        start_date: exact ? d.start_date : null,
        start_year: exact ? Number(d.start_date.slice(0, 4)) : d.start_year ? Number(d.start_year) : null,
      })
      .eq("id", personId);
    if (e1) return fail(e1.message);

    // 3. Positions: update the ones kept, add new ones, remove the ones taken out.
    const current = positions.filter(p => p.person_id === personId).sort((a, b) => a.sort - b.sort);
    const keep = new Set(roles.map(r => r.id).filter(Boolean));
    const gone = current.filter(p => !keep.has(p.id)).map(p => p.id);
    if (gone.length) {
      const { error } = await supabase.from("positions").delete().in("id", gone);
      if (error) return fail(error.message);
    }
    for (const [i, r] of roles.entries()) {
      // A claimed entry's positions become this person's, matched by order.
      const id = r.id && current.some(p => p.id === r.id) ? r.id : undefined;
      const row = { title: r.title.trim(), department_id: r.department && r.department !== "leadership" ? r.department : null };
      const { error } = id
        ? await supabase.from("positions").update(row).eq("id", id)
        : await supabase.from("positions").insert({ ...row, person_id: personId, sort: (current[0]?.sort ?? 1000) + i });
      if (error) return fail(error.message);
    }

    // 4. Team → org chart, then mark the questionnaire done.
    const { error: e3 } = await supabase.rpc("save_my_team", { answers: team });
    if (e3) return fail(e3.message);
    const { error: e4 } = await supabase.rpc("complete_my_onboarding");
    if (e4) return fail(e4.message);
    setBusy(false);
    setStep(4);
  };

  const steps = hasTeamStep ? [w.s1, w.s2, w.s3, w.s4] : [w.s1, w.s2, w.s3];

  return (
    <div className="min-h-screen bg-[#F7F8F7] px-4 py-8 sm:py-14">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 flex items-center justify-between">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/gmx-logo-color.png" alt="GMX Group" className="h-9 w-auto" />
          <label className="flex items-center gap-1.5 text-sm font-bold text-gray-600">
            <Globe className="h-4 w-4" aria-hidden />
            <select
              value={locale}
              onChange={e => {
                saveLocale(e.target.value as Locale);
                router.refresh();
              }}
              className="bg-transparent outline-none"
              aria-label={t.nav.language}
            >
              {LOCALES.map(l => <option key={l} value={l}>{LOCALE_NAMES[l]}</option>)}
            </select>
          </label>
        </div>

        {step < 4 && (
          <>
            <h1 className="text-3xl font-black text-gray-900">{w.heading}</h1>
            <p className="mt-2 text-gray-600">{w.intro}</p>
            <div className="mt-6 flex gap-2" aria-label={fmt(w.step, { n: step + 1, total: steps.length })}>
              {steps.map((s, i) => (
                <div key={s} className="flex-1">
                  <div className={`h-1.5 rounded-full ${i <= step ? "bg-[#009f67]" : "bg-gray-200"}`} />
                  <p className={`mt-1.5 hidden text-xs font-bold sm:block ${i === step ? "text-[#00704a]" : "text-gray-400"}`}>{s}</p>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
          {step === 0 && (
            <div className="space-y-5">
              <h2 className="text-xl font-black text-gray-900">{w.s1}</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div><label className={label} htmlFor="first">{w.firstName}</label><input id="first" value={d.first} onChange={e => set({ first: e.target.value, claim: "" })} className={field} autoFocus /></div>
                <div><label className={label} htmlFor="last">{w.lastName}</label><input id="last" value={d.last} onChange={e => set({ last: e.target.value, claim: "" })} className={field} /></div>
              </div>
              <div>
                <label className={label} htmlFor="nick">{w.nickname}</label>
                <input id="nick" value={d.nickname} onChange={e => set({ nickname: e.target.value })} className={field} />
                <p className="mt-1 text-xs text-gray-400">{w.nicknameHint}</p>
              </div>
              {!me && matches.length > 0 && (
                <div className="rounded-xl border-2 border-[#9fdcc5] bg-[#f2fbf7] p-4">
                  <p className="flex items-center gap-2 font-bold text-gray-900"><UserCheck className="h-5 w-5 text-[#00704a]" /> {w.isThisYou}</p>
                  <p className="mt-0.5 text-sm text-gray-600">{w.matchHint}</p>
                  <div className="mt-3 space-y-2">
                    {matches.map(p => (
                      <label key={p.id} className={`flex cursor-pointer items-center gap-3 rounded-lg border bg-white px-3 py-2.5 ${d.claim === p.id ? "border-[#009f67]" : "border-gray-200"}`}>
                        <input type="radio" name="claim" checked={d.claim === p.id} onChange={() => {
                          set({ claim: p.id });
                          const theirs = positions.filter(x => x.person_id === p.id).sort((a, b) => a.sort - b.sort);
                          if (theirs.length && roles.every(r => !r.title.trim())) setRoles(theirs.map(toPos));
                        }} className="accent-[#009f67]" />
                        <span><span className="block font-bold text-gray-900">{p.full_name}</span><span className="block text-xs text-gray-500">{titleOf(p.id)}</span></span>
                        {d.claim === p.id && <span className="ml-auto text-xs font-bold text-[#00704a]">{w.yesMe}</span>}
                      </label>
                    ))}
                    <label className={`flex cursor-pointer items-center gap-3 rounded-lg border bg-white px-3 py-2.5 ${d.claim === "new" ? "border-[#009f67]" : "border-gray-200"}`}>
                      <input type="radio" name="claim" checked={d.claim === "new"} onChange={() => set({ claim: "new" })} className="accent-[#009f67]" />
                      <span className="text-sm font-bold text-gray-700">{w.notMe}</span>
                    </label>
                  </div>
                </div>
              )}
              <p className="text-xs text-gray-400">{email}</p>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <h2 className="text-xl font-black text-gray-900">{w.s2}</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={label} htmlFor="nat">{w.nationality}</label>
                  <input id="nat" list="nationalities" value={d.nationality} onChange={e => set({ nationality: e.target.value })} placeholder={w.nationalityPlaceholder} className={field} />
                  <datalist id="nationalities">
                    {["Brazilian", "American", "Brasileira", "Brasileño", "Argentine", "Colombian", "Mexican", "Portuguese", "Spanish", "Venezuelan", "Dominican"].map(n => <option key={n} value={n} />)}
                  </datalist>
                </div>
                <div>
                  <span className={label}>{w.birthday}</span>
                  <div className="flex gap-2">
                    <select aria-label={t.about.month} value={d.birth_month} onChange={e => set({ birth_month: e.target.value })} className={field}>
                      <option value="">{t.about.month}</option>
                      {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{monthName(tag, i + 1)}</option>)}
                    </select>
                    <select aria-label={t.about.day} value={d.birth_day} onChange={e => set({ birth_day: e.target.value })} className={`${field} w-28`}>
                      <option value="">{t.about.day}</option>
                      {Array.from({ length: daysInMonth }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
                    </select>
                  </div>
                  <p className="mt-1 text-xs text-gray-400">{t.about.ageHidden}</p>
                </div>
              </div>
              <div>
                <span className={label}>{w.liveIn}</span>
                <div className="grid gap-3 sm:grid-cols-2">
                  <select value={d.country} onChange={e => set({ country: e.target.value, city: "", cityOther: false })} className={field} aria-label={w.country}>
                    <option value="">{w.chooseCountry}</option>
                    {countryOptions(tag).map(c => (
                      <option key={c.code} value={c.code}>{c.name}</option>
                    ))}
                  </select>
                  {d.country && CITIES[d.country] && !d.cityOther ? (
                    <select
                      value={CITIES[d.country].includes(d.city) ? d.city : d.city ? "__other" : ""}
                      onChange={e => (e.target.value === "__other" ? set({ cityOther: true, city: "" }) : set({ city: e.target.value }))}
                      className={field}
                      aria-label={w.city}
                    >
                      <option value="">{w.chooseCity}</option>
                      {CITIES[d.country].map(c => <option key={c} value={c}>{c}</option>)}
                      <option value="__other">{w.otherCity}</option>
                    </select>
                  ) : (
                    d.country && <input value={d.city} onChange={e => set({ city: e.target.value })} placeholder={w.cityPlaceholder} className={field} aria-label={w.city} />
                  )}
                </div>
              </div>
              <div>
                <span className={label}>{w.languages}</span>
                <div className="flex flex-wrap gap-2">
                  {LANGUAGES.map(l => <Chip key={l} on={d.languages.includes(l)} onClick={() => set({ languages: d.languages.includes(l) ? d.languages.filter(x => x !== l) : [...d.languages, l] })}>{l}</Chip>)}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <h2 className="text-xl font-black text-gray-900">{w.s3}</h2>
              <div>
                <span className={label}>{w.office}</span>
                <div className="grid gap-2 sm:grid-cols-2">
                  {OFFICES.map(o => (
                    <button key={o.id} type="button" onClick={() => set({ office: o.id })} aria-pressed={d.office === o.id}
                      className={`rounded-xl border px-4 py-3 text-left ${d.office === o.id ? "border-[#009f67] bg-[#f2fbf7]" : "border-gray-200 hover:bg-gray-50"}`}>
                      <span className="block font-bold text-gray-900">{o.name}</span>
                      <span className="block text-xs text-gray-500">{o.place}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                {roles.map((r, i) => (
                  <div key={r.id ?? `new-${i}`} className={roles.length > 1 ? "rounded-xl border border-gray-200 p-3" : ""}>
                    {roles.length > 1 && (
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-black uppercase tracking-widest text-gray-400">{fmt(w.positionN, { n: i + 1 })}</span>
                        <button type="button" onClick={() => setRoles(list => list.filter((_, j) => j !== i))} aria-label={w.removePosition} className="rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    )}
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className={label} htmlFor={`dept-${i}`}>{w.department}</label>
                        <select id={`dept-${i}`} value={r.department} onChange={e => setRole(i, { department: e.target.value })} className={field}>
                          <option value="">{t.common.choose}</option>
                          <option value="leadership">{t.departments.leadership}</option>
                          {DEPARTMENTS.map(x => <option key={x.id} value={x.id}>{deptName(t, x.id)}</option>)}
                        </select>
                      </div>
                      <div><label className={label} htmlFor={`title-${i}`}>{w.position}</label><input id={`title-${i}`} value={r.title} onChange={e => setRole(i, { title: e.target.value })} placeholder={w.positionPlaceholder} className={field} /></div>
                    </div>
                  </div>
                ))}
                <button type="button" onClick={() => setRoles(list => [...list, { title: "", department: "" }])} className="flex items-center gap-1.5 text-sm font-bold text-[#00704a] hover:underline">
                  <Plus className="h-4 w-4" /> {w.addPosition}
                </button>
              </div>
              <div>
                <span className={label}>{w.companies}</span>
                <div className="flex flex-wrap gap-2">
                  {COMPANIES.map(c => <Chip key={c.id} on={d.companies.includes(c.id)} onClick={() => set({ companies: d.companies.includes(c.id) ? d.companies.filter(x => x !== c.id) : [...d.companies, c.id] })}>{c.name}</Chip>)}
                </div>
              </div>
              <div>
                <span className={label}>{w.newEmployee}</span>
                <div className="flex flex-wrap gap-2">
                  <Chip on={d.isNew === true} onClick={() => set({ isNew: true, startMode: "exact", start_date: d.start_date || new Date().toISOString().slice(0, 10) })}>{w.yesNew}</Chip>
                  <Chip on={d.isNew === false} onClick={() => set({ isNew: false })}>{w.noNew}</Chip>
                </div>
              </div>
              {d.isNew !== null && (
                <div>
                  <span className={label}>{w.startedOn}</span>
                  <div className="mb-2 flex flex-wrap gap-2">
                    <Chip on={d.startMode === "exact"} onClick={() => set({ startMode: "exact" })}>{w.exactDate}</Chip>
                    <Chip on={d.startMode === "year"} onClick={() => set({ startMode: "year" })}>{w.onlyYear}</Chip>
                  </div>
                  {d.startMode === "exact" ? (
                    <input type="date" min="1980-01-01" max={new Date().toISOString().slice(0, 10)} value={d.start_date} onChange={e => set({ start_date: e.target.value })} className={`${field} sm:w-64`} aria-label={w.startedOn} />
                  ) : (
                    <select value={d.start_year} onChange={e => set({ start_year: e.target.value })} className={`${field} sm:w-40`} aria-label={w.year}>
                      <option value="">{w.year}</option>
                      {Array.from({ length: thisYear - 1979 }, (_, i) => thisYear - i).map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 3 && hasTeamStep && (
            <div className="space-y-5">
              <h2 className="text-xl font-black text-gray-900">{w.s4}</h2>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-gray-600">{w.teamIntro}</p>
                <button type="button" onClick={() => setShowAll(v => !v)} className="text-sm font-bold text-[#00704a] hover:underline">{showAll ? w.onlyDepartment : w.showEveryone}</button>
              </div>
              <select
                value={pick}
                onChange={e => {
                  const v = e.target.value;
                  if (v && !team.some(x => x.person === v)) setTeam(list => [...list, { person: v, relation: "peer" }]);
                  setPick("");
                }}
                className={field}
                aria-label={w.addColleague}
              >
                <option value="">{w.addColleague}</option>
                {colleagues.filter(p => !team.some(x => x.person === p.id)).map(p => (
                  <option key={p.id} value={p.id}>{p.full_name}{titleOf(p.id) ? ` — ${titleOf(p.id)}` : ""}</option>
                ))}
              </select>
              {team.length > 0 && (
                <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
                  {team.map(m => {
                    const p = people.find(x => x.id === m.person);
                    return (
                      <li key={m.person} className="flex flex-wrap items-center gap-3 px-4 py-3">
                        <span className="min-w-0 flex-1">
                          <span className="block font-bold text-gray-900">{p?.full_name ?? "—"}</span>
                          <span className="block text-xs text-gray-500">{titleOf(m.person)}</span>
                        </span>
                        <div className="flex rounded-lg border border-gray-200 p-0.5 text-xs font-bold">
                          {(["superior", "peer", "report"] as const).map(r => (
                            <button key={r} type="button" onClick={() => setTeam(list => list.map(x => (x.person === m.person ? { ...x, relation: r } : x)))}
                              className={`rounded-md px-2.5 py-1.5 ${m.relation === r ? "bg-[#009f67] text-white" : "text-gray-500 hover:text-gray-800"}`}>
                              {w[r]}
                            </button>
                          ))}
                        </div>
                        <button type="button" onClick={() => setTeam(list => list.filter(x => x.person !== m.person))} aria-label={w.remove} className="rounded p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="py-6 text-center">
              <PartyPopper className="mx-auto h-12 w-12 text-[#009f67]" />
              <h2 className="mt-4 text-2xl font-black text-gray-900">{w.doneTitle}</h2>
              <p className="mt-2 text-gray-600">{fmt(w.doneText, { name: d.nickname.trim() || d.first.trim() })}</p>
              <button type="button" onClick={() => { router.push("/"); router.refresh(); }} className="mt-6 inline-flex h-11 items-center gap-2 rounded-lg bg-[#009f67] px-6 font-bold text-white">
                {w.goPortal} <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {step < 4 && (
            <div className="mt-8 flex items-center justify-between border-t border-gray-100 pt-5">
              {step > 0 ? (
                <button type="button" onClick={() => setStep(s => s - 1)} className="flex items-center gap-1.5 text-sm font-bold text-gray-600 hover:text-gray-900">
                  <ArrowLeft className="h-4 w-4" /> {w.back}
                </button>
              ) : <span />}
              <span className="text-xs text-gray-400">{fmt(w.step, { n: step + 1, total: steps.length })}</span>
              {step < lastStep ? (
                <button type="button" onClick={next} className="flex h-11 items-center gap-2 rounded-lg bg-[#009f67] px-6 font-bold text-white">
                  {w.next} <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <button type="button" onClick={() => (missing().length ? next() : finish())} disabled={busy} className="flex h-11 items-center gap-2 rounded-lg bg-[#009f67] px-6 font-bold text-white disabled:opacity-50">
                  {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> {w.saving}</> : <>{w.finish} <Check className="h-4 w-4" /></>}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
