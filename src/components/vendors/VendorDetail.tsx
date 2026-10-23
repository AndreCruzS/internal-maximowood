"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Ban, Building2, ClipboardCheck, Clock, FileText, History, Landmark, Loader2, Pencil, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/components/I18nProvider";
import { fmt } from "@/lib/i18n/locale";
import { masked } from "@/lib/vendors";
import { isOpen } from "@/lib/vendorRequests";
import { SUSPEND_REASON_MIN, reviewDue, reviewKindFor } from "@/lib/vendorChanges";
import SanctionsBadge from "@/components/vendors/SanctionsBadge";
import RequestStatusBadge from "@/components/vendors/RequestStatusBadge";
import type { VendorDetailData } from "@/server/vendorDetail";

const card = "rounded-2xl border border-gray-200 bg-white p-5 shadow-sm";
const area = "w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm outline-none focus:border-[#009f67]";
const STATUS_STYLE: Record<string, string> = {
  approved: "bg-[#f2fbf7] text-[#00704a] border-[#9fdcc5]",
  pending: "bg-amber-50 text-amber-800 border-amber-200",
  legacy_pending: "bg-sky-50 text-sky-800 border-sky-200",
  suspended: "bg-red-50 text-red-700 border-red-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
};

/** One vendor: public info for everyone; details, bank accounts, checks, documents and history for vendor staff. */
export default function VendorDetail({ data }: { data: VendorDetailData }) {
  const { t, tag } = useI18n();
  const v = t.vendors;
  const pg = v.page;
  const r = t.vendorRequests;
  const router = useRouter();
  const x = data.vendor;
  const det = data.details;
  const today = new Date().toISOString().slice(0, 10);
  const due = x.review_due ?? reviewDue(x, today);
  const reviewKind = reviewKindFor(x, today);
  const name = (id: string | null | undefined) => (id && data.people[id]) || "—";
  const day = (iso: string | null | undefined) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString(tag, { month: "short", day: "numeric", year: "numeric" }) : "—");
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(tag, { dateStyle: "medium", timeStyle: "short" }) : "");
  const companies = x.company_ids.map(c => data.companies.find(y => y.id === c)?.name ?? c).join(", ");
  const canChange = x.status === "approved" || x.status === "suspended";
  const canReview = (data.roles.isFinance || data.roles.isAdmin || data.roles.isApprover) && !!reviewKind;
  const openRequest = data.requests.find(q => isOpen(q.status) && q.status !== "draft");

  const [panel, setPanel] = useState<"suspend" | "review" | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    const res = await fetch("/api/vendors/requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = (await res.json().catch(() => ({}))) as { id?: string; error?: string; warning?: string | null };
    setBusy(false);
    if (!res.ok) {
      toast.error(json.error ?? "Error");
      return null;
    }
    return json;
  };
  const suspend = async () => {
    const json = await post({ action: "suspend", vendorId: x.id, reason });
    if (!json) return;
    toast.success(pg.suspended);
    setPanel(null);
    setReason("");
    router.refresh();
  };
  const review = async () => {
    const json = await post({ action: "review", vendorId: x.id, reason });
    if (!json?.id) return;
    toast.success(pg.reviewStarted);
    if (json.warning) toast.warning(fmt(r.detail.warningScreening, { reason: json.warning }));
    router.push(`/vendors/requests/${json.id}`);
  };

  const info = (k: string, val: string | null | undefined) => (val ? (
    <div className="flex gap-2 text-sm"><span className="w-36 shrink-0 text-gray-500">{k}</span><span className="min-w-0 whitespace-pre-line text-gray-900">{val}</span></div>
  ) : null);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Link href="/vendors" className="inline-flex items-center gap-1 text-sm font-bold text-gray-500 hover:text-gray-900">
        <ArrowLeft className="h-4 w-4" /> {pg.back}
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black text-gray-900">{x.legal_name}</h1>
          {x.dba && <p className="text-gray-500">{fmt(v.dba, { name: x.dba })}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${STATUS_STYLE[x.status] ?? ""}`}>{v.status[x.status]}</span>
            <SanctionsBadge status={x.sanctions_status} />
            {due === "overdue" && <span className="flex items-center gap-1 text-xs font-bold text-red-600"><AlertTriangle className="h-3.5 w-3.5" /> {v.overdue}</span>}
            {due === "due_soon" && <span className="flex items-center gap-1 text-xs font-bold text-amber-700"><Clock className="h-3.5 w-3.5" /> {v.dueSoon}</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canChange && (
            <>
              <Link href={`/vendors/change?vendor=${x.id}&kind=change_details`} className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-bold text-gray-700 hover:bg-gray-50">
                <Pencil className="h-3.5 w-3.5" /> {pg.changeDetails}
              </Link>
              <Link href={`/vendors/change?vendor=${x.id}&kind=change_bank`} className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-bold text-gray-700 hover:bg-gray-50">
                <Landmark className="h-3.5 w-3.5" /> {pg.changeBank}
              </Link>
            </>
          )}
          {canReview && (
            <button type="button" onClick={() => setPanel(panel === "review" ? null : "review")} className="flex items-center gap-1.5 rounded-lg bg-[#009f67] px-3 py-1.5 text-sm font-bold text-white">
              <ClipboardCheck className="h-3.5 w-3.5" /> {reviewKind === "reactivate" ? pg.reactivate : pg.startReview}
            </button>
          )}
          {data.roles.isApprover && x.status === "approved" && (
            <button type="button" onClick={() => setPanel(panel === "suspend" ? null : "suspend")} className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-bold text-red-700 hover:bg-red-50">
              <Ban className="h-3.5 w-3.5" /> {pg.suspend}
            </button>
          )}
        </div>
      </header>

      {x.status === "suspended" && det && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {fmt(pg.suspendedBanner, { date: day(det.suspended_at), reason: det.suspended_reason || "—" })}
        </p>
      )}
      {openRequest && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {pg.openRequest} <Link href={`/vendors/requests/${openRequest.id}`} className="font-bold underline">{r.kind[openRequest.kind]}</Link>
        </p>
      )}

      {panel === "suspend" && (
        <section className={`${card} border-red-200`}>
          <h2 className="font-black text-gray-900">{pg.suspendTitle}</h2>
          <p className="mb-2 text-xs text-gray-500">{pg.suspendHint}</p>
          <textarea rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder={pg.suspendReason} aria-label={pg.suspendReason} className={area} />
          <button type="button" onClick={suspend} disabled={busy || reason.trim().length < SUSPEND_REASON_MIN} className="mt-2 flex h-9 items-center gap-1.5 rounded-lg bg-red-600 px-4 text-sm font-bold text-white disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />} {pg.suspendConfirm}
          </button>
        </section>
      )}
      {panel === "review" && (
        <section className={`${card} border-[#009f67]`}>
          <h2 className="font-black text-gray-900">{reviewKind === "reactivate" ? pg.reactivate : pg.reviewTitle}</h2>
          <p className="mb-2 text-xs text-gray-500">{reviewKind === "reactivate" ? pg.reactivateHint : pg.reviewHint}</p>
          <textarea rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder={r.detail.purpose} aria-label={r.detail.purpose} className={area} />
          <button type="button" onClick={review} disabled={busy || (reviewKind === "reactivate" && reason.trim().length < SUSPEND_REASON_MIN)} className="mt-2 flex h-9 items-center gap-1.5 rounded-lg bg-[#009f67] px-4 text-sm font-bold text-white disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />} {pg.startReview}
          </button>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-5">
          <section className={card}>
            <h2 className="mb-3 font-black text-gray-900">{pg.info}</h2>
            <div className="space-y-1.5">
              {info(v.columns.country, x.country)}
              {info(v.columns.companies, companies)}
              {info(v.columns.category, x.category)}
              {info(v.columns.status, x.approved_at ? fmt(pg.approvedOn, { date: day(x.approved_at) }) : "")}
              {info(v.columns.review, x.next_review_on ? fmt(pg.nextReview, { date: day(x.next_review_on) }) : "")}
              {det?.last_reviewed_at ? info("", fmt(pg.lastReviewed, { date: day(det.last_reviewed_at) })) : null}
            </div>
            {det && (
              <div className="mt-4 space-y-1.5 border-t border-gray-100 pt-3">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-400">{pg.privateInfo}</p>
                {info(v.taxId, [det.tax_id, det.tax_id_type?.toUpperCase()].filter(Boolean).join(" · "))}
                {info(pg.address, [det.address?.line1, det.address?.city, det.address?.state, det.address?.postal_code, det.address?.country].filter(Boolean).join(", "))}
                {info(pg.contact, [det.contact?.name, det.contact?.email, det.contact?.phone].filter(Boolean).join(" · "))}
                {info(pg.website, det.website)}
                {info(pg.currency, det.currency)}
                {info(pg.terms, det.payment_terms)}
                {det.sanctions_cleared_note && info(v.sanctions.false_positive, det.sanctions_cleared_note)}
              </div>
            )}
          </section>

          {data.roles.isStaff && (
            <section className={card}>
              <h2 className="mb-3 flex items-center gap-1.5 font-black text-gray-900"><Landmark className="h-4 w-4" /> {pg.banks}</h2>
              {data.banks.length === 0 ? <p className="text-sm text-gray-400">{pg.noBanks}</p> : (
                <ul className="space-y-2">
                  {data.banks.map(b => (
                    <li key={b.id} className={`rounded-xl border p-3 text-sm ${b.active ? "border-[#9fdcc5] bg-[#f2fbf7]" : "border-gray-200"}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <Building2 className="h-4 w-4 text-gray-400" />
                        <span className="font-bold text-gray-900">{b.bank_name || "—"}</span>
                        <span className="text-gray-700">{masked(b.account_last4)}</span>
                        <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-bold ${b.active ? "bg-[#009f67] text-white" : "bg-gray-100 text-gray-500"}`}>{b.active ? pg.active : pg.inactive}</span>
                      </div>
                      <p className="mt-1 text-xs text-gray-600">
                        {[b.holder_name, b.routing_last4 && `routing ${masked(b.routing_last4)}`, b.swift_bic, b.bank_country, b.currency, b.payment_method?.toUpperCase()].filter(Boolean).join(" · ")}
                      </p>
                      {b.verified_at && <p className="text-xs text-gray-400">{fmt(pg.verifiedBy, { name: name(b.verified_by), date: day(b.verified_at), method: b.verification_method || "—" })}</p>}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-gray-400">{v.bankMasked}</p>
            </section>
          )}

          <section className={card}>
            <h2 className="mb-3 font-black text-gray-900">{pg.requests}</h2>
            {data.requests.length === 0 ? <p className="text-sm text-gray-400">{pg.noRequests}</p> : (
              <ul className="divide-y divide-gray-100">
                {data.requests.map(q => (
                  <li key={q.id}>
                    <Link href={`/vendors/requests/${q.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 hover:bg-gray-50">
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold text-gray-900">{r.kind[q.kind]}</span>
                        <span className="block text-xs text-gray-500">{name(q.requester_person_id)} · {day(q.submitted_at ?? q.created_at)}{q.purpose && ` · ${q.purpose}`}</span>
                      </span>
                      <RequestStatusBadge status={q.status} registeredAt={q.registered_at} kind={q.kind} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {data.roles.isStaff && (
            <section className={card}>
              <h2 className="mb-3 flex items-center gap-1.5 font-black text-gray-900"><History className="h-4 w-4" /> {pg.history}</h2>
              {data.events.length === 0 ? <p className="text-sm text-gray-400">{pg.noHistory}</p> : (
                <ol className="space-y-2 border-l-2 border-gray-100 pl-4">
                  {data.events.map(e => (
                    <li key={e.id} className="text-sm">
                      <span className="font-bold text-gray-900">{pg.events[e.kind] ?? e.kind}</span>
                      {e.by_person && <span className="text-gray-500"> · {fmt(r.detail.by, { name: name(e.by_person) })}</span>}
                      {e.note && <span className="block text-xs text-gray-600">{e.note}</span>}
                      <span className="block text-xs text-gray-400">
                        {when(e.at)}
                        {e.request_id && <> · <Link href={`/vendors/requests/${e.request_id}`} className="underline">{r.tab}</Link></>}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}
        </div>

        {data.roles.isStaff && (
          <aside className="space-y-5">
            <section className={card}>
              <h2 className="mb-2 flex items-center gap-1.5 font-black text-gray-900"><ShieldAlert className="h-4 w-4" /> {pg.screenings}</h2>
              {data.screenings.length === 0 ? <p className="text-sm text-gray-400">{pg.noScreenings}</p> : (
                <ul className="space-y-2">
                  {data.screenings.map((s, i) => (
                    <li key={i} className="text-xs">
                      <div className="flex items-center gap-2">
                        <SanctionsBadge status={s.result as typeof x.sanctions_status} />
                        <span className="text-gray-400">{day(s.screened_at)} · {pg.trigger[s.trigger as keyof typeof pg.trigger] ?? s.trigger}</span>
                      </div>
                      {s.matches.slice(0, 2).map(h => (
                        <p key={`${h.ent_num}-${h.name}`} className="mt-0.5 text-gray-600">{h.name} <span className="text-gray-400">· {Math.round(h.score * 100)}%</span></p>
                      ))}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className={card}>
              <h2 className="mb-2 font-black text-gray-900">{pg.documents}</h2>
              {data.files.length === 0 ? <p className="text-sm text-gray-400">{pg.noDocuments}</p> : (
                <ul className="space-y-1.5">
                  {data.files.map(f => (
                    <li key={f.id} className="flex items-start gap-2 text-sm">
                      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                      <span className="min-w-0">
                        <a href={`/api/vendors/files/${f.id}`} target="_blank" rel="noopener noreferrer" className="block truncate font-bold text-[#00704a] hover:underline">{f.file_name}</a>
                        <span className="block text-xs text-gray-400">{r.form.docKinds[f.kind as keyof typeof r.form.docKinds] ?? f.kind} · {day(f.created_at)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        )}
      </div>
    </div>
  );
}
