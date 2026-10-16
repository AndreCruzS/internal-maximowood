"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plane } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { DEPARTMENTS } from "@/lib/intranet";
import { deptName } from "@/lib/i18n/text";
import { plural } from "@/lib/i18n/dictionaries";
import { TRAVEL_STATUSES, firstDate, type TravelRequest, type TravelStatus } from "@/lib/travel";
import type { TravelData } from "@/server/travel";
import TravelWizard from "@/components/travel/TravelWizard";
import TravelRequestCard from "@/components/travel/TravelRequestCard";

const select = "h-9 rounded-lg border border-gray-300 bg-white px-2 text-sm";

export default function TravelView({ data }: { data: TravelData }) {
  const { t } = useI18n();
  const x = t.travel;
  const [editing, setEditing] = useState<TravelRequest | null>(null);
  const [status, setStatus] = useState<"" | TravelStatus | "open">("open");
  const [urgency, setUrgency] = useState("");
  const [dept, setDept] = useState("");
  const names = useMemo(() => Object.fromEntries(data.people.map(p => [p.id, p.full_name])), [data.people]);
  const userNames = useMemo(() => Object.fromEntries(data.people.filter(p => p.user_id).map(p => [p.user_id!, p.full_name])), [data.people]);
  const eventsFor = (id: string) => data.events.filter(e => e.request_id === id);
  const filesFor = (id: string) => data.files.filter(f => f.request_id === id);

  const queue = data.queue
    .filter(r => (status === "open" ? !["completed", "cancelled"].includes(r.status) : !status || r.status === status))
    .filter(r => !urgency || r.urgency >= Number(urgency))
    .filter(r => !dept || r.department_id === dept)
    .sort((a, b) => (a.depart_on ?? firstDate(a) ?? "9999").localeCompare(b.depart_on ?? firstDate(b) ?? "9999"));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-black uppercase tracking-widest text-[#00704a]">{t.tools["/travel"]?.name}</p>
        <h1 className="flex items-center gap-2 text-3xl font-black text-gray-900"><Plane className="h-7 w-7 text-[#00704a]" /> {x.title}</h1>
        <p className="mt-1 max-w-2xl text-gray-500">
          {x.subtitle} <Link href="/travel-policy" className="font-bold text-[#00704a] hover:underline">{x.viewPolicy}</Link>
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <TravelWizard key={editing?.id ?? "new"} data={data} editing={editing} onDone={() => setEditing(null)} />
        <section className="self-start rounded-2xl border border-gray-200 bg-gray-50 p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-black text-gray-900">{x.myRequests}</h2>
            <span className="text-xs text-gray-500">{plural(x, "requestCount", data.mine.length)}</span>
          </div>
          {data.mine.length ? (
            <ul className="space-y-2">
              {data.mine.map(r => (
                <TravelRequestCard key={r.id} r={r} names={names} userNames={userNames} events={eventsFor(r.id)} files={filesFor(r.id)}
                  onEdit={() => { setEditing(r); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
              ))}
            </ul>
          ) : <p className="rounded-lg border border-dashed border-gray-300 bg-white p-4 text-sm text-gray-500">{x.none}</p>}
        </section>
      </div>

      {data.isProcurement && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-black text-gray-900">{x.queue}</h2>
            <div className="flex flex-wrap gap-2">
              <select value={status} onChange={e => setStatus(e.target.value as typeof status)} aria-label={x.setStatus} className={select}>
                <option value="open">{x.upcoming}</option>
                <option value="">{x.allStatus}</option>
                {TRAVEL_STATUSES.map(s => <option key={s} value={s}>{x.status[s]}</option>)}
              </select>
              <select value={urgency} onChange={e => setUrgency(e.target.value)} aria-label={x.urgency} className={select}>
                <option value="">{x.allUrgency}</option>
                {[5, 4, 3].map(u => <option key={u} value={u}>≥ {u}</option>)}
              </select>
              <select value={dept} onChange={e => setDept(e.target.value)} aria-label={x.department} className={select}>
                <option value="">{x.allDepartments}</option>
                {DEPARTMENTS.map(d => <option key={d.id} value={d.id}>{deptName(t, d.id)}</option>)}
              </select>
            </div>
          </div>
          {queue.length ? (
            <ul className="grid gap-3 lg:grid-cols-2">
              {queue.map(r => (
                <TravelRequestCard key={r.id} r={r} names={names} userNames={userNames} events={eventsFor(r.id)} files={filesFor(r.id)} procurement internalNotes={data.internal[r.id] ?? ""} />
              ))}
            </ul>
          ) : <p className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">{x.queueEmpty}</p>}
        </section>
      )}
    </div>
  );
}
