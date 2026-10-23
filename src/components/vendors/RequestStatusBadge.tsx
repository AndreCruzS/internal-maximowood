"use client";

import { useI18n } from "@/components/I18nProvider";
import { stage, type RequestKind, type RequestStatus } from "@/lib/vendorRequests";

const STYLE: Record<string, string> = {
  draft: "bg-gray-50 text-gray-600 border-gray-200",
  submitted: "bg-amber-50 text-amber-800 border-amber-200",
  dept_confirmed: "bg-amber-50 text-amber-800 border-amber-200",
  pending_approval: "bg-amber-50 text-amber-800 border-amber-200",
  needs_info: "bg-sky-50 text-sky-800 border-sky-200",
  approved: "bg-[#f2fbf7] text-[#00704a] border-[#9fdcc5]",
  registered: "bg-[#009f67] text-white border-[#009f67]",
  reviewed: "bg-[#009f67] text-white border-[#009f67]",
  rejected: "bg-red-50 text-red-700 border-red-200",
  cancelled: "bg-gray-100 text-gray-500 border-gray-200",
};

/** A request's status, shown as "registered at the bank" once Payments set it up. */
export default function RequestStatusBadge({ status, registeredAt, kind }: { status: RequestStatus; registeredAt: string | null; kind?: RequestKind }) {
  const { t } = useI18n();
  const s = stage({ status, registered_at: registeredAt, kind });
  return (
    <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-bold ${STYLE[s] ?? STYLE.draft}`}>
      {t.vendorRequests.status[s as keyof typeof t.vendorRequests.status] ?? s}
    </span>
  );
}
