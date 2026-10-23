/**
 * Vendor Master List, phase C (migration 0030): changes to approved vendors, suspension and the
 * yearly review. Pure helpers shared by the screens, the server and the tests — no I/O.
 *
 *   change_details  only the fields listed in payload.changed are applied
 *   change_bank     new bank (last 4 only) + a NEW bank proof; the old account stays active until
 *                   Payments registers the new one
 *   reactivate      after a suspension, approved like any request
 *   periodic_review the yearly review: renews next_review_on, no bank step
 */
import { masked } from "@/lib/vendors";
import type { RequestKind, RequestPayload } from "@/lib/vendorRequests";

// ── Which kinds end at the bank ───────────────────────────────────────────────
/** Mirrors vendor_kind_needs_bank(): after approval, Payments acts at the bank (except the yearly review). */
export const needsBankStep = (kind: RequestKind) => kind !== "periodic_review";
export const isChangeKind = (kind: RequestKind): kind is "change_bank" | "change_details" => kind === "change_bank" || kind === "change_details";

// ── Details changes ───────────────────────────────────────────────────────────
export const CHANGE_FIELDS = ["legal_name", "dba", "country", "tax_id", "address", "contact", "website", "category", "companies"] as const;
export type ChangeField = (typeof CHANGE_FIELDS)[number];
/** Fields only vendor staff can see (and so only they can prefill); anyone may still propose a new value. */
export const PRIVATE_FIELDS: ChangeField[] = ["tax_id", "address", "contact", "website"];

/** The vendor as stored in vendor_requests.previous (vendor_snapshot()). */
export type VendorSnapshot = {
  legal_name?: string; dba?: string; country?: string; tax_id?: string; tax_id_type?: string;
  address?: Record<string, string>; contact?: Record<string, string>; website?: string; category?: string;
  companies?: string[]; status?: string;
  bank?: { id: string; bank_name: string; holder_name: string; account_last4: string; routing_last4: string; swift_bic: string; bank_country: string; currency: string; payment_method: string }[] | null;
};

const addressText = (a: Record<string, string> | undefined) =>
  [a?.line1, a?.city, a?.state, a?.postal_code, a?.country].map(x => (x ?? "").trim()).filter(Boolean).join(", ");
const contactText = (c: Record<string, string> | undefined) => [c?.name, c?.email, c?.phone].map(x => (x ?? "").trim()).filter(Boolean).join(" · ");

/** A field's value as text, from the snapshot ("before") or the request ("after"). */
export function fieldText(field: ChangeField, src: { vendor: Partial<RequestPayload["vendor"]>; category: string; companies: string[]; taxIdType?: string }, companyName: (id: string) => string = x => x): string {
  const v = src.vendor;
  switch (field) {
    case "legal_name": return (v.legal_name ?? "").trim();
    case "dba": return (v.dba ?? "").trim();
    case "country": return (v.country ?? "").trim();
    case "tax_id": return [(v.tax_id ?? "").trim(), (src.taxIdType ?? v.tax_id_type ?? "").toUpperCase()].filter(Boolean).join(" · ");
    case "address": return addressText(v.address as Record<string, string> | undefined);
    case "contact": return contactText(v.contact as Record<string, string> | undefined);
    case "website": return (v.website ?? "").trim();
    case "category": return src.category.trim();
    case "companies": return [...src.companies].sort().map(companyName).join(", ");
  }
}

export type DiffRow = { field: ChangeField; before: string; after: string };

/**
 * old → new for the fields a details change touches (only those listed in payload.changed, and only
 * when they really differ). `before` is the snapshot taken on submit.
 */
export function buildDiff(before: VendorSnapshot | null, payload: RequestPayload, companyIds: string[], companyName?: (id: string) => string): DiffRow[] {
  const prev = before ?? {};
  const b = { vendor: prev as Partial<RequestPayload["vendor"]>, category: prev.category ?? "", companies: prev.companies ?? [], taxIdType: prev.tax_id_type };
  const a = { vendor: payload.vendor, category: payload.details.category, companies: companyIds };
  return payload.changed
    .filter((f): f is ChangeField => (CHANGE_FIELDS as readonly string[]).includes(f))
    .map(field => ({ field, before: fieldText(field, b, companyName), after: fieldText(field, a, companyName) }))
    .filter(r => r.before !== r.after);
}

