"use client";

import Link from "next/link";
import { CheckCircle2, ChevronRight, Lock, PlayCircle } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { companyColor, companyInk, companyName, type CompanyId } from "@/lib/intranet";
import { deptName } from "@/lib/i18n/text";
import { fmt } from "@/lib/i18n/locale";
import { firstOpenStep, type AttemptSummary, type TrainingModule } from "@/lib/onboarding";

/** The employee's training: GMX → brand → department, unlocked one step at a time. */
export default function TrainingPath({ path, attempts }: { path: TrainingModule[]; attempts: Record<string, AttemptSummary> }) {
  const { t } = useI18n();
  const open = firstOpenStep(path, attempts);
  const done = path.filter(m => attempts[m.id]?.passed).length;

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-black text-gray-900">{t.training.myPath}</h2>
          <p className="text-sm text-gray-500">{t.training.pathHint}</p>
        </div>
        {path.length > 0 && <p className="text-sm font-bold text-[#00704a]">{fmt(t.onboarding.progress, { done, total: path.length })}</p>}
      </div>
      {path.length > 0 && (
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full rounded-full bg-[#009f67] transition-all" style={{ width: `${(done / path.length) * 100}%` }} />
        </div>
      )}

      {path.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-gray-300 px-5 py-6 text-sm text-gray-500">{t.training.noPath}</p>
      ) : (
        <ol className="mt-5 space-y-2">
          {path.map((m, i) => {
            const a = attempts[m.id];
            const locked = i > open;
            const color = m.scope === "brand" ? companyColor(m.company_id) : companyColor(null);
            const ink = m.scope === "brand" ? companyInk(m.company_id) : companyInk(null);
            const label =
              m.scope === "gmx" ? t.training.scope.gmx : m.scope === "brand" ? companyName(m.company_id as CompanyId) : deptName(t, m.department_id);
            const inner = (
              <>
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-black"
                  style={a?.passed ? { background: "#009f67", color: "#fff" } : locked ? { background: "#f3f4f6", color: "#9ca3af" } : { background: `${color}26`, color: ink }}
                >
                  {a?.passed ? <CheckCircle2 className="h-5 w-5" /> : locked ? <Lock className="h-4 w-4" /> : i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-black uppercase tracking-widest" style={{ color: locked ? "#9ca3af" : ink }}>{label}</span>
                  <span className={`block font-bold ${locked ? "text-gray-400" : "text-gray-900"}`}>{m.title}</span>
                  {m.summary && <span className="block truncate text-sm text-gray-500">{m.summary}</span>}
                </span>
                <span className="shrink-0 text-xs font-bold">
                  {a?.passed ? (
                    <span className="text-[#00704a]">{fmt(t.hires.passed, { score: a.best })}</span>
                  ) : locked ? (
                    <span className="text-gray-400">{t.training.locked}</span>
                  ) : (
                    <span className="flex items-center gap-1 rounded-full bg-[#009f67] px-3 py-1.5 text-white">
                      <PlayCircle className="h-3.5 w-3.5" /> {a ? t.training.retry : t.training.start}
                    </span>
                  )}
                </span>
                {!locked && <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" />}
              </>
            );
            return (
              <li key={m.id}>
                {locked ? (
                  <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3">{inner}</div>
                ) : (
                  <Link href={`/onboarding/learn/${m.id}`} className="flex items-center gap-3 rounded-xl border border-gray-200 p-3 transition-all hover:border-[#009f67] hover:shadow-sm">
                    {inner}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
