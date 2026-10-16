"use client";

import Link from "next/link";
import { BellRing, ClipboardList, KeyRound, ListChecks, Receipt, RefreshCw } from "lucide-react";
import { useMounted } from "@/components/CalendarView";
import { localYmd } from "@/components/playbooks/Quality";
import type { PlaybookTodo } from "@/server/intranet";
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

/** "Waiting for you": playbooks sent to the viewer to read (with due dates), and must-reads that changed. */
export function PlaybookTodos({ todos }: { todos: PlaybookTodo[] }) {
  const { t } = useI18n();
  const s = t.sop;
  const mounted = useMounted();
  if (!todos.length) return null;
  const today = mounted ? localYmd() : "";
  const days = (ymd: string) => Math.round((new Date(`${ymd}T12:00:00`).getTime() - new Date(`${today}T12:00:00`).getTime()) / 86_400_000);
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-black text-gray-900">
        {s.waiting} <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{todos.length}</span>
      </h2>
      <ul className="divide-y divide-gray-100">
        {todos.map(x => {
          const d = x.due_on && today ? days(x.due_on) : null;
          return (
            <li key={`${x.reason}-${x.playbook_id}`} className="flex flex-wrap items-center gap-3 py-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#e6f6f0]">
                {x.reason === "reconfirm" ? <RefreshCw className="h-4 w-4 text-[#00704a]" /> : <ClipboardList className="h-4 w-4 text-[#00704a]" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-gray-900">{x.title}</span>
                {x.note && <span className="block truncate text-xs text-gray-500">{x.note}</span>}
              </span>
              {x.reason === "reconfirm" ? (
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800">{s.reconfirmTag}</span>
              ) : d !== null ? (
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${d < 0 ? "bg-red-50 text-red-700" : d <= 1 ? "bg-amber-50 text-amber-800" : "bg-gray-100 text-gray-700"}`}>
                  {d < 0 ? plural(s, "overdueBy", -d) : d === 0 ? s.dueToday : plural(s, "dueIn", d)}
                </span>
              ) : null}
              <Link href={`/playbooks/${x.playbook_id}`} className="flex h-9 items-center rounded-lg border-2 border-[#009f67] px-4 text-sm font-bold text-[#00704a] hover:bg-[#f2fbf7]">{s.read}</Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
