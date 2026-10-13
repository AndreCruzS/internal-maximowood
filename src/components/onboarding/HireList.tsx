"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronRight, Mail, Phone, Search, UserPlus } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { useMounted } from "@/components/CalendarView";
import { companyInk, companyName, type CompanyId } from "@/lib/intranet";
import { deptName } from "@/lib/i18n/text";
import { fmt } from "@/lib/i18n/locale";
import { isComplete, type HireProgress, type HireStatus, type NewHire } from "@/lib/onboarding";

export const STATUS_STYLE: Record<HireStatus, string> = {
  it_setup: "bg-amber-100 text-amber-800",
  ready: "bg-sky-100 text-sky-800",
  onboarding: "bg-[#e6f6f0] text-[#00704a]",
  done: "bg-gray-100 text-gray-600",
  cancelled: "bg-gray-100 text-gray-400",
};

const DAY = 86_400_000;

/** "Leader & IT 4/9" with a bar. */
export function ProgressBar({ label, value: [done, total], compact }: { label: string; value: [number, number]; compact?: boolean }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className={compact ? "w-36" : ""}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-bold text-gray-500">{label}</span>
        <span className="font-bold text-gray-400">{done}/{total}</span>
      </div>
      <div className={`mt-1 overflow-hidden rounded-full bg-gray-100 ${compact ? "h-1.5" : "h-2"}`}>
        <div className={`h-full rounded-full transition-all ${pct === 100 ? "bg-[#009f67]" : "bg-sky-500"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** New hires, soonest start first; "it" mode is IT's queue of setups to do. */
export default function HireList({ hires, progress, names, userNames, mode, canAdd }: {
  hires: NewHire[];
  progress: Record<string, HireProgress>;
  names: Record<string, string>;
  userNames: Record<string, string>;
  mode: "hires" | "it";
  canAdd: boolean;
}) {
  const { t, tag } = useI18n();
  const mounted = useMounted();
  const [now] = useState(() => Date.now());
  const date = (ymd: string) => new Date(`${ymd}T12:00:00`).toLocaleDateString(tag, { weekday: "short", month: "short", day: "numeric" });
  const [q, setQ] = useState("");
  const [incomplete, setIncomplete] = useState(true);
  const shown = hires.filter(h => (!q.trim() || h.full_name.toLowerCase().includes(q.trim().toLowerCase())) && (!incomplete || !progress[h.id] || !isComplete(progress[h.id])));
  const soon = (h: NewHire) => mounted && h.status === "it_setup" && !!h.start_date && new Date(`${h.start_date}T12:00:00`).getTime() - now < 7 * DAY;

  return (
    <div className="space-y-4">
      {mode === "hires" && canAdd && (
        <Link href="/onboarding/new" className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#009f67] px-4 text-sm font-bold text-white">
          <UserPlus className="h-4 w-4" /> {t.hires.add}
        </Link>
      )}
      {mode === "it" && <p className="text-sm text-gray-500">{t.hires.itHint}</p>}

      {hires.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder={t.prehire.search} aria-label={t.prehire.search}
              className="h-10 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-[#009f67]" />
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-gray-700">
            {t.prehire.incompleteOnly}
            <button type="button" role="switch" aria-checked={incomplete} onClick={() => setIncomplete(v => !v)}
              className={`relative h-6 w-11 rounded-full transition-colors ${incomplete ? "bg-[#009f67]" : "bg-gray-300"}`}>
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${incomplete ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </label>
        </div>
      )}

      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 bg-white px-5 py-8 text-center text-sm text-gray-500">
          {hires.length > 0 ? t.prehire.noMatch : mode === "it" ? t.hires.itEmpty : t.hires.empty}
        </p>
      ) : (
        <ul className="space-y-2">
          {shown.map(h => (
            <li key={h.id}>
              <Link href={`/onboarding/hires/${h.id}`} className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:border-[#009f67] hover:shadow-md">
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-gray-900">{h.full_name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_STYLE[h.status]}`}>{t.hires.status[h.status]}</span>
                    {soon(h) && (
                      <span className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700">
                        <AlertTriangle className="h-3 w-3" /> {t.hires.overdue}
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-sm text-gray-500">
                    {h.title}
                    {h.department_id ? ` · ${deptName(t, h.department_id)}` : ""}
                    {h.company_id ? (
                      <span style={{ color: companyInk(h.company_id) }}> · {companyName(h.company_id as CompanyId)}</span>
                    ) : null}
                    {h.reports_to && names[h.reports_to] ? ` · ${t.hires.reportsTo}: ${names[h.reports_to]}` : ""}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-400">
                    {h.start_date && <span>{fmt(t.hires.starts, { date: date(h.start_date) })}</span>}
                    {h.needs_email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {t.hires.email}</span>}
                    {h.needs_phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" /> {h.phone_area_code ? fmt(t.hires.phone, { code: h.phone_area_code }) : t.hires.phoneAny}
                      </span>
                    )}
                    {h.created_by && userNames[h.created_by] && <span>{fmt(t.hires.addedBy, { name: userNames[h.created_by] })}</span>}
                  </span>
                </span>
                {progress[h.id] && (
                  <span className="hidden shrink-0 space-y-2 sm:block">
                    <ProgressBar compact label={t.prehire.leaderShort} value={progress[h.id].leader} />
                    <ProgressBar compact label={t.prehire.employeeShort} value={progress[h.id].employee} />
                  </span>
                )}
                <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
