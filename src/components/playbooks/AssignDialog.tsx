"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Loader2, MessageSquare, Search, X } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";
import { DEPARTMENTS } from "@/lib/intranet";
import { deptName } from "@/lib/i18n/text";
import { plural } from "@/lib/i18n/dictionaries";
import type { Playbook } from "@/lib/playbooks";
import { localYmd } from "@/components/playbooks/Quality";

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const plusDays = (n: number) => localYmd(new Date(Date.now() + n * 86_400_000));

/** "Assign to read": pick people (or a whole department), an optional due date and a note. */
export default function AssignDialog({ playbook, people, departments, alreadyOpen, myPersonId, onClose }: {
  playbook: Pick<Playbook, "id" | "title">;
  people: { id: string; full_name: string }[];
  departments: Record<string, string[]>;
  /** People who already have it open (skipped). */
  alreadyOpen: string[];
  myPersonId: string | null;
  onClose: () => void;
}) {
  const { t, tag } = useI18n();
  const s = t.sop;
  const router = useRouter();
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [due, setDue] = useState<"none" | "3" | "7" | "custom">("7");
  const [custom, setCustom] = useState("");
  const [withNote, setWithNote] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const open = useMemo(() => new Set(alreadyOpen), [alreadyOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const list = useMemo(() => {
    const terms = fold(q).split(/\s+/).filter(Boolean);
    return people.filter(p => terms.every(x => fold(p.full_name).includes(x)));
  }, [people, q]);
  const toggle = (id: string) => setPicked(x => (x.includes(id) ? x.filter(y => y !== id) : [...x, id]));
  const addDept = (dept: string) => {
    const active = new Set(people.map(p => p.id));
    setPicked(x => [...new Set([...x, ...(departments[dept] ?? []).filter(id => active.has(id) && !open.has(id))])]);
  };
  const dueOn = due === "none" ? null : due === "custom" ? custom || null : plusDays(Number(due));
  const label = (ymd: string) => new Date(`${ymd}T12:00:00`).toLocaleDateString(tag, { weekday: "short", month: "short", day: "numeric" });
  const toSend = picked.filter(id => !open.has(id));

  const send = async () => {
    const supabase = getSupabase();
    if (!supabase || !toSend.length) return;
    setBusy(true);
    const { error } = await supabase.from("playbook_assignments").insert(
      toSend.map(person_id => ({ playbook_id: playbook.id, person_id, assigned_by_person_id: myPersonId, due_on: dueOn, note: withNote ? note.trim() : "" })),
    );
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(plural(s, "assigned", toSend.length));
    onClose();
    router.refresh();
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="assign-title" onClick={e => e.stopPropagation()}
        className="flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white shadow-xl sm:m-4 sm:h-auto sm:max-h-[calc(100vh-2rem)] sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 p-5">
          <div className="min-w-0">
            <h2 id="assign-title" className="text-xl font-black text-gray-900">{s.assignTitle}</h2>
            <p className="mt-0.5 truncate text-sm text-gray-500">{playbook.title}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t.common.cancel} className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-5 p-5">
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-black text-gray-900">{s.whoShouldRead}</p>
              {picked.length > 0 && <span className="text-xs font-bold text-[#00704a]">{plural(s, "selected", picked.length)}</span>}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder={s.searchPeople} aria-label={s.searchPeople}
                  className="h-10 w-full rounded-lg border border-gray-300 pl-9 pr-3 text-sm outline-none focus:border-[#009f67]" />
              </label>
              <select value="" onChange={e => e.target.value && addDept(e.target.value)} aria-label={s.addDepartment}
                className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-[#009f67]">
                <option value="">{s.addDepartment}</option>
                {DEPARTMENTS.filter(d => departments[d.id]?.length).map(d => <option key={d.id} value={d.id}>{deptName(t, d.id)}</option>)}
              </select>
            </div>
            <ul className="mt-2 max-h-64 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200">
              {list.map(p => (
                <li key={p.id}>
                  <label className={`flex items-center gap-3 px-3 py-2 text-sm ${open.has(p.id) ? "text-gray-400" : "cursor-pointer hover:bg-gray-50"}`}>
                    <input type="checkbox" checked={picked.includes(p.id) || open.has(p.id)} disabled={open.has(p.id)} onChange={() => toggle(p.id)} className="h-4 w-4 accent-[#009f67]" />
                    <span className="min-w-0 flex-1 truncate">{p.full_name}</span>
                    {open.has(p.id) && <span className="text-xs">{s.alreadyOpen}</span>}
                  </label>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-gray-200 p-4">
            <p className="mb-3 flex items-center gap-2 text-sm font-black text-gray-900"><CalendarDays className="h-4 w-4 text-[#00704a]" /> {s.dueDate}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {([["none", s.noDue, ""], ["3", s.in3, label(plusDays(3))], ["7", s.in1w, label(plusDays(7))], ["custom", s.custom, ""]] as const).map(([k, title, sub]) => (
                <label key={k} className={`flex cursor-pointer items-center gap-2 rounded-lg border-2 px-3 py-2 text-sm ${due === k ? "border-[#009f67] bg-[#f2fbf7]" : "border-gray-200"}`}>
                  <input type="radio" name="due" checked={due === k} onChange={() => setDue(k)} className="accent-[#009f67]" />
                  <span>
                    <span className="block font-bold text-gray-900">{title}</span>
                    {sub && <span className="block text-xs text-gray-500">{sub}</span>}
                  </span>
                </label>
              ))}
            </div>
            {due === "custom" && (
              <input type="date" value={custom} min={localYmd()} onChange={e => setCustom(e.target.value)} aria-label={s.custom}
                className="mt-2 h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-[#009f67]" />
            )}
          </div>

          <div className="rounded-xl border border-gray-200 p-4">
            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-sm font-black text-gray-900"><MessageSquare className="h-4 w-4 text-[#00704a]" /> {s.note}</span>
              <input type="checkbox" checked={withNote} onChange={e => setWithNote(e.target.checked)} className="h-4 w-4 accent-[#009f67]" />
            </label>
            {withNote && (
              <textarea value={note} onChange={e => setNote(e.target.value)} maxLength={500} rows={3} placeholder={s.notePlaceholder} aria-label={s.note}
                className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#009f67]" />
            )}
          </div>
        </div>

        <div className="mt-auto border-t border-gray-200 p-5">
          <button type="button" onClick={send} disabled={busy || !toSend.length || (due === "custom" && !custom)}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#009f67] text-sm font-bold text-white hover:bg-[#00704a] disabled:bg-gray-200 disabled:text-gray-500">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {toSend.length ? plural(s, "sendAssign", toSend.length) : s.pickPeople}
          </button>
        </div>
      </div>
    </div>
  );
}
