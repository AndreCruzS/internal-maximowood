"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, ChevronLeft, ChevronRight, Loader2, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";
import { COMPANIES, DEPARTMENTS } from "@/lib/intranet";
import { deptName } from "@/lib/i18n/text";
import { fmt } from "@/lib/i18n/locale";
import { plural } from "@/lib/i18n/dictionaries";
import { clock, holidaysFor, todayIn, type HolidayCalendar, type OfficeHoliday } from "@/lib/holidays";
import { ABSENCE_KINDS } from "@/components/home/WhosOut";
import NextHoliday from "@/components/holidays/NextHoliday";
import type { HolidaysData } from "@/server/holidays";

const select = "h-9 rounded-lg border border-gray-300 bg-white px-2 text-sm";
const field = "h-9 w-full rounded-lg border border-gray-300 bg-white px-2 text-sm outline-none focus:border-[#009f67]";
const card = "rounded-2xl border border-gray-200 bg-white p-5 shadow-sm";

const shift = (ym: string, by: number) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

export default function HolidaysView({ data, initialCalendar }: { data: HolidaysData; initialCalendar: string | null }) {
  const { t, tag } = useI18n();
  const h = t.holidays;
  const router = useRouter();
  const [calendar, setCalendar] = useState<HolidayCalendar>(
    data.calendars.includes(initialCalendar as HolidayCalendar) ? (initialCalendar as HolidayCalendar) : data.defaultCalendar,
  );
  const [country, setCountry] = useState("");
  const [company, setCompany] = useState("");
  const [dept, setDept] = useState("");
  const people = useMemo(() => new Map(data.people.map(p => [p.id, p])), [data.people]);
  const go = (month: string) => router.push(`/holidays?month=${month}&calendar=${calendar}`);
  const monthLabel = new Date(`${data.month}-15T12:00:00`).toLocaleDateString(tag, { month: "long", year: "numeric" });
  const day = (ymd: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) => new Date(`${ymd}T12:00:00`).toLocaleDateString(tag, opts);
  const hours = (r: OfficeHoliday) => (r.kind === "closed" ? h.closed : fmt(h.hours, { opens: clock(r.opens!, tag), closes: clock(r.closes!, tag) }));

  const schedule = holidaysFor(calendar, data.holidays);
  const inMonth = schedule.filter(r => r.day.startsWith(data.month));
  const absences = data.absences.filter(a => {
    const p = people.get(a.person_id);
    if (!p) return false;
    return (!country || p.country === country) && (!company || p.company_id === company) && (!dept || p.departments.includes(dept));
  });
  const outCount = new Set(absences.map(a => a.person_id)).size;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-black uppercase tracking-widest text-[#00704a]">{deptName(t, "hr")}</p>
        <h1 className="flex items-center gap-2 text-3xl font-black text-gray-900"><CalendarRange className="h-7 w-7 text-[#00704a]" /> {h.title}</h1>
        <p className="mt-1 max-w-2xl text-gray-500">{h.subtitle}</p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        {data.calendars.length > 1 ? (
          <label className="text-xs font-bold text-gray-500">{h.calendar}
            <select value={calendar} onChange={e => setCalendar(e.target.value as HolidayCalendar)} className={`${select} mt-1 block`}>
              {data.calendars.map(c => <option key={c} value={c}>{h.calendars[c]}</option>)}
            </select>
          </label>
        ) : (
          <p className="text-xs font-bold text-gray-500">{h.calendar}<span className="mt-1 block text-sm font-bold text-gray-900">{h.calendars[calendar]}</span></p>
        )}
      </div>
      <NextHoliday calendar={calendar} holidays={data.holidays} link={false} />

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => go(shift(data.month, -1))} aria-label={h.prev} className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 bg-white hover:border-[#009f67]"><ChevronLeft className="h-4 w-4" /></button>
        <p className="min-w-40 text-center text-xl font-black capitalize text-gray-900">{monthLabel}</p>
        <button type="button" onClick={() => go(shift(data.month, 1))} aria-label={h.next} className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 bg-white hover:border-[#009f67]"><ChevronRight className="h-4 w-4" /></button>
        <button type="button" onClick={() => go(todayIn("America/New_York").slice(0, 7))} className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm font-bold text-gray-700">{h.thisMonth}</button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={card}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-black text-gray-900">{h.absences} <span className="text-sm font-normal text-gray-500">· {plural(h, "absenceCount", outCount)}</span></h2>
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            <select value={country} onChange={e => setCountry(e.target.value)} aria-label={h.allCountries} className={select}>
              <option value="">{h.allCountries}</option>
              <option value="US">{h.countries.US}</option>
              <option value="BR">{h.countries.BR}</option>
            </select>
            <select value={company} onChange={e => setCompany(e.target.value)} aria-label={h.allCompanies} className={select}>
              <option value="">{h.allCompanies}</option>
              {COMPANIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={dept} onChange={e => setDept(e.target.value)} aria-label={h.allDepartments} className={select}>
              <option value="">{h.allDepartments}</option>
              {DEPARTMENTS.map(d => <option key={d.id} value={d.id}>{deptName(t, d.id)}</option>)}
            </select>
          </div>
          {absences.length ? (
            <ul className="divide-y divide-gray-100">
              {absences.map(a => {
                const p = people.get(a.person_id)!;
                const canRemove = data.canEdit || a.person_id === data.myPersonId;
                return (
                  <li key={a.id} className="flex items-center gap-3 py-2.5 text-sm">
                    {p.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.photo_url} alt="" className="h-9 w-9 rounded-full object-cover" />
                    ) : <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e6f6f0] text-xs font-black text-[#00704a]">{p.full_name.charAt(0)}</span>}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold text-gray-900">{p.full_name}</span>
                      <span className="block truncate text-xs text-gray-500">
                        {h.kinds[a.kind as keyof typeof h.kinds] ?? a.kind} · {day(a.starts_on)}{a.ends_on !== a.starts_on ? ` – ${day(a.ends_on)}` : ""}
                        {a.covered_by.length ? ` · ${fmt(h.covers, { name: a.covered_by.map(id => people.get(id)?.full_name ?? "").filter(Boolean).join(", ") })}` : ""}
                        {a.note ? ` · ${a.note}` : ""}
                      </span>
                    </span>
                    {canRemove && <RemoveAbsence id={a.id} label={h.removeAbsence} />}
                  </li>
                );
              })}
            </ul>
          ) : <p className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-500">{h.noAbsences}</p>}
          {(data.canEdit || data.myPersonId) && <AddAbsence data={data} />}
        </section>

        <section className={card}>
          <h2 className="font-black text-gray-900">{h.monthHolidays}</h2>
          <p className="mb-3 text-xs text-gray-500">{h.calendars[calendar]}</p>
          {inMonth.length ? (
            <ul className="divide-y divide-gray-100">
              {inMonth.map(r => (
                <li key={r.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="w-14 shrink-0 text-center"><span className="block text-xs font-bold uppercase text-gray-400">{day(r.day, { weekday: "short" })}</span><span className="block text-lg font-black text-gray-900">{day(r.day, { day: "numeric" })}</span></span>
                  <span className="min-w-0 flex-1"><span className="block font-bold text-gray-900">{r.name}</span><span className="block text-xs text-gray-500">{hours(r)}{r.note ? ` · ${r.note}` : ""}</span></span>
                </li>
              ))}
            </ul>
          ) : <p className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-500">{h.noMonthHolidays}</p>}

          <details className="mt-4 rounded-xl border border-gray-200 p-3">
            <summary className="cursor-pointer text-sm font-bold text-gray-700">{fmt(h.fullSchedule, { calendar: h.calendars[calendar] })}</summary>
            {schedule.length ? (
              <ul className="mt-2 space-y-1.5 text-sm">
                {schedule.map(r => (
                  <li key={r.id} className="flex items-start gap-2">
                    <span className="min-w-0 flex-1"><b className="text-gray-900">{r.name}</b> <span className="text-gray-500">· {day(r.day, { month: "short", day: "numeric", year: "numeric" })} · {hours(r)}{r.note ? ` — ${r.note}` : ""}{r.calendar !== calendar ? ` (${h.calendars[r.calendar]})` : ""}</span></span>
                    {data.canEdit && <DeleteHoliday id={r.id} label={h.deleteHoliday} />}
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-sm text-gray-500">{h.noSchedule}</p>}
            <p className="mt-3 text-xs text-gray-400">{calendar === "curitiba" ? h.curitibaNote : calendar !== "br" ? h.usNote : ""}</p>
          </details>
          {data.canEdit && <AddHoliday calendar={calendar} />}
        </section>
      </div>
    </div>
  );
}

function RemoveAbsence({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  return (
    <button type="button" aria-label={label} title={label} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
      onClick={async () => {
        const { error } = await getSupabase()!.from("absences").delete().eq("id", id);
        if (error) return toast.error(error.message);
        router.refresh();
      }}>
      <X className="h-4 w-4" />
    </button>
  );
}

function DeleteHoliday({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  return (
    <button type="button" aria-label={label} title={label} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
      onClick={async () => {
        const { error } = await getSupabase()!.from("office_holidays").delete().eq("id", id);
        if (error) return toast.error(error.message);
        router.refresh();
      }}>
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}

/** Add time off: HR for anyone, everyone else for themselves. */
function AddAbsence({ data }: { data: HolidaysData }) {
  const { t } = useI18n();
  const h = t.holidays;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [d, setD] = useState({ person_id: data.canEdit ? "" : data.myPersonId ?? "", starts_on: "", ends_on: "", kind: "vacation", note: "" });
  const save = async () => {
    if (!d.person_id || !d.starts_on) return;
    setBusy(true);
    const { error } = await getSupabase()!.from("absences").insert({ ...d, ends_on: d.ends_on || d.starts_on, note: d.note.trim() });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(h.added);
    setOpen(false);
    setD({ ...d, starts_on: "", ends_on: "", note: "" });
    router.refresh();
  };
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="mt-3 flex items-center gap-1.5 text-sm font-bold text-[#00704a] hover:underline"><Plus className="h-4 w-4" /> {h.addAbsence}</button>;
  return (
    <div className="mt-3 space-y-2 rounded-xl border-2 border-[#009f67]/40 bg-[#f2fbf7] p-3">
      {data.canEdit && (
        <select value={d.person_id} onChange={e => setD({ ...d, person_id: e.target.value })} aria-label={h.person} className={field}>
          <option value="">{h.person}…</option>
          {data.people.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
        </select>
      )}
      <div className="grid grid-cols-3 gap-2">
        <label className="text-xs font-bold text-gray-500">{h.from}<input type="date" value={d.starts_on} onChange={e => setD({ ...d, starts_on: e.target.value })} className={field} /></label>
        <label className="text-xs font-bold text-gray-500">{h.to}<input type="date" value={d.ends_on} min={d.starts_on} onChange={e => setD({ ...d, ends_on: e.target.value })} className={field} /></label>
        <label className="text-xs font-bold text-gray-500">{h.kind}<select value={d.kind} onChange={e => setD({ ...d, kind: e.target.value })} className={field}>{ABSENCE_KINDS.map(k => <option key={k} value={k}>{h.kinds[k]}</option>)}</select></label>
      </div>
      <input value={d.note} onChange={e => setD({ ...d, note: e.target.value })} maxLength={200} placeholder={h.note} aria-label={h.note} className={field} />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="h-9 rounded-lg px-3 text-sm font-bold text-gray-600">{t.common.cancel}</button>
        <button type="button" onClick={save} disabled={busy || !d.person_id || !d.starts_on} className="flex h-9 items-center gap-1.5 rounded-lg bg-[#009f67] px-4 text-sm font-bold text-white disabled:opacity-50">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} {h.save}
        </button>
      </div>
    </div>
  );
}

/** HR / admins: add a holiday or reduced-hours day to the selected calendar. */
function AddHoliday({ calendar }: { calendar: HolidayCalendar }) {
  const { t } = useI18n();
  const h = t.holidays;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [d, setD] = useState({ day: "", name: "", kind: "closed" as "closed" | "reduced", opens: "08:00", closes: "12:00", note: "" });
  const save = async () => {
    if (!d.day || !d.name.trim()) return toast.error(h.needName);
    if (d.kind === "reduced" && d.closes <= d.opens) return toast.error(h.badHours);
    const { error } = await getSupabase()!.from("office_holidays").upsert({
      calendar, day: d.day, name: d.name.trim(), kind: d.kind, opens: d.kind === "reduced" ? d.opens : null, closes: d.kind === "reduced" ? d.closes : null, note: d.note.trim(),
    }, { onConflict: "calendar,day" });
    if (error) return toast.error(error.message);
    toast.success(h.holidaySaved);
    setD({ ...d, day: "", name: "", note: "" });
    router.refresh();
  };
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="mt-3 flex items-center gap-1.5 text-sm font-bold text-[#00704a] hover:underline"><Plus className="h-4 w-4" /> {h.addHoliday} · {h.calendars[calendar]}</button>;
  return (
    <div className="mt-3 space-y-2 rounded-xl border-2 border-[#009f67]/40 bg-[#f2fbf7] p-3">
      <p className="text-xs font-black uppercase tracking-widest text-gray-500">{h.calendars[calendar]}</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs font-bold text-gray-500">{h.day}<input type="date" value={d.day} onChange={e => setD({ ...d, day: e.target.value })} className={field} /></label>
        <label className="text-xs font-bold text-gray-500">{h.name}<input value={d.name} onChange={e => setD({ ...d, name: e.target.value })} maxLength={120} className={field} /></label>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        {(["closed", "reduced"] as const).map(k => (
          <label key={k} className="flex items-center gap-1.5"><input type="radio" checked={d.kind === k} onChange={() => setD({ ...d, kind: k })} className="accent-[#009f67]" /> {k === "closed" ? h.closedAllDay : h.reduced}</label>
        ))}
      </div>
      {d.kind === "reduced" && (
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs font-bold text-gray-500">{h.opens}<input type="time" value={d.opens} onChange={e => setD({ ...d, opens: e.target.value })} className={field} /></label>
          <label className="text-xs font-bold text-gray-500">{h.closes}<input type="time" value={d.closes} onChange={e => setD({ ...d, closes: e.target.value })} className={field} /></label>
        </div>
      )}
      <input value={d.note} onChange={e => setD({ ...d, note: e.target.value })} maxLength={200} placeholder={h.note} aria-label={h.note} className={field} />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="h-9 rounded-lg px-3 text-sm font-bold text-gray-600">{t.common.cancel}</button>
        <button type="button" onClick={save} className="h-9 rounded-lg bg-[#009f67] px-4 text-sm font-bold text-white">{h.save}</button>
      </div>
    </div>
  );
}
