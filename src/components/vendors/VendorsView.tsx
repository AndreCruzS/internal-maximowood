"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Building2, CheckCircle2, Clock, Inbox, ListChecks, Loader2, RefreshCw, Search, ShieldCheck, Upload } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/components/I18nProvider";
import { fmt } from "@/lib/i18n/locale";
import { plural } from "@/lib/i18n/dictionaries";
import { VENDOR_STATUSES, masked, type VendorPublic } from "@/lib/vendors";
import { reviewDue, type ReviewDue } from "@/lib/vendorChanges";
import ImportPanel from "@/components/vendors/ImportPanel";
import SanctionsBadge from "@/components/vendors/SanctionsBadge";
import RequestsPanel from "@/components/vendors/RequestsPanel";
import type { VendorsData } from "@/server/vendors";
import type { RequestsOverview } from "@/server/vendorRequests";

export type VendorsTab = "list" | "requests" | "import" | "sanctions";

const card = "rounded-2xl border border-gray-200 bg-white p-5 shadow-sm";
const field = "h-9 rounded-lg border border-gray-300 bg-white px-2.5 text-sm outline-none focus:border-[#009f67]";

const STATUS_STYLE: Record<string, string> = {
  approved: "bg-[#f2fbf7] text-[#00704a] border-[#9fdcc5]",
  pending: "bg-amber-50 text-amber-800 border-amber-200",
  legacy_pending: "bg-sky-50 text-sky-800 border-sky-200",
  suspended: "bg-gray-100 text-gray-600 border-gray-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
};

