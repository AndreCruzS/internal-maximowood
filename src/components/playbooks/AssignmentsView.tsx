"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { useMounted } from "@/components/CalendarView";
import { DEPARTMENTS } from "@/lib/intranet";
import { deptName } from "@/lib/i18n/text";
import { fmt } from "@/lib/i18n/locale";
import { STATE_STYLE, assignmentState, type Assignment } from "@/components/playbooks/PlaybookDetail";
import { localYmd } from "@/components/playbooks/Quality";

export type TrackedAssignment = Assignment & { playbook_id: string; playbooks: { title: string; department_id: string } | null };
type State = "open" | "overdue" | "done";

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

export default function AssignmentsView({ rows, people, initialDept }: {
  rows: TrackedAssignment[];
  people: Record<string, { name: string; photo: string | null }>;
  initialDept: string;
}) {
  const { t, tag } = useI18n();
  const s = t.sop;
  const mounted = useMounted();
  const today = mounted ? localYmd() : "";
  const [tab, setTab] = useState<"people" | "all">("people");
  const [dept, setDept] = useState(initialDept);
  const [status, setStatus] = useState<"" | State>("");
  const [who, setWho] = useState<string | null>(null);
  const date = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString(tag, { month: "short", day: "numeric", year: "2-digit" });
  const name = (id: string | null) => (id && people[id]?.name) || s.unknown;

  const scoped = useMemo(
    () => rows.map(r => ({ ...r, state: assignmentState(r, today) as State })).filter(r => !dept || r.playbooks?.department_id === dept),
    [rows, dept, today],
  );
  const filtered = scoped.filter(r => (!status || r.state === status) && (!who || r.person_id === who));
  const count = (st: State) => scoped.filter(r => r.state === st).length;

  const byPerson = useMemo(() => {
    const m = new Map<string, { total: number; open: number; overdue: number; done: number }>();
    for (const r of scoped) {
      const x = m.get(r.person_id) ?? { total: 0, open: 0, overdue: 0, done: 0 };
      x.total++;
      x[r.state]++;
      m.set(r.person_id, x);
    }
    return [...m.entries()].sort(([a], [b]) => name(a).localeCompare(name(b)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoped]);

  const kpis: [string, string][] = [
    [s.totalSent, String(scoped.length)],
    [s.openPct, `${pct(count("open") + count("overdue"), scoped.length)}%`],
    [s.overduePct, `${pct(count("overdue"), scoped.length)}%`],
    [s.completedPct, `${pct(count("done"), scoped.length)}%`],
  ];
  const select = "h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-[#009f67]";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-black text-gray-900"><ClipboardCheck className="h-7 w-7 text-[#00704a]" /> {s.trackTitle}</h1>
          <p className="text-gray-500">{s.trackSubtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={dept} onChange={e => setDept(e.target.value)} aria-label={s.allDepartments} className={select}>
            <option value="">{s.allDepartments}</option>
            {DEPARTMENTS.map(d => <option key={d.id} value={d.id}>{deptName(t, d.id)}</option>)}
          </select>
          <select value={status} onChange={e => setStatus(e.target.value as "" | State)} aria-label={s.allStatus} className={select}>
            <option value="">{s.allStatus}</option>
            {(["open", "overdue", "done"] as const).map(k => <option key={k} value={k}>{s.status[k]}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400">{label}</p>
            <p className="mt-2 text-3xl font-black text-gray-900">{value}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-1 border-b border-gray-200" role="tablist">
        {(["people", "all"] as const).map(k => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => { setTab(k); if (k === "people") setWho(null); }}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-bold ${tab === k ? "border-[#009f67] text-[#00704a]" : "border-transparent text-gray-500 hover:text-gray-800"}`}>
            {k === "people" ? `${s.byPerson} (${byPerson.length})` : `${s.allAssignments} (${scoped.length})`}
          </button>
        ))}
      </div>

      {!scoped.length ? (
        <p className="rounded-xl border border-dashed border-gray-300 bg-white px-5 py-8 text-center text-sm text-gray-500">{s.noAssignments}</p>
      ) : tab === "people" ? (
        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs font-bold text-gray-500">
              <tr>
                <th className="px-4 py-3">{s.name}</th>
                <th className="px-4 py-3 text-right">{s.total}</th>
                <th className="px-4 py-3 text-right">{s.status.open}</th>
                <th className="px-4 py-3 text-right">{s.status.overdue}</th>
                <th className="px-4 py-3 text-right">{s.status.done}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {byPerson.map(([id, x]) => (
                <tr key={id} className="cursor-pointer hover:bg-gray-50" onClick={() => { setWho(id); setTab("all"); }}>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-3">
                      {people[id]?.photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={people[id].photo!} alt="" className="h-8 w-8 rounded-full object-cover" />
                      ) : (
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#e6f6f0] text-xs font-black text-[#00704a]">{name(id).charAt(0)}</span>
                      )}
                      <span className="font-bold text-gray-900">{name(id)}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-bold">{x.total}</td>
                  <td className="px-4 py-3 text-right">{pct(x.open, x.total)}%</td>
                  <td className={`px-4 py-3 text-right ${x.overdue ? "font-bold text-red-700" : ""}`}>{pct(x.overdue, x.total)}%</td>
                  <td className="px-4 py-3 text-right">{pct(x.done, x.total)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-2">
          {who && (
            <button type="button" onClick={() => setWho(null)} className="rounded-full bg-[#e6f6f0] px-3 py-1 text-xs font-bold text-[#00704a]">
              {name(who)} ✕
            </button>
          )}
          <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs font-bold text-gray-500">
                <tr>
                  <th className="px-4 py-3">{s.playbook}</th>
                  <th className="px-4 py-3">{s.person}</th>
                  <th className="px-4 py-3">{s.note}</th>
                  <th className="px-4 py-3">{s.sentOn}</th>
                  <th className="px-4 py-3">{s.due}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(r => (
                  <tr key={r.id}>
                    <td className="px-4 py-3">
                      <Link href={`/playbooks/${r.playbook_id}`} className="font-bold text-gray-900 hover:underline">{r.playbooks?.title ?? "—"}</Link>
                      {r.playbooks && <span className="block text-xs text-gray-500">{deptName(t, r.playbooks.department_id)}</span>}
                    </td>
                    <td className="px-4 py-3">
                      {name(r.person_id)}
                      {r.assigned_by_person_id && <span className="block text-xs text-gray-500">{fmt(s.sentBy, { name: name(r.assigned_by_person_id) })}</span>}
                    </td>
                    <td className="max-w-[16rem] truncate px-4 py-3 text-gray-600" title={r.note}>{r.note || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600">{date(r.created_at)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600">{r.completed_at ? fmt(s.doneOn, { date: date(r.completed_at) }) : r.due_on ? date(r.due_on) : "—"}</td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATE_STYLE[r.state]}`}>{s.status[r.state]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
