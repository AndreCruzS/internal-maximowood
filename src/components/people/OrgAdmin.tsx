"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";
import { DEPARTMENTS } from "@/lib/intranet";
import { deptName } from "@/lib/i18n/text";
import { fmt } from "@/lib/i18n/locale";
import { ORG_LEVELS, descendants, inferLevel, levelOf } from "@/lib/orgLevels";
import type { Person, Position } from "@/components/PeopleView";

const field = "h-9 w-full rounded-lg border border-gray-300 bg-white px-2 text-sm outline-none focus:border-[#009f67]";
const label = "mb-1 block text-[11px] font-bold text-gray-500";
type Draft = { title: string; department_id: string; team: string; reports_to: string; level: string };

/** Admins only: edit someone's positions — title, department, team, who they report to and level. */
export default function OrgAdmin({ person, people, positions }: { person: Person; people: Person[]; positions: Position[] }) {
  const { t } = useI18n();
  const o = t.orgAdmin;
  const mine = positions.filter(p => p.person_id === person.id).sort((a, b) => a.sort - b.sort);
  const [editing, setEditing] = useState<string | "new" | null>(null);

  return (
    <div>
      <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">{o.title}</p>
      <ul className="space-y-2">
        {mine.map(p =>
          editing === p.id ? (
            <li key={p.id}><PositionForm person={person} position={p} people={people} positions={positions} onDone={() => setEditing(null)} /></li>
          ) : (
            <li key={p.id} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold text-gray-900">{p.title}</span>
                <span className="block truncate text-xs text-gray-500">{deptName(t, p.department_id)} · {o.levels[levelOf(p)]}</span>
              </span>
              <button type="button" onClick={() => setEditing(p.id)} className="flex h-8 items-center gap-1 rounded-lg border border-gray-300 px-2 text-xs font-bold text-gray-700 hover:border-[#009f67]">
                <Pencil className="h-3.5 w-3.5" /> {t.common.edit}
              </button>
            </li>
          ),
        )}
        {editing === "new" ? (
          <li><PositionForm person={person} position={null} people={people} positions={positions} onDone={() => setEditing(null)} /></li>
        ) : (
          <li>
            <button type="button" onClick={() => setEditing("new")} className="flex items-center gap-1.5 text-sm font-bold text-[#00704a] hover:underline">
              <Plus className="h-4 w-4" /> {o.addPosition}
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}

function PositionForm({ person, position, people, positions, onDone }: {
  person: Person;
  position: Position | null;
  people: Person[];
  positions: Position[];
  onDone: () => void;
}) {
  const { t } = useI18n();
  const o = t.orgAdmin;
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [d, setD] = useState<Draft>({
    title: position?.title ?? "",
    department_id: position?.department_id ?? "",
    team: position?.team ?? "",
    reports_to: position?.reports_to ?? "",
    level: position?.level ? String(position.level) : "",
  });
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setD(x => ({ ...x, [k]: e.target.value }));
  const names = useMemo(() => new Map(people.map(p => [p.id, p.full_name])), [people]);

  // Anyone except this position and the people below it (that would make a loop).
  const managers = useMemo(() => {
    const blocked = position ? descendants(position.id, positions) : new Set<string>();
    return positions
      .filter(p => !blocked.has(p.id) && names.has(p.person_id))
      .sort((a, b) => names.get(a.person_id)!.localeCompare(names.get(b.person_id)!) || a.sort - b.sort);
  }, [positions, position, names]);

  const level = d.level ? Number(d.level) : inferLevel(d.title);
  const manager = positions.find(p => p.id === d.reports_to) ?? null;
  const wrongWay = manager && levelOf(manager) >= level;

  const save = async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    if (!d.title.trim()) return toast.error(o.needTitle);
    const row = {
      title: d.title.trim(),
      department_id: d.department_id || null,
      team: d.team.trim() || null,
      reports_to: d.reports_to || null,
      level: d.level ? Number(d.level) : null,
    };
    setBusy(true);
    let { error } = position
      ? await supabase.from("positions").update(row).eq("id", position.id)
      : await supabase.from("positions").insert({ ...row, person_id: person.id, sort: Math.max(0, ...positions.map(p => p.sort)) + 1 });
    // Before migration 0020 there's no level column.
    if (error && ["PGRST204", "42703"].includes(error.code ?? "")) {
      const { level: _level, ...rest } = row;
      void _level;
      ({ error } = position
        ? await supabase.from("positions").update(rest).eq("id", position.id)
        : await supabase.from("positions").insert({ ...rest, person_id: person.id, sort: Math.max(0, ...positions.map(p => p.sort)) + 1 }));
    }
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(o.saved);
    onDone();
    router.refresh();
  };

  const remove = async () => {
    const supabase = getSupabase();
    if (!supabase || !position) return;
    const reports = positions.filter(p => p.reports_to === position.id).length;
    if (!window.confirm(fmt(reports ? o.removeConfirmReports : o.removeConfirm, { title: position.title, n: reports }))) return;
    setBusy(true);
    const { error } = await supabase.from("positions").delete().eq("id", position.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(o.removed);
    onDone();
    router.refresh();
  };

  return (
    <div className="space-y-3 rounded-xl border-2 border-[#009f67]/40 bg-[#f2fbf7] p-3">
      <div>
        <label className={label} htmlFor="oa-title">{o.jobTitle}</label>
        <input id="oa-title" value={d.title} onChange={set("title")} maxLength={120} className={field} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={label} htmlFor="oa-dept">{o.department}</label>
          <select id="oa-dept" value={d.department_id} onChange={set("department_id")} className={field}>
            <option value="">{o.leadership}</option>
            {DEPARTMENTS.map(x => <option key={x.id} value={x.id}>{deptName(t, x.id)}</option>)}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="oa-team">{o.team}</label>
          <input id="oa-team" value={d.team} onChange={set("team")} maxLength={80} className={field} />
        </div>
      </div>
      <div>
        <label className={label} htmlFor="oa-mgr">{o.reportsTo}</label>
        <select id="oa-mgr" value={d.reports_to} onChange={set("reports_to")} className={field}>
          <option value="">{o.nobody}</option>
          {managers.map(p => (
            <option key={p.id} value={p.id}>{names.get(p.person_id)} — {p.title}{p.department_id ? ` (${deptName(t, p.department_id)})` : ""}</option>
          ))}
        </select>
      </div>
      <div>
        <label className={label} htmlFor="oa-level">{o.level}</label>
        <select id="oa-level" value={d.level} onChange={set("level")} className={field}>
          <option value="">{fmt(o.automatic, { level: o.levels[inferLevel(d.title)] })}</option>
          {ORG_LEVELS.map(l => <option key={l} value={l}>{o.levels[l]}</option>)}
        </select>
        <p className="mt-1 text-[11px] text-gray-500">{o.levelHint}</p>
      </div>
      {wrongWay && (
        <p className="flex gap-1.5 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {fmt(o.wrongWay, { name: names.get(manager.person_id) ?? "", level: o.levels[levelOf(manager)] })}
        </p>
      )}
      <div className="flex items-center gap-2">
        {position && (
          <button type="button" onClick={remove} disabled={busy} aria-label={o.remove} title={o.remove} className="rounded-lg p-2 text-red-600 hover:bg-red-50 disabled:opacity-50">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
        <button type="button" onClick={onDone} className="ml-auto h-9 rounded-lg px-3 text-sm font-bold text-gray-600 hover:bg-white">{t.common.cancel}</button>
        <button type="button" onClick={save} disabled={busy} className="flex h-9 items-center gap-1.5 rounded-lg bg-[#009f67] px-4 text-sm font-bold text-white hover:bg-[#00704a] disabled:opacity-50">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t.common.save}
        </button>
      </div>
    </div>
  );
}
