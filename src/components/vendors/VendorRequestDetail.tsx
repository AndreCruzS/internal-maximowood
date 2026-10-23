"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, Check, FileText, Landmark, Loader2, Pencil, ShieldAlert, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";
import { fmt } from "@/lib/i18n/locale";
import { deptName } from "@/lib/i18n/text";
import { masked } from "@/lib/vendors";
import {
  REGISTRATION_METHODS, approvalOutcome, canApprove, canConfirm, canRegister, readPayload, requesterCanCancel, screeningGate,
} from "@/lib/vendorRequests";
import SanctionsBadge from "@/components/vendors/SanctionsBadge";
import RequestStatusBadge from "@/components/vendors/RequestStatusBadge";
import type { RequestDetail } from "@/server/vendorRequests";

const card = "rounded-2xl border border-gray-200 bg-white p-5 shadow-sm";
const area = "w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm outline-none focus:border-[#009f67]";
const field = "h-9 w-full rounded-lg border border-gray-300 bg-white px-2.5 text-sm outline-none focus:border-[#009f67]";

/** One vendor request: what was asked, documents, sanctions check, approvals, timeline, and the viewer's next step. */
export default function VendorRequestDetail({ data }: { data: RequestDetail }) {
  const { t, tag } = useI18n();
  const r = data.request;
  const v = t.vendorRequests;
  const f = v.form;
  const a = v.actions;
  const router = useRouter();
  const p = readPayload(r.payload);
  const name = (id: string | null | undefined) => (id && data.people[id]) || "—";
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(tag, { dateStyle: "medium", timeStyle: "short" }) : "");
  const [note, setNote] = useState("");
  const [ack, setAck] = useState(false);
  const [fpNote, setFpNote] = useState("");
  const [method, setMethod] = useState<string>("callback");
  const [busy, setBusy] = useState<string | null>(null);

  const confirmAllowed = canConfirm(data.me, r, data.confirmable);
  const approveAllowed = canApprove(data.me, r, data.approvals, data.roles.isApprover);
  const registerAllowed = canRegister(data.me, r, data.approvals, data.roles.isPayments);
  const outcome = approvalOutcome(data.approvals, data.required);
  const gate = screeningGate(r.screening_status, ack, fpNote);
  const mine = data.me === r.requester_person_id;
  const latest = data.screenings[0];

  const act = async (body: Record<string, unknown>, key: string) => {
    setBusy(key);
    const res = await fetch(`/api/vendors/requests/${r.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(null);
    if (!res.ok) return toast.error(json.error ?? "Error");
    toast.success(a.done);
    setNote("");
    router.refresh();
  };
  const cancel = async () => {
    if (!window.confirm(v.detail.cancelConfirm)) return;
    setBusy("cancel");
    const { error } = await getSupabase()!.from("vendor_requests").update({ status: "cancelled" }).eq("id", r.id);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(v.detail.cancelled);
    router.refresh();
  };

  const row = (k: string, val: string | null | undefined) => (val ? (
    <div className="flex gap-2 text-sm"><span className="w-44 shrink-0 text-gray-500">{k}</span><span className="min-w-0 whitespace-pre-line text-gray-900">{val}</span></div>
  ) : null);
  const reason = (x: { ok: boolean; reason?: string }) => (!x.ok && x.reason && x.reason in a.why ? a.why[x.reason as keyof typeof a.why] : null);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Link href="/vendors?tab=requests" className="inline-flex items-center gap-1 text-sm font-bold text-gray-500 hover:text-gray-900">
        <ArrowLeft className="h-4 w-4" /> {v.detail.back}
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">{v.kind[r.kind]}</p>
          <h1 className="text-3xl font-black text-gray-900">{p.vendor.legal_name || "—"}</h1>
          {p.vendor.dba && <p className="text-gray-500">{p.vendor.dba}</p>}
          <p className="mt-1 text-sm text-gray-500">{fmt(v.detail.requestedBy, { name: name(r.requester_person_id), date: when(r.submitted_at ?? r.created_at) })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RequestStatusBadge status={r.status} registeredAt={r.registered_at} />
          {mine && (r.status === "draft" || r.status === "needs_info") && (
            <Link href={`/vendors/request?id=${r.id}`} className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-bold text-gray-700 hover:bg-gray-50">
              <Pencil className="h-3.5 w-3.5" /> {v.detail.edit}
            </Link>
          )}
          {mine && requesterCanCancel(r.status) && (
            <button type="button" onClick={cancel} disabled={!!busy} className="rounded-lg px-3 py-1.5 text-sm font-bold text-gray-500 hover:text-red-600">{v.detail.cancel}</button>
          )}
        </div>
      </header>

      {r.decision_note && (r.status === "needs_info" || r.status === "rejected") && (
        <p className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900"><b>{v.detail.decisionNote}:</b> {r.decision_note}</p>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-5">
          {/* What was requested */}
          <section className={card}>
            <h2 className="mb-3 font-black text-gray-900">{v.detail.payload}</h2>
            <div className="space-y-1.5">
              {row(v.detail.department, r.department_id ? deptName(t, r.department_id) : f.leadership)}
              {row(v.detail.companies, r.company_ids.map(c => data.companies.find(x => x.id === c)?.name ?? c).join(", "))}
              {row(v.detail.purpose, r.purpose)}
              {row(f.country, p.vendor.country)}
              {row(f.taxId, [p.vendor.tax_id, p.vendor.tax_id_type && f.taxIdTypes[p.vendor.tax_id_type as keyof typeof f.taxIdTypes]].filter(Boolean).join(" · "))}
              {row(f.registry, p.vendor.registry_url)}
              {row(f.street, [p.vendor.address.line1, p.vendor.address.city, p.vendor.address.state, p.vendor.address.postal_code].filter(Boolean).join(", "))}
              {row(f.contactName, [p.vendor.contact.name, p.vendor.contact.email, p.vendor.contact.phone].filter(Boolean).join(" · "))}
              {row(f.website, p.vendor.website)}
              {row(f.category, p.details.category)}
              {row(f.goods, p.details.goods_services)}
              {row(f.annualSpend, p.details.annual_spend)}
              {row(f.contractTerm, p.details.contract_term)}
              {row(f.paymentTerms, p.details.payment_terms)}
              {row(f.is1099, p.details.is_1099 === null ? "" : p.details.is_1099 ? f.yes : f.no)}
              {row(f.reason, p.justification.reason)}
              {row(f.comparison, p.justification.comparison)}
              {row(f.benefits, p.justification.benefits)}
              {row(f.vetted, p.compliance.vetted === null ? "" : `${p.compliance.vetted ? f.yes : f.no}${p.compliance.vetted_note ? ` — ${p.compliance.vetted_note}` : ""}`)}
              {row(f.risks, p.compliance.risks)}
            </div>
            {(p.bank.bank_name || p.bank.account_last4) && (
              <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm">
                <p className="mb-1 flex items-center gap-1.5 font-bold text-gray-700"><Landmark className="h-4 w-4" /> {f.bank}</p>
                <p className="text-gray-700">
                  {[p.bank.bank_name, p.bank.holder_name, masked(p.bank.account_last4), p.bank.routing_last4 && `routing ${masked(p.bank.routing_last4)}`, p.bank.swift_bic, p.bank.bank_country, p.bank.currency,
                    p.bank.payment_method && (f.methods[p.bank.payment_method as keyof typeof f.methods] ?? p.bank.payment_method)].filter(Boolean).join(" · ")}
                </p>
                {p.bank.bank_address && <p className="text-xs text-gray-500">{p.bank.bank_address}</p>}
              </div>
            )}
          </section>

          {/* Documents */}
          <section className={card}>
            <h2 className="mb-3 font-black text-gray-900">{v.detail.documents}</h2>
            {data.files.length === 0 ? <p className="text-sm text-gray-400">{v.detail.noDocuments}</p> : (
              <ul className="space-y-1.5">
                {data.files.map(x => (
                  <li key={x.id} className="flex items-center gap-2 text-sm">
                    <FileText className="h-4 w-4 text-gray-400" />
                    <span className="text-gray-500">{f.docKinds[x.kind as keyof typeof f.docKinds] ?? x.kind}:</span>
                    <a href={`/api/vendors/files/${x.id}`} target="_blank" rel="noopener noreferrer" className="font-bold text-[#00704a] hover:underline">{x.file_name}</a>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Timeline */}
          <section className={card}>
            <h2 className="mb-3 font-black text-gray-900">{v.detail.timeline}</h2>
            <ol className="space-y-2 border-l-2 border-gray-100 pl-4">
              {data.events.map(e => (
                <li key={e.id} className="text-sm">
                  <span className="font-bold text-gray-900">{v.status[e.to_status as keyof typeof v.status] ?? e.to_status}</span>
                  {e.by_person && <span className="text-gray-500"> · {fmt(v.detail.by, { name: name(e.by_person) })}</span>}
                  <span className="block text-xs text-gray-400">{when(e.at)}</span>
                </li>
              ))}
              {r.registered_at && (
                <li className="text-sm">
                  <span className="font-bold text-gray-900">{v.status.registered}</span>
                  <span className="text-gray-500"> · {fmt(v.detail.by, { name: name(r.registered_by) })}</span>
                  <span className="block text-xs text-gray-400">{when(r.registered_at)}</span>
                </li>
              )}
            </ol>
            {r.dept_note && <p className="mt-3 text-sm text-gray-600"><b>{v.detail.deptNote}:</b> {r.dept_note}</p>}
          </section>
        </div>

        <aside className="space-y-5">
          {/* Sanctions */}
          <section className={card}>
            <h2 className="mb-2 flex items-center gap-1.5 font-black text-gray-900"><ShieldAlert className="h-4 w-4" /> {v.detail.sanctions}</h2>
            <SanctionsBadge status={r.screening_status} />
            <p className="mt-1 text-xs text-gray-500">{r.screening_checked_at ? fmt(v.detail.screenedAt, { date: when(r.screening_checked_at) }) : v.detail.notScreened}</p>
            {data.internal?.sanctions_cleared_by && (
              <p className="mt-2 text-xs text-gray-600">{fmt(v.detail.clearedBy, { name: name(data.internal.sanctions_cleared_by) })}: {data.internal.sanctions_note}</p>
            )}
            {latest && latest.matches.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-bold text-gray-500">{v.detail.hits}</p>
                <ul className="mt-1 space-y-1 text-xs text-gray-700">
                  {latest.matches.slice(0, 3).map(h => (
                    <li key={`${h.ent_num}-${h.name}`}>{h.name} <span className="text-gray-400">· {h.programs || h.sdn_type || "SDN"} · {Math.round(h.score * 100)}%</span></li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {/* Approvals */}
          <section className={card}>
            <h2 className="mb-1 font-black text-gray-900">{v.detail.approvals}</h2>
            <p className="mb-2 text-xs text-gray-500">{fmt(v.detail.approvalsCount, { n: outcome.approves, total: outcome.required })}</p>
            {data.approvals.length === 0 ? <p className="text-sm text-gray-400">{v.detail.noApprovals}</p> : (
              <ul className="space-y-1.5 text-sm">
                {data.approvals.map(x => (
                  <li key={x.approver_person_id}>
                    {x.decision === "approve" ? <Check className="mr-1 inline h-4 w-4 text-[#009f67]" /> : <X className="mr-1 inline h-4 w-4 text-red-600" />}
                    <b>{name(x.approver_person_id)}</b> <span className="text-xs text-gray-400">{when(x.at)}</span>
                    {x.comment && <span className="block text-xs text-gray-600">{x.comment}</span>}
                  </li>
                ))}
              </ul>
            )}
            {r.registered_at && <p className="mt-3 text-xs text-gray-600"><Building2 className="mr-1 inline h-3.5 w-3.5" />{fmt(v.detail.registeredBy, { name: name(r.registered_by), date: when(r.registered_at) })}</p>}
          </section>

          {/* Department head */}
          {confirmAllowed.ok && (
            <section className={`${card} border-[#009f67]`}>
              <h2 className="font-black text-gray-900">{a.confirmTitle}</h2>
              <p className="mb-2 text-xs text-gray-500">{a.confirmHint}</p>
              <textarea rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder={a.note} aria-label={a.note} className={area} />
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" disabled={!!busy} onClick={() => act({ action: "confirm", decision: "confirm", note }, "confirm")} className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#009f67] px-3 text-sm font-bold text-white disabled:opacity-50">
                  {busy === "confirm" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {a.confirm}
                </button>
                <button type="button" disabled={!!busy || !note.trim()} onClick={() => act({ action: "confirm", decision: "needs_info", note }, "back")} className="flex h-9 items-center gap-1 rounded-lg border border-gray-300 px-3 text-sm font-bold text-gray-700 disabled:opacity-50"><Undo2 className="h-4 w-4" /> {a.sendBack}</button>
                <button type="button" disabled={!!busy || !note.trim()} onClick={() => act({ action: "confirm", decision: "reject", note }, "reject")} className="h-9 rounded-lg border border-red-200 px-3 text-sm font-bold text-red-700 disabled:opacity-50">{a.reject}</button>
              </div>
            </section>
          )}

          {/* Approver */}
          {data.roles.isApprover && r.status === "pending_approval" && (
            <section className={`${card} ${approveAllowed.ok ? "border-[#009f67]" : ""}`}>
              <h2 className="font-black text-gray-900">{a.approveTitle}</h2>
              {approveAllowed.ok ? (
                <>
                  <p className="mb-2 text-xs text-gray-500">{a.approveHint}</p>
                  {r.screening_status === "possible_match" && (
                    <label className="mb-2 flex items-start gap-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
                      <input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} className="mt-0.5 accent-[#009f67]" /> {a.ack}
                    </label>
                  )}
                  {r.screening_status === "match" && (
                    <div className="mb-2">
                      <p className="mb-1 text-xs font-bold text-red-700">{a.falsePositive}</p>
                      <textarea rows={2} value={fpNote} onChange={e => setFpNote(e.target.value)} aria-label={a.falsePositive} className={area} />
                    </div>
                  )}
                  <textarea rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder={a.comment} aria-label={a.comment} className={area} />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" disabled={!!busy || (!gate.ok && gate.needs !== "screening")} onClick={() => act({ action: "approve", decision: "approve", comment: note, ack, falsePositiveNote: fpNote }, "approve")} className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#009f67] px-3 text-sm font-bold text-white disabled:opacity-50">
                      {busy === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {a.approve}
                    </button>
                    <button type="button" disabled={!!busy || !note.trim()} onClick={() => act({ action: "approve", decision: "needs_info", comment: note }, "back")} className="flex h-9 items-center gap-1 rounded-lg border border-gray-300 px-3 text-sm font-bold text-gray-700 disabled:opacity-50"><Undo2 className="h-4 w-4" /> {a.sendBack}</button>
                    <button type="button" disabled={!!busy || !note.trim()} onClick={() => act({ action: "approve", decision: "reject", comment: note }, "reject")} className="h-9 rounded-lg border border-red-200 px-3 text-sm font-bold text-red-700 disabled:opacity-50">{a.reject}</button>
                  </div>
                </>
              ) : (
                <p className="mt-1 text-sm text-gray-500">{reason(approveAllowed)}</p>
              )}
            </section>
          )}

          {/* Payments */}
          {data.roles.isPayments && r.status === "approved" && !r.registered_at && (
            <section className={`${card} ${registerAllowed.ok ? "border-[#009f67]" : ""}`}>
              <h2 className="font-black text-gray-900">{a.registerTitle}</h2>
              {registerAllowed.ok ? (
                <>
                  <p className="mb-2 text-xs text-gray-500">{a.registerHint}</p>
                  <label className="mb-1 block text-xs font-bold text-gray-500" htmlFor="reg-method">{a.method}</label>
                  <select id="reg-method" value={method} onChange={e => setMethod(e.target.value)} className={field}>
                    {REGISTRATION_METHODS.map(m => <option key={m} value={m}>{a.methods[m]}</option>)}
                  </select>
                  <button type="button" disabled={!!busy} onClick={() => act({ action: "register", method }, "register")} className="mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-[#009f67] px-3 text-sm font-bold text-white disabled:opacity-50">
                    {busy === "register" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />} {a.register}
                  </button>
                </>
              ) : (
                <p className="mt-1 text-sm text-gray-500">{reason(registerAllowed)}</p>
              )}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
