"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plane, Plus, Stethoscope, Sun, Umbrella, Building2, X } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";
import { useMe } from "@/components/MeProvider";
import { useMounted } from "@/components/CalendarView";
import { fmt } from "@/lib/i18n/locale";
import type { Absence, PersonLite } from "@/server/intranet";

export const ABSENCE_KINDS = ["vacation", "sick", "travel", "ooo", "holiday"] as const;
const KIND_ICON = { vacation: Umbrella, sick: Stethoscope, travel: Plane, ooo: Building2, holiday: Sun } as const;

const localYmd = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Who's out today and in the next two weeks; anyone linked to the org chart can add their own time off. */
export default function WhosOut({ absences, people }: { absences: Absence[]; people: PersonLite[] }) {
  const { t, tag } = useI18n();
  const me = useMe();
  const router = useRouter();
  const mounted = useMounted();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ starts_on: "", ends_on: "", kind: "vacation", note: "" });
  const [busy, setBusy] = useState(false);
  if (!mounted) return <div className="h-24" />;

  const names = new Map(people.map(p => [p.id, p.full_name]));
  const today = localYmd();
  const out = absences.filter(a => a.starts_on <= today && a.ends_on >= today);
  const soon = absences.filter(a => a.starts_on > today).slice(0, 4);
  const d = (ymd: string) => new Date(`${ymd}T12:00:00`).toLocaleDateString(tag, { month: "short", day: "numeric" });

  const save = async () => {
    const supabase = getSupabase();
    if (!supabase || !me.personId) return;
    if (!draft.starts_on || !draft.ends_on) return;
    setBusy(true);
    const { error } = await supabase.from("absences").insert({ ...draft, note: draft.note.trim(), person_id: me.personId });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(t.absences.added);
    setOpen(false);
    setDraft({ starts_on: "", ends_on: "", kind: "vacation", note: "" });
    router.refresh();
  };

  const row = (a: Absence) => {
    const Icon = KIND_ICON[a.kind as keyof typeof KIND_ICON] ?? Umbrella;
    return (
      <li key={a.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5">
        <Icon className="h-4 w-4 shrink-0 text-gray-400" />
        <span className="min-w-0 flex-1 truncate text-sm font-bold text-gray-900">{names.get(a.person_id) ?? "—"}</span>
        <span className="shrink-0 text-xs text-gray-500">
          {t.absences.kinds[a.kind as keyof typeof t.absences.kinds] ?? a.kind} · {a.starts_on > today ? `${d(a.starts_on)} – ` : ""}
          {fmt(t.absences.until, { date: d(a.ends_on) })}
        </span>
      </li>
    );
  };

  const field = "h-9 w-full rounded-lg border border-gray-300 bg-white px-2 text-sm outline-none focus:border-[#009f67]";
  return (
    <div>
      {out.length ? <ul className="space-y-0.5">{out.map(row)}</ul> : <p className="py-3 text-center text-sm text-gray-400">{t.absences.nobody}</p>}
      {soon.length > 0 && (
        <>
          <p className="mt-3 px-2 text-[11px] font-black uppercase tracking-widest text-gray-400">{t.absences.upcoming}</p>
          <ul className="space-y-0.5">{soon.map(row)}</ul>
        </>
      )}
      {open ? (
        <div className="mt-3 space-y-2 rounded-lg border border-gray-200 p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-gray-900">{t.absences.imOut}</p>
            <button type="button" onClick={() => setOpen(false)} aria-label={t.common.close} className="rounded p-1 text-gray-400 hover:bg-gray-100"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-bold text-gray-500">{t.absences.from}<input type="date" value={draft.starts_on} onChange={e => setDraft(x => ({ ...x, starts_on: e.target.value, ends_on: x.ends_on || e.target.value }))} className={field} /></label>
            <label className="text-xs font-bold text-gray-500">{t.absences.to}<input type="date" min={draft.starts_on} value={draft.ends_on} onChange={e => setDraft(x => ({ ...x, ends_on: e.target.value }))} className={field} /></label>
          </div>
          <select value={draft.kind} onChange={e => setDraft(x => ({ ...x, kind: e.target.value }))} className={field} aria-label={t.absences.kind}>
            {ABSENCE_KINDS.map(k => <option key={k} value={k}>{t.absences.kinds[k]}</option>)}
          </select>
          <input value={draft.note} onChange={e => setDraft(x => ({ ...x, note: e.target.value }))} placeholder={t.absences.note} className={field} />
          <button type="button" disabled={busy || !draft.starts_on || !draft.ends_on} onClick={save} className="h-9 w-full rounded-lg bg-[#009f67] text-sm font-bold text-white disabled:opacity-50">{t.absences.add}</button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => (me.personId ? setOpen(true) : toast.info(t.absences.needProfile))}
          className="mt-3 flex items-center gap-1.5 text-sm font-bold text-[#00704a] hover:underline"
        >
          <Plus className="h-4 w-4" /> {t.absences.imOut}
        </button>
      )}
    </div>
  );
}
