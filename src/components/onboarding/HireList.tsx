"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronRight, Mail, Phone, UserPlus } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { useMounted } from "@/components/CalendarView";
import { companyInk, companyName, type CompanyId } from "@/lib/intranet";
import { deptName } from "@/lib/i18n/text";
import { fmt } from "@/lib/i18n/locale";
import type { HireStatus, NewHire } from "@/lib/onboarding";

export const STATUS_STYLE: Record<HireStatus, string> = {
  it_setup: "bg-amber-100 text-amber-800",
  ready: "bg-sky-100 text-sky-800",
  onboarding: "bg-[#e6f6f0] text-[#00704a]",
  done: "bg-gray-100 text-gray-600",
  cancelled: "bg-gray-100 text-gray-400",
};

const DAY = 86_400_000;

/** New hires, soonest start first; "it" mode is IT's queue of setups to do. */
export default function HireList({ hires, names, userNames, mode, canAdd }: {
  hires: NewHire[];
  names: Record<string, string>;
  userNames: Record<string, string>;
  mode: "hires" | "it";
  canAdd: boolean;
}) {
  const { t, tag } = useI18n();
  const mounted = useMounted();
  const [now] = useState(() => Date.now());
  const date = (ymd: string) => new Date(`${ymd}T12:00:00`).toLocaleDateString(tag, { weekday: "short", month: "short", day: "numeric" });
  const soon = (h: NewHire) => mounted && h.status === "it_setup" && !!h.start_date && new Date(`${h.start_date}T12:00:00`).getTime() - now < 7 * DAY;

  return (
    <div className="space-y-4">
      {mode === "hires" && canAdd && (
        <Link href="/onboarding/new" className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#009f67] px-4 text-sm font-bold text-white">
          <UserPlus className="h-4 w-4" /> {t.hires.add}
        </Link>
      )}
      {mode === "it" && <p className="text-sm text-gray-500">{t.hires.itHint}</p>}

      {hires.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 bg-white px-5 py-8 text-center text-sm text-gray-500">
          {mode === "it" ? t.hires.itEmpty : t.hires.empty}
        </p>
      ) : (
        <ul className="space-y-2">
          {hires.map(h => (
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
                <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
