"use client";

import { useState } from "react";
import { CheckCircle2, Gauge } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { useMounted } from "@/components/CalendarView";
import { fmt } from "@/lib/i18n/locale";
import { playbookQuality, qualityTone } from "@/lib/sopQuality";

type Input = Parameters<typeof playbookQuality>[0];

const TONE = {
  good: "border-[#9fdcc5] bg-[#e6f6f0] text-[#00704a]",
  ok: "border-amber-200 bg-amber-50 text-amber-800",
  low: "border-red-200 bg-red-50 text-red-700",
} as const;

export const localYmd = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** "82/100" chip; click to see what's missing. Shown to the playbook's team only. */
export function QualityChip({ p, compact = false }: { p: Input; compact?: boolean }) {
  const { t } = useI18n();
  const mounted = useMounted();
  const [open, setOpen] = useState(false);
  if (!mounted) return null;
  const q = playbookQuality(p, localYmd());
  const tone = TONE[qualityTone(q.score)];
  if (compact) return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${tone}`} title={t.sop.qualityHint}>{fmt(t.sop.quality, { score: q.score })}</span>;
  return (
    <span className="relative">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        className={`flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-bold ${tone}`}>
        <Gauge className="h-4 w-4" /> {fmt(t.sop.quality, { score: q.score })}
      </button>
      {open && (
        <span className="absolute right-0 top-11 z-20 block w-72 rounded-xl border border-gray-200 bg-white p-4 text-left shadow-lg">
          <QualityList p={p} />
        </span>
      )}
    </span>
  );
}

/** The score and the list of things still missing. */
export function QualityList({ p }: { p: Input }) {
  const { t } = useI18n();
  const mounted = useMounted();
  if (!mounted) return null;
  const q = playbookQuality(p, localYmd());
  return (
    <span className="block">
      <span className="block text-sm font-black text-gray-900">{fmt(t.sop.qualityTitle, { score: q.score })}</span>
      <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-gray-100">
        <span className={`block h-full rounded-full ${q.score >= 80 ? "bg-[#009f67]" : q.score >= 50 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${q.score}%` }} />
      </span>
      {q.missing.length ? (
        <span className="mt-3 block space-y-1">
          {q.missing.map(k => <span key={k} className="block text-sm text-gray-700">• {t.sop.checks[k]}</span>)}
        </span>
      ) : (
        <span className="mt-3 flex items-center gap-1.5 text-sm font-bold text-[#00704a]"><CheckCircle2 className="h-4 w-4" /> {t.sop.qualityDone}</span>
      )}
      <span className="mt-3 block text-[11px] text-gray-400">{t.sop.qualityHint}</span>
    </span>
  );
}