/** Vendor Master List: the list, the bank import and the OFAC sanctions check. */
export default function VendorsView({ data, tab, requests = null }: { data: VendorsData; tab: VendorsTab; requests?: RequestsOverview | null }) {
  const { t, tag } = useI18n();
  const v = t.vendors;
  const manage = data.roles.isFinance || data.roles.isAdmin;
  const tabs: { id: VendorsTab; label: string; icon: typeof ListChecks }[] = [
    { id: "list", label: v.tabs.list, icon: ListChecks },
    { id: "requests", label: t.vendorRequests.tab, icon: Inbox },
    ...(manage ? [{ id: "import" as const, label: v.tabs.import, icon: Upload }, { id: "sanctions" as const, label: v.tabs.sanctions, icon: ShieldCheck }] : []),
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-3xl font-black text-gray-900">{v.title}</h1>
        <p className="text-gray-500">{v.subtitle}</p>
      </div>
      {tabs.length > 1 && (
        <nav className="flex flex-wrap gap-1 rounded-xl bg-gray-100 p-1" aria-label={v.title}>
          {tabs.map(x => {
            const Icon = x.icon;
            return (
              <Link
                key={x.id}
                href={x.id === "list" ? "/vendors" : `/vendors?tab=${x.id}`}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold ${tab === x.id ? "bg-white text-[#00704a] shadow-sm" : "text-gray-600 hover:text-gray-900"}`}
                aria-current={tab === x.id ? "page" : undefined}
              >
                <Icon className="h-4 w-4" /> {x.label}
              </Link>
            );
          })}
        </nav>
      )}
      {tab === "list" && <MasterList data={data} />}
      {tab === "requests" && requests && <RequestsPanel data={requests} />}
      {tab === "import" && manage && <ImportPanel companies={data.companies} sanctionsLoaded={!!data.sanctions?.version} />}
      {tab === "sanctions" && manage && <SanctionsPanel data={data} tag={tag} />}
    </div>
  );
}

function MasterList({ data }: { data: VendorsData }) {
  const { t, tag } = useI18n();
  const v = t.vendors;
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const staff = data.roles.isStaff;
  const companyName = useMemo(() => new Map(data.companies.map(c => [c.id, c.name])), [data.companies]);
  const today = new Date().toISOString().slice(0, 10);
  const d = (ymd: string | null) => (ymd ? new Date(`${ymd.slice(0, 10)}T12:00:00`).toLocaleDateString(tag, { month: "short", day: "numeric", year: "numeric" }) : "—");

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const digits = needle.replace(/[^0-9a-z]/g, "");
    return data.vendors.filter(x => {
      if (status && x.status !== status) return false;
      if (!needle) return true;
      if (`${x.legal_name} ${x.dba}`.toLowerCase().includes(needle)) return true;
      const tax = data.details[x.id]?.tax_id?.toLowerCase().replace(/[^0-9a-z]/g, "");
      return !!(staff && digits.length >= 3 && tax?.includes(digits));
    });
  }, [data.vendors, data.details, q, status, staff]);

  return (
    <section className={card}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={staff ? v.searchStaff : v.search} aria-label={staff ? v.searchStaff : v.search} className={`${field} w-full pl-8`} />
        </div>
        <select value={status} onChange={e => setStatus(e.target.value)} className={field} aria-label={v.columns.status}>
          <option value="">{v.allStatuses}</option>
          {VENDOR_STATUSES.map(s => <option key={s} value={s}>{v.status[s]}</option>)}
        </select>
        <span className="text-sm text-gray-500">{plural(v, "count", list.length)}</span>
      </div>
      {!staff && <p className="mt-2 text-xs text-gray-400">{v.bankHidden}</p>}

      {data.vendors.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-400">{v.none}</p>
      ) : list.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-400">{v.noMatch}</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-bold uppercase tracking-wider text-gray-500">
                <th className="py-2 pr-3">{v.columns.vendor}</th>
                <th className="py-2 pr-3">{v.columns.country}</th>
                <th className="py-2 pr-3">{v.columns.companies}</th>
                <th className="py-2 pr-3">{v.columns.status}</th>
                <th className="py-2 pr-3">{v.columns.review}</th>
                <th className="py-2 pr-3">{v.columns.sanctions}</th>
                {staff && <th className="py-2">{v.columns.bank}</th>}
              </tr>
            </thead>
            <tbody>
              {list.map(x => (
                <Row key={x.id} x={x} data={data} staff={staff} companyName={companyName} d={d} due={x.review_due ?? reviewDue(x, today)} />
              ))}
            </tbody>
          </table>
          {staff && <p className="mt-3 text-xs text-gray-400">{v.bankMasked}</p>}
        </div>
      )}
    </section>
  );
}

function Row({ x, data, staff, companyName, d, due }: {
  x: VendorPublic; data: VendorsData; staff: boolean;
  companyName: Map<string, string>; d: (ymd: string | null) => string; due: ReviewDue;
}) {
  const { t } = useI18n();
  const v = t.vendors;
  const banks = (data.banks[x.id] ?? []).filter(b => b.active || !(data.banks[x.id] ?? []).some(o => o.active));
  return (
    <tr className="border-b border-gray-50 align-top hover:bg-gray-50/60">
      <td className="py-2.5 pr-3">
        <Link href={`/vendors/${x.id}`} className="font-bold text-gray-900 hover:underline">{x.legal_name}</Link>
        {x.dba && <div className="text-xs text-gray-500">{fmt(v.dba, { name: x.dba })}</div>}
        {x.category && <div className="text-xs text-gray-400">{x.category}</div>}
      </td>
      <td className="py-2.5 pr-3 text-gray-600">{x.country || "—"}</td>
      <td className="py-2.5 pr-3">
        <div className="flex flex-wrap gap-1">
          {x.company_ids.map(c => <span key={c} className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-bold text-gray-600">{companyName.get(c) ?? c}</span>)}
        </div>
      </td>
      <td className="py-2.5 pr-3">
        <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-bold ${STATUS_STYLE[x.status] ?? ""}`}>{v.status[x.status]}</span>
      </td>
      <td className="py-2.5 pr-3 whitespace-nowrap text-gray-600">
        {d(x.next_review_on)}
        {due === "overdue" && <div className="flex items-center gap-1 text-[11px] font-bold text-red-600"><AlertTriangle className="h-3 w-3" /> {v.overdue}</div>}
        {due === "due_soon" && <div className="flex items-center gap-1 text-[11px] font-bold text-amber-700"><Clock className="h-3 w-3" /> {v.dueSoon}</div>}
      </td>
      <td className="py-2.5 pr-3"><SanctionsBadge status={x.sanctions_status} /></td>
      {staff && (
        <td className="py-2.5 text-xs text-gray-600">
          {banks.length === 0 ? "—" : banks.map(b => (
            <div key={b.id} className={`whitespace-nowrap ${b.active ? "" : "text-gray-400"}`}>
              <Building2 className="mr-1 inline h-3 w-3 text-gray-400" />
              {b.bank_name || "—"} {masked(b.account_last4)} {b.payment_method && <span className="uppercase text-gray-400">· {b.payment_method}</span>}
            </div>
          ))}
        </td>
      )}
    </tr>
  );
}

function SanctionsPanel({ data, tag }: { data: VendorsData; tag: string }) {
  const { t } = useI18n();
  const l = t.vendors.list;
  const router = useRouter();
  const [busy, setBusy] = useState<"refresh" | "rescreen" | null>(null);
  const meta = data.sanctions;
  const counts = data.vendors.reduce<Record<string, number>>((acc, x) => ({ ...acc, [x.sanctions_status]: (acc[x.sanctions_status] ?? 0) + 1 }), {});

  const run = async (action: "refresh" | "rescreen") => {
    setBusy(action);
    const res = await fetch("/api/vendors/screen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return toast.error(json.error || "Error");
    toast.success(action === "refresh" ? l.refreshed : l.rescreened);
    router.refresh();
  };

  return (
    <section className={`${card} space-y-4`}>
      <div>
        <h2 className="font-black text-gray-900">{l.title}</h2>
        <p className="text-sm text-gray-600">{l.hint}</p>
        <p className="mt-1 text-xs text-gray-500">{l.policy}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {meta?.refreshed_at ? (
          <span className="flex items-center gap-1.5 text-gray-700">
            <CheckCircle2 className="h-4 w-4 text-[#009f67]" />
            {fmt(l.lastRefresh, { date: new Date(meta.refreshed_at).toLocaleString(tag, { dateStyle: "medium", timeStyle: "short" }) })} · {fmt(l.entries, { n: meta.entries.toLocaleString(tag) })}
          </span>
        ) : (
          <span className="text-gray-500">{l.never}</span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {(["match", "possible_match", "clear", "false_positive", "not_run"] as const).map(s => (
          <span key={s} className="flex items-center gap-1.5 text-xs"><SanctionsBadge status={s} /> {counts[s] ?? 0}</span>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => run("refresh")} disabled={!!busy} className="flex h-9 items-center gap-1.5 rounded-lg bg-[#009f67] px-4 text-sm font-bold text-white disabled:opacity-50">
          {busy === "refresh" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} {l.refresh}
        </button>
        <button type="button" onClick={() => run("rescreen")} disabled={!!busy || !meta?.version} className="flex h-9 items-center gap-1.5 rounded-lg border border-gray-300 px-4 text-sm font-bold text-gray-700 disabled:opacity-50">
          {busy === "rescreen" && <Loader2 className="h-4 w-4 animate-spin" />} {l.rescreen}
        </button>
      </div>
    </section>
  );
}
