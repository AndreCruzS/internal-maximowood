"use client";

import Link from "next/link";
import { BellRing, ListChecks } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { plural } from "@/lib/i18n/dictionaries";
import { fmt } from "@/lib/i18n/locale";

export function MustReadBanner({ count }: { count: number }) {
  const { t } = useI18n();
  if (!count) return null;
  return (
    <Link href="/news?filter=must-read" className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900 hover:bg-amber-100">
      <BellRing className="h-5 w-5 shrink-0" />
      <span className="flex-1">{plural(t.home, "mustRead", count)}</span>
      <span className="underline">{t.home.open}</span>
    </Link>
  );
}

export function OnboardingCard({ total, done }: { total: number; done: number }) {
  const { t } = useI18n();
  if (!total || done >= total) return null;
  const pct = Math.round((done / total) * 100);
  return (
    <Link href="/onboarding" className="flex items-center gap-4 rounded-xl border border-[#9fdcc5] bg-[#f2fbf7] px-4 py-3 hover:bg-[#e6f6f0]">
      <ListChecks className="h-5 w-5 shrink-0 text-[#00704a]" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-gray-900">{t.home.onboardingTitle}</span>
        <span className="mt-1 block h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-white">
          <span className="block h-full rounded-full bg-[#009f67]" style={{ width: `${pct}%` }} />
        </span>
      </span>
      <span className="shrink-0 text-xs font-bold text-[#00704a]">{fmt(t.home.onboardingProgress, { done, total })} →</span>
    </Link>
  );
}
