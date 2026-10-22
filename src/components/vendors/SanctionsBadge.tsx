"use client";

import { ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import type { SanctionsStatus } from "@/lib/vendors";

/** OFAC check result as a small badge. */
export default function SanctionsBadge({ status }: { status: SanctionsStatus }) {
  const { t } = useI18n();
  const s = t.vendors.sanctions;
  const style =
    status === "match" ? "bg-red-50 text-red-700 border-red-200"
    : status === "possible_match" ? "bg-amber-50 text-amber-800 border-amber-200"
    : status === "clear" || status === "false_positive" ? "bg-[#f2fbf7] text-[#00704a] border-[#9fdcc5]"
    : "bg-gray-50 text-gray-500 border-gray-200";
  const Icon = status === "match" ? ShieldAlert : status === "possible_match" || status === "not_run" ? ShieldQuestion : ShieldCheck;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-bold ${style}`}>
      <Icon className="h-3 w-3" /> {s[status]}
    </span>
  );
}
