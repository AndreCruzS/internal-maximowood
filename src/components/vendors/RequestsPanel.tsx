"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { canApprove, canConfirm, canRegister, readPayload, type VendorRequestRow } from "@/lib/vendorRequests";
import RequestStatusBadge from "@/components/vendors/RequestStatusBadge";
import type { RequestsOverview } from "@/server/vendorRequests";

const card = "rounded-2xl border border-gray-200 bg-white p-5 shadow-sm";

/** The Requests tab: what's waiting for the viewer (department, approval, bank registration) and their own requests. */
export default function RequestsPanel({ data }: { data: RequestsOverview }) {
  const { t, tag } = useI18n();
  const v = t.vendorRequests;
  const approvals = (id: string) => data.approvals[id] ?? [];
  const toConfirm = data.requests.filter(r => canConfirm(data.me, r, data.confirmable).ok);
  const toApprove = data.requests.filter(r => canApprove(data.me, r, approvals(r.id), data.roles.isApprover).ok);
  const toRegister = data.requests.filter(r => canRegister(data.me, r, approvals(r.id), data.roles.isPayments).ok);
  const mine = data.requests.filter(r => r.requester_person_id === data.me);
  const all = data.roles.isStaff ? data.requests.filter(r => r.status !== "draft") : [];

  const list = (title: string, rows: VendorRequestRow[], empty: string, highlight = false) => (
    <section className={`${card} ${highlight && rows.length ? "border-[#009f67]" : ""}`}>
      <h2 className="mb-3 font-black text-gray-900">
        {title} {rows.length > 0 && <span className="ml-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{rows.length}</span>}
      </h2>
      {rows.length === 0 ? <p className="text-sm text-gray-400">{empty}</p> : (
        <ul className="divide-y divide-gray-100">
          {rows.map(r => {
            const p = readPayload(r.payload);
            return (
              <li key={r.id}>
                <Link href={r.status === "draft" && r.requester_person_id === data.me ? (r.kind === "change_bank" || r.kind === "change_details" ? `/vendors/change?id=${r.id}` : `/vendors/request?id=${r.id}`) : `/vendors/requests/${r.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 hover:bg-gray-50">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-gray-900">{p.vendor.legal_name || "—"}</span>
                    <span className="block text-xs text-gray-500">
                      {v.kind[r.kind]} · {(r.requester_person_id && data.people[r.requester_person_id]) || "—"} · {new Date(r.updated_at).toLocaleDateString(tag, { month: "short", day: "numeric" })}
                    </span>
                  </span>
                  <RequestStatusBadge status={r.status} registeredAt={r.registered_at} kind={r.kind} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Link href="/vendors/request" className="flex items-center gap-1.5 rounded-lg bg-[#009f67] px-4 py-2 text-sm font-bold text-white">
          <Plus className="h-4 w-4" /> {v.newRequest}
        </Link>
      </div>
      {data.confirmable.length > 0 && list(v.toConfirm, toConfirm, v.noneQueue, true)}
      {data.roles.isApprover && list(v.toApprove, toApprove, v.noneQueue, true)}
      {data.roles.isPayments && list(v.toRegister, toRegister, v.noneQueue, true)}
      {list(v.mine, mine, v.noneMine)}
      {all.length > 0 && list(v.all, all, v.noneQueue)}
    </div>
  );
}