/** The current active bank account(s) → the proposed one, masked (never more than the last 4). */
export function bankChange(before: VendorSnapshot | null, payload: RequestPayload): { before: string[]; after: string } {
  const line = (x: { bank_name?: string; holder_name?: string; account_last4?: string; routing_last4?: string; currency?: string; payment_method?: string }) =>
    [x.bank_name, x.holder_name, masked(x.account_last4), x.routing_last4 && `routing ${masked(x.routing_last4)}`, x.currency, x.payment_method?.toUpperCase()].filter(Boolean).join(" · ");
  return { before: (before?.bank ?? []).map(line), after: line(payload.bank) };
}

export type ChangeProblem = "reason" | "no_change" | "new_bank" | "bank_proof" | "legal_name" | "swift" | "currency" | "contact_email";

/** Checks the browser runs before submitting a change (the database runs the same ones). */
export function changeProblems(kind: "change_bank" | "change_details", r: {
  payload: RequestPayload; purpose: string; hasBankProof: boolean; diff?: DiffRow[];
}): ChangeProblem[] {
  const out: ChangeProblem[] = [];
  const { vendor, bank } = r.payload;
  if (!r.purpose.trim()) out.push("reason");
  if (!vendor.legal_name.trim()) out.push("legal_name");
  if (kind === "change_bank") {
    if (!bank.bank_name.trim() || !bank.account_last4) out.push("new_bank");
    if (!r.hasBankProof) out.push("bank_proof");
    if (bank.swift_bic && !/^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(bank.swift_bic.toUpperCase())) out.push("swift");
    if (!/^[A-Z]{3}$/.test((bank.currency || "USD").toUpperCase())) out.push("currency");
  } else {
    if (!r.diff?.length) out.push("no_change");
    if (vendor.contact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(vendor.contact.email.trim())) out.push("contact_email");
  }
  return out;
}

// ── Yearly review ─────────────────────────────────────────────────────────────
export const REVIEW_SOON_DAYS = 30;
export type ReviewDue = "overdue" | "due_soon" | null;

const addDays = (ymd: string, days: number) => {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Mirrors vendors_public.review_due: overdue after next_review_on, due soon within 30 days of it. */
export function reviewDue(v: { status: string; next_review_on: string | null }, today: string): ReviewDue {
  if (v.status !== "approved" || !v.next_review_on) return null;
  const next = v.next_review_on.slice(0, 10);
  if (next < today) return "overdue";
  if (next <= addDays(today, REVIEW_SOON_DAYS)) return "due_soon";
  return null;
}

/** Which kind of review Finance / approvers can start now (mirrors start_vendor_review). */
export function reviewKindFor(v: { status: string; next_review_on: string | null }, today: string): "legacy_review" | "reactivate" | "periodic_review" | null {
  if (v.status === "legacy_pending") return "legacy_review";
  if (v.status === "suspended") return "reactivate";
  return reviewDue(v, today) ? "periodic_review" : null;
}

export type DigestVendor = { id: string; legal_name: string; next_review_on: string; window: "overdue" | "due_soon" };

/** The vendors that go in tonight's review digest, overdue first, then by date. */
export function reviewDigest(vendors: { id: string; legal_name: string; status: string; next_review_on: string | null }[], today: string): DigestVendor[] {
  return vendors
    .map(v => ({ v, w: reviewDue(v, today) }))
    .filter((x): x is { v: typeof x.v; w: "overdue" | "due_soon" } => !!x.w)
    .map(({ v, w }) => ({ id: v.id, legal_name: v.legal_name, next_review_on: v.next_review_on!.slice(0, 10), window: w }))
    .sort((a, b) => (a.window === b.window ? a.next_review_on.localeCompare(b.next_review_on) : a.window === "overdue" ? -1 : 1));
}

/** Approvers + Finance, once each by email (case-insensitive), without blanks. */
export function digestRecipients(lists: { email: string | null | undefined; name?: string }[][]): { email: string; name: string }[] {
  const out = new Map<string, { email: string; name: string }>();
  for (const list of lists) for (const p of list) {
    const email = (p.email ?? "").trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || out.has(email)) continue;
    out.set(email, { email, name: p.name ?? email });
  }
  return [...out.values()];
}

// ── Vendor history ────────────────────────────────────────────────────────────
export const VENDOR_EVENT_KINDS = ["created", "details_changed", "bank_added", "bank_activated", "bank_deactivated", "suspended", "reactivated", "reviewed", "sanctions_cleared"] as const;
export type VendorEventKind = (typeof VENDOR_EVENT_KINDS)[number];
export type VendorEventRow = { id: number; vendor_id: string; request_id: string | null; kind: VendorEventKind; note: string; details: unknown; by_person: string | null; at: string };

export const SUSPEND_REASON_MIN = 5;
