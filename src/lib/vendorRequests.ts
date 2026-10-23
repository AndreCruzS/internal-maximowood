/**
 * Vendor requests (Master List phase B, migration 0029): the payload a request carries, the rules
 * the database enforces (mirrored here so the screens show the right buttons and the tests pin them
 * down), file checks and who gets which email. Pure — no I/O.
 *
 *   draft → submitted → pending_approval → approved → registered (registered_at)
 *            (dept head)      (approvers)      (Payments)
 *   Any step can send it back (needs_info) or reject it; the requester can cancel until it's approved.
 */
import { last4, type SanctionsStatus } from "@/lib/vendors";
import { CHANGE_FIELDS, needsBankStep } from "@/lib/vendorChanges";

export const REQUEST_STATUSES = ["draft", "submitted", "dept_confirmed", "pending_approval", "needs_info", "approved", "rejected", "cancelled"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export type RequestKind = "new" | "change_bank" | "change_details" | "reactivate" | "legacy_review" | "periodic_review";

export const TAX_ID_TYPES = ["ein", "ssn_last4", "itin", "cnpj", "cpf", "vat", "other"] as const;
export const REQUEST_PAYMENT_METHODS = ["wire", "ach", "check", "pix", "other"] as const;
export const FILE_KINDS = ["bank_proof", "tax_form", "registry", "quote", "contract", "certification", "other"] as const;
export type FileKind = (typeof FILE_KINDS)[number];
export const REGISTRATION_METHODS = ["callback", "bank_portal", "other"] as const;

export type RequestPayload = {
  requester: { job_title: string; phone: string };
  vendor: {
    legal_name: string; dba: string; country: string; tax_id: string; tax_id_type: string; registry_url: string;
    address: { line1: string; city: string; state: string; postal_code: string; country: string };
    contact: { name: string; email: string; phone: string };
    website: string;
  };
  /** Never full numbers: only the last 4 of the account and routing / IBAN. */
  bank: {
    bank_name: string; bank_address: string; holder_name: string; payment_method: string; payment_method_other: string;
    currency: string; bank_country: string; account_last4: string; routing_last4: string; swift_bic: string;
  };
  details: {
    category: string; goods_services: string; contract_term: string; annual_spend: string; payment_terms: string; is_1099: boolean | null;
  };
  justification: { reason: string; comparison: string; benefits: string };
  compliance: { vetted: boolean | null; vetted_note: string; risks: string };
  /** Details changes (phase C): the fields this request changes; the database applies only these. */
  changed: string[];
};

export const emptyPayload = (): RequestPayload => ({
  requester: { job_title: "", phone: "" },
  vendor: {
    legal_name: "", dba: "", country: "", tax_id: "", tax_id_type: "", registry_url: "",
    address: { line1: "", city: "", state: "", postal_code: "", country: "" },
    contact: { name: "", email: "", phone: "" },
    website: "",
  },
  bank: {
    bank_name: "", bank_address: "", holder_name: "", payment_method: "", payment_method_other: "",
    currency: "USD", bank_country: "", account_last4: "", routing_last4: "", swift_bic: "",
  },
  details: { category: "", goods_services: "", contract_term: "", annual_spend: "", payment_terms: "", is_1099: null },
  justification: { reason: "", comparison: "", benefits: "" },
  compliance: { vetted: null, vetted_note: "", risks: "" },
  changed: [],
});

/** A stored payload, with every field present (older or partial payloads fill in empty). */
export function readPayload(value: unknown): RequestPayload {
  const base = emptyPayload();
  const v = (value && typeof value === "object" ? value : {}) as Record<string, Record<string, unknown>>;
  const merge = <T extends Record<string, unknown>>(def: T, got: unknown): T => {
    const src = (got && typeof got === "object" ? got : {}) as Record<string, unknown>;
    const out = { ...def } as Record<string, unknown>;
    for (const k of Object.keys(def)) {
      const d = def[k];
      if (d && typeof d === "object") out[k] = merge(d as Record<string, unknown>, src[k]);
      else if (src[k] !== undefined && src[k] !== null && typeof src[k] === typeof d) out[k] = src[k];
      else if (d === null && (typeof src[k] === "boolean")) out[k] = src[k];
    }
    return out as T;
  };
  return {
    requester: merge(base.requester, v.requester),
    vendor: merge(base.vendor, v.vendor),
    bank: merge(base.bank, v.bank),
    details: merge(base.details, v.details),
    justification: merge(base.justification, v.justification),
    compliance: merge(base.compliance, v.compliance),
    changed: Array.isArray((v as Record<string, unknown>).changed)
      ? [...new Set(((v as Record<string, unknown>).changed as unknown[]).filter((x): x is string => typeof x === "string" && (CHANGE_FIELDS as readonly string[]).includes(x)))]
      : [],
  };
}

/**
 * What the browser sends: the form's payload with the full account / routing numbers the person
 * typed reduced to their last 4. The full numbers never leave the page.
 */
export function payloadToSend(p: RequestPayload, typed: { account?: string; routing?: string }): RequestPayload {
  const bank = { ...p.bank };
  if (typed.account?.trim()) bank.account_last4 = last4(typed.account);
  if (typed.routing?.trim()) bank.routing_last4 = last4(typed.routing);
  bank.account_last4 = last4(bank.account_last4);
  bank.routing_last4 = last4(bank.routing_last4);
  bank.swift_bic = bank.swift_bic.replace(/\s+/g, "").toUpperCase();
  bank.currency = (bank.currency || "USD").trim().toUpperCase();
  return { ...p, bank };
}

/** Mirrors the database's vendor_payload_safe(): no full numbers anywhere in a payload. */
export function payloadIsSafe(p: unknown): boolean {
  const banned = ["account_number", "routing_number", "iban", "account", "routing", "aba"];
  const obj = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
  const bank = (obj.bank && typeof obj.bank === "object" ? obj.bank : {}) as Record<string, unknown>;
  if (banned.some(k => k in obj || k in bank)) return false;
  return String(bank.account_last4 ?? "").length <= 4 && String(bank.routing_last4 ?? "").length <= 4;
}

// ── Validation (same messages the database raises) ─────────────────────────────
export type Problem = "legal_name" | "companies" | "department" | "bank_proof" | "tax_id_type" | "payment_method" | "swift" | "currency" | "contact_email";

export function requestProblems(r: {
  payload: RequestPayload; company_ids: string[]; department_id: string | null; hasBankProof: boolean; leadership: boolean;
}): Problem[] {
  const out: Problem[] = [];
  const { vendor, bank } = r.payload;
  if (!vendor.legal_name.trim()) out.push("legal_name");
  if (!r.company_ids.length) out.push("companies");
  if (!r.department_id && !r.leadership) out.push("department");
  if (!r.hasBankProof) out.push("bank_proof");
  if (vendor.tax_id_type && !(TAX_ID_TYPES as readonly string[]).includes(vendor.tax_id_type)) out.push("tax_id_type");
  if (bank.payment_method && !(REQUEST_PAYMENT_METHODS as readonly string[]).includes(bank.payment_method)) out.push("payment_method");
  if (bank.swift_bic && !/^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(bank.swift_bic.toUpperCase())) out.push("swift");
  if (!/^[A-Z]{3}$/.test((bank.currency || "USD").toUpperCase())) out.push("currency");
  if (vendor.contact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(vendor.contact.email.trim())) out.push("contact_email");
  return out;
}

// ── Files ──────────────────────────────────────────────────────────────────────
export const FILE_MAX_BYTES = 10 * 1024 * 1024;
export const FILE_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;

export function fileProblem(f: { type: string; size: number; name?: string }): "type" | "size" | "empty" | null {
  if (!f.size) return "empty";
  if (f.size > FILE_MAX_BYTES) return "size";
  const ext = (f.name ?? "").toLowerCase().split(".").pop() ?? "";
  const typeOk = (FILE_TYPES as readonly string[]).includes(f.type) || (!f.type && ["pdf", "jpg", "jpeg", "png"].includes(ext));
  return typeOk ? null : "type";
}

/** Storage path inside the private "vendors" bucket: the uploader's own folder (storage policy). */
export function filePath(uid: string, requestId: string, name: string, rand: string): string {
  const safe = name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(-80) || "file";
  return `${uid}/${requestId}/${rand}-${safe}`;
}

// ── Roles on a request (mirrors the SQL functions) ─────────────────────────────
export type RequestLike = {
  id: string;
  kind: RequestKind;
  status: RequestStatus;
  requester_person_id: string | null;
  department_id: string | null;
  dept_confirmed_by: string | null;
  registered_by: string | null;
  registered_at: string | null;
  screening_status: SanctionsStatus;
  /** Visible to vendor staff only (vendor_request_internal); null when unknown. */
  sanctions_cleared_by?: string | null;
};
export type ApprovalLike = { approver_person_id: string; decision: "approve" | "reject" };

/** The roles each person played on a request (requester, department, sanctions clearance, approver, Payments). */
export function rolesOn(r: RequestLike, approvals: ApprovalLike[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const add = (id: string | null | undefined, role: string) => {
    if (!id) return;
    out.set(id, [...(out.get(id) ?? []), role]);
  };
  add(r.requester_person_id, "requester");
  add(r.dept_confirmed_by, "department");
  add(r.sanctions_cleared_by, "sanctions");
  for (const a of approvals) add(a.approver_person_id, a.decision === "approve" ? "approver" : "rejecter");
  add(r.registered_by, "payments");
  return out;
}

export type Denied = { ok: false; reason: string };
export type Allowed = { ok: true };

export function canConfirm(me: string | null, r: RequestLike, confirmable: string[]): Allowed | Denied {
  if (r.status !== "submitted") return { ok: false, reason: "not_waiting" };
  if (!me || me === r.requester_person_id) return { ok: false, reason: "own_request" };
  if (!r.department_id || !confirmable.includes(r.department_id)) return { ok: false, reason: "not_head" };
  return { ok: true };
}

export function canApprove(me: string | null, r: RequestLike, approvals: ApprovalLike[], isApprover: boolean): Allowed | Denied {
  if (!me || !isApprover) return { ok: false, reason: "not_approver" };
  if (r.status !== "pending_approval") return { ok: false, reason: "not_waiting" };
  if (me === r.requester_person_id) return { ok: false, reason: "own_request" };
  if (me === r.dept_confirmed_by) return { ok: false, reason: "confirmed_it" };
  if (me === r.registered_by) return { ok: false, reason: "registered_it" };
  if (approvals.some(a => a.approver_person_id === me)) return { ok: false, reason: "already_decided" };
  return { ok: true };
}

export function canRegister(me: string | null, r: RequestLike, approvals: ApprovalLike[], isPayments: boolean): Allowed | Denied {
  if (!me || !isPayments) return { ok: false, reason: "not_payments" };
  if (r.status !== "approved" || r.registered_at || !needsBankStep(r.kind)) return { ok: false, reason: "not_waiting" };
  const roles = rolesOn(r, approvals).get(me);
  if (roles?.length) return { ok: false, reason: "other_role" };
  return { ok: true };
}

/** Where a request stands after these decisions (mirrors approve_vendor_request). */
export function approvalOutcome(approvals: ApprovalLike[], required: number): { approves: number; required: number; rejected: boolean; done: boolean } {
  const need = Math.max(1, Math.floor(required) || 1);
  const approves = new Set(approvals.filter(a => a.decision === "approve").map(a => a.approver_person_id)).size;
  const rejected = approvals.some(a => a.decision === "reject");
  return { approves, required: need, rejected, done: !rejected && approves >= need };
}

/** What the sanctions result asks of an approver before they can approve. */
export function screeningGate(status: SanctionsStatus, ack: boolean, falsePositiveNote: string): { ok: boolean; needs: "screening" | "ack" | "note" | null } {
  if (status === "not_run") return { ok: false, needs: "screening" };
  if (status === "match") return falsePositiveNote.trim().length >= 10 ? { ok: true, needs: null } : { ok: false, needs: "note" };
  if (status === "possible_match") return ack ? { ok: true, needs: null } : { ok: false, needs: "ack" };
  return { ok: true, needs: null };
}

// ── Status moves (mirrors the guard trigger and the functions) ─────────────────
const MOVES: Record<string, RequestStatus[]> = {
  draft: ["submitted", "pending_approval", "cancelled"],
  needs_info: ["submitted", "pending_approval", "cancelled"],
  submitted: ["pending_approval", "needs_info", "rejected", "cancelled"],
  pending_approval: ["approved", "needs_info", "rejected", "cancelled"],
  approved: [],
  rejected: [],
  cancelled: [],
  dept_confirmed: [],
};
export const canMove = (from: RequestStatus, to: RequestStatus) => (MOVES[from] ?? []).includes(to);
export const isOpen = (s: RequestStatus) => s === "draft" || s === "submitted" || s === "pending_approval" || s === "needs_info";
export const requesterCanCancel = (s: RequestStatus) => s === "draft" || s === "submitted" || s === "needs_info" || s === "pending_approval";
/**
 * Shown as "registered at the bank" once Payments set it up; a yearly review has no bank step, so
 * once approved it's simply "reviewed".
 */
export const stage = (r: Pick<RequestLike, "status" | "registered_at"> & { kind?: RequestKind }) =>
  r.status === "approved" && r.kind && !needsBankStep(r.kind) ? "reviewed" : r.status === "approved" && r.registered_at ? "registered" : r.status;

// ── Emails ────────────────────────────────────────────────────────────────────
export type VendorEvent = "submitted" | "confirmed" | "approved" | "registered" | "review_started";
export type Audience = "dept_heads" | "approvers" | "requester" | "payments";
export type EmailKindVendor = "vendor_submitted" | "vendor_approval" | "vendor_decision" | "vendor_registered";

/**
 * Who hears about a step, given where the request ended up. Never the person who just acted
 * (filtered by the server), never bank details (only a link).
 */
export function emailPlan(event: VendorEvent, status: RequestStatus, registered: boolean, kind: RequestKind = "new"): { kind: EmailKindVendor; audience: Audience }[] {
  if (event === "registered" || registered) return [{ kind: "vendor_registered", audience: "requester" }];
  switch (status) {
    case "submitted": return [{ kind: "vendor_submitted", audience: "dept_heads" }];
    case "pending_approval": return event === "approved" ? [] : [{ kind: "vendor_approval", audience: "approvers" }];
    case "approved":
      return needsBankStep(kind)
        ? [{ kind: "vendor_decision", audience: "requester" }, { kind: "vendor_registered", audience: "payments" }]
        : [{ kind: "vendor_decision", audience: "requester" }];
    case "rejected":
    case "needs_info": return [{ kind: "vendor_decision", audience: "requester" }];
    default: return [];
  }
}

/** People who must not get the "please act" email for this request (they can't act on it). */
export function excludedFor(audience: Audience, r: RequestLike, approvals: ApprovalLike[]): Set<string> {
  if (audience === "approvers") return new Set([r.requester_person_id, r.dept_confirmed_by].filter(Boolean) as string[]);
  if (audience === "payments") return new Set(rolesOn(r, approvals).keys());
  if (audience === "dept_heads") return new Set([r.requester_person_id].filter(Boolean) as string[]);
  return new Set();
}

export const REQUEST_COLUMNS =
  "id, kind, vendor_id, payload, requester_person_id, department_id, company_ids, purpose, status, dept_confirmed_by, dept_confirmed_at, screening_status, registered_by, registered_at, created_at, updated_at, submitted_at, decided_at, dept_note, decision_note, screening_score, screening_checked_at, registration_method";

export type VendorRequestRow = RequestLike & {
  vendor_id: string | null;
  payload: unknown;
  company_ids: string[];
  purpose: string;
  dept_confirmed_at: string | null;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  decided_at: string | null;
  dept_note: string;
  decision_note: string;
  screening_score: number | null;
  screening_checked_at: string | null;
  registration_method: string;
};
