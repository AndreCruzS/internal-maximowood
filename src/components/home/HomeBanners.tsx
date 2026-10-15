"use client";

import Link from "next/link";
import { BellRing, ClipboardList, KeyRound, ListChecks, Receipt } from "lucide-react";
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

/** For the IT team: new hires whose accounts still need setting up. */
export function ItSetupBanner({ count }: { count: number }) {
  const { t } = useI18n();
  if (!count) return null;
  return (
    <Link href="/onboarding?tab=it" className="flex items-center gap-3 rounded-xl border border-sky-300 bg-sky-50 px-4 py-3 text-sm font-bold text-sky-900 hover:bg-sky-100">
      <KeyRound className="h-5 w-5 shrink-0" />
      <span className="flex-1">{plural(t.hires, "itBanner", count)}</span>
      <span className="underline">{t.home.open}</span>
    </Link>
  );
}

/** For someone who is leaving: fill in the handover before the last day. */
export function HandoverBanner({ due }: { due: { last_day: string; handover_at: string | null } | null }) {
  const { t, tag } = useI18n();
  if (!due) return null;
  const date = new Date(`${due.last_day}T12:00:00`).toLocaleDateString(tag, { weekday: "long", month: "long", day: "numeric" });
  return (
    <Link href="/handover" className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900 hover:bg-amber-100">
      <ClipboardList className="h-5 w-5 shrink-0" />
      <span className="flex-1">{fmt(due.handover_at ? t.handover.bannerDone : t.handover.banner, { date })}</span>
      <span className="underline">{due.handover_at ? t.handover.edit : t.handover.fill}</span>
    </Link>
  );
}

/** A colleague used someone's card and the card owner asked them for the receipt. */
export function ReceiptAskBanner({ count }: { count: number }) {
  const { t } = useI18n();
  if (!count) return null;
  return (
    <Link href="/expenses" className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900 hover:bg-amber-100">
      <Receipt className="h-5 w-5 shrink-0" />
      <span className="flex-1">{plural(t.expenses, "askBanner", count)}</span>
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
