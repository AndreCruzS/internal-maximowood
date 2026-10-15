"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ClipboardList, LogOut } from "lucide-react";
import { HandoverSummary } from "@/components/onboarding/Handover";
import type { HandoverRow } from "@/lib/handover";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";
import { fmt } from "@/lib/i18n/locale";

export type OffboardingRow = {
  id: string;
  person_id: string;
  last_day: string;
  notes: string;
  status: "requested" | "done" | "cancelled";
  created_by: string | null;
  created_at: string;
  done_at: string | null;
} & Partial<Pick<HandoverRow, "handover" | "successor_id" | "handover_at">>;

/** Offboardings: open ones first (IT marks them done), then recently finished. */
export default function OffboardingList({ rows, names, userNames, isIt }: { rows: OffboardingRow[]; names: Record<string, string>; userNames: Record<string, string>; isIt: boolean }) {
  const { t, tag } = useI18n();
  const router = useRouter();
  const date = (ymd: string) => new Date(`${ymd}T12:00:00`).toLocaleDateString(tag, { weekday: "short", month: "short", day: "numeric" });
  const open = rows.filter(r => r.status === "requested").sort((a, b) => a.last_day.localeCompare(b.last_day));
  const done = rows.filter(r => r.status === "done");

  const complete = async (r: OffboardingRow) => {
    const supabase = getSupabase();
    if (!supabase || !window.confirm(fmt(t.offboarding.doneConfirm, { name: names[r.person_id] ?? "" }))) return;
    const { error } = await supabase.rpc("complete_offboarding", { offboarding: r.id });
    if (error) return toast.error(error.message);
    toast.success(t.offboarding.completed);
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">{t.offboarding.listHint}</p>
      {open.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 bg-white px-5 py-8 text-center text-sm text-gray-500">{t.offboarding.empty}</p>
      ) : (
        <ul className="space-y-2">
          {open.map(r => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <LogOut className="h-5 w-5 shrink-0 text-amber-600" />
              <span className="min-w-0 flex-1">
                <Link href={`/people/${r.person_id}`} className="font-bold text-gray-900 hover:underline">{names[r.person_id] ?? "—"}</Link>
                <span className="block text-sm text-gray-500">
                  {fmt(t.offboarding.lastDayOn, { date: date(r.last_day) })}
                  {r.created_by && userNames[r.created_by] ? ` · ${fmt(t.hires.addedBy, { name: userNames[r.created_by] })}` : ""}
                </span>
                {r.notes && <span className="block text-sm text-gray-600">{r.notes}</span>}
                <Handover r={r} names={names} />
              </span>
              {isIt && (
                <button type="button" onClick={() => complete(r)} className="flex h-9 items-center gap-1.5 rounded-lg bg-[#009f67] px-3 text-sm font-bold text-white">
                  <CheckCircle2 className="h-4 w-4" /> {t.offboarding.markDone}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {done.length > 0 && (
        <details className="rounded-xl border border-gray-200 bg-white p-4 text-sm">
          <summary className="cursor-pointer font-bold text-gray-700">{fmt(t.offboarding.finished, { n: done.length })}</summary>
          <ul className="mt-2 space-y-1 text-gray-600">
            {done.map(r => (
              <li key={r.id}>
                {names[r.person_id] ?? "—"} · {fmt(t.offboarding.lastDayOn, { date: date(r.last_day) })}
                <Handover r={r} names={names} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** The handover answers under an offboarding: open them, or fill them in while it's open. */
function Handover({ r, names }: { r: OffboardingRow; names: Record<string, string> }) {
  const { t } = useI18n();
  if (r.handover_at) {
    return (
      <details className="mt-2 rounded-lg bg-gray-50 px-3 py-2">
        <summary className="cursor-pointer text-sm font-bold text-[#00704a]">{t.handover.view}</summary>
        <div className="mt-2">
          <HandoverSummary row={{ ...r, handover: r.handover ?? null, successor_id: r.successor_id ?? null, handover_at: r.handover_at }} names={names} />
          {r.status === "requested" && <Link href={`/handover?id=${r.id}`} className="mt-2 inline-block text-sm font-bold text-[#00704a] hover:underline">{t.handover.edit}</Link>}
        </div>
      </details>
    );
  }
  if (r.status !== "requested") return null;
  return (
    <Link href={`/handover?id=${r.id}`} className="mt-1 inline-flex items-center gap-1 text-sm font-bold text-amber-700 hover:underline">
      <ClipboardList className="h-4 w-4" /> {t.handover.notFilled}
    </Link>
  );
}
