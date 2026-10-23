import type { SupabaseClient } from "@supabase/supabase-js";
import { screenNames, type SanctionsHit } from "@/lib/vendors";
import {
  REQUEST_COLUMNS, emailPlan, excludedFor, readPayload, stage,
  type ApprovalLike, type Audience, type VendorEvent, type VendorRequestRow,
} from "@/lib/vendorRequests";
import { sanctionsIndex } from "@/server/sanctions";
import { vendorRoles, type VendorRoles } from "@/server/vendors";
import { alreadySent, emailRef, logEmail, renderEmail, sendMail, type EmailKind, type MailResult } from "@/server/email";

export type Approval = ApprovalLike & { comment: string; screening_acknowledged: boolean; at: string };
export type RequestEvent = { id: number; from_status: string | null; to_status: string; by_person: string | null; at: string };
export type RequestFile = { id: string; kind: string; file_name: string; mime_type: string; size_bytes: number; created_at: string };
export type RequestScreening = { result: string; score: number; matches: SanctionsHit[]; list_version: string; screened_at: string };
export type Internal = { review_notes: string; sanctions_note: string; sanctions_cleared_by: string | null };

export type RequestsContext = {
  ready: boolean;
  roles: VendorRoles;
  me: string | null;
  confirmable: string[];
  required: number;
  people: Record<string, string>;
  departments: { id: string; name: string }[];
  companies: { id: string; name: string }[];
  /** Departments of the viewer's positions, and whether they hold a leadership (no-department) position. */
  myDepartments: string[];
  leadership: boolean;
};

async function context(supabase: SupabaseClient, userId: string): Promise<RequestsContext> {
  const [roles, me, confirmable, required, people, departments, companies] = await Promise.all([
    vendorRoles(supabase),
    supabase.from("people").select("id").eq("user_id", userId).maybeSingle(),
    supabase.rpc("vendor_confirmable_departments"),
    supabase.rpc("vendor_required_approvals"),
    supabase.from("people").select("id, full_name").limit(5000),
    supabase.from("departments").select("id, name").order("sort"),
    supabase.from("companies").select("id, name").order("sort"),
  ]);
  const myId = (me.data as { id: string } | null)?.id ?? null;
  const positions = myId
    ? ((await supabase.from("positions").select("department_id").eq("person_id", myId)).data as { department_id: string | null }[] | null) ?? []
    : [];
  return {
    ready: !confirmable.error,
    roles,
    me: myId,
    confirmable: (confirmable.data as string[] | null) ?? [],
    required: Number(required.data) || 1,
    people: Object.fromEntries(((people.data as { id: string; full_name: string }[] | null) ?? []).map(p => [p.id, p.full_name])),
    departments: (departments.data as { id: string; name: string }[] | null) ?? [],
    companies: (companies.data as { id: string; name: string }[] | null) ?? [],
    myDepartments: [...new Set(positions.map(p => p.department_id).filter(Boolean) as string[])],
    leadership: positions.some(p => !p.department_id),
  };
}

export type RequestsOverview = RequestsContext & {
  requests: VendorRequestRow[];
  approvals: Record<string, Approval[]>;
};

/** Every request the viewer may see (RLS): their own, their department's (heads), all of them (vendor staff). */
export async function loadRequestsOverview(supabase: SupabaseClient, userId: string): Promise<RequestsOverview> {
  const ctx = await context(supabase, userId);
  if (!ctx.ready) return { ...ctx, requests: [], approvals: {} };
  const { data } = await supabase.from("vendor_requests").select(REQUEST_COLUMNS).order("updated_at", { ascending: false }).limit(500);
  const requests = (data as unknown as VendorRequestRow[] | null) ?? [];
  const approvals: Record<string, Approval[]> = {};
  if (requests.length) {
    const ids = requests.map(r => r.id);
    for (let i = 0; i < ids.length; i += 200) {
      const { data: a } = await supabase
        .from("vendor_request_approvals")
        .select("request_id, approver_person_id, decision, comment, screening_acknowledged, at")
        .in("request_id", ids.slice(i, i + 200));
      for (const row of (a as (Approval & { request_id: string })[] | null) ?? []) (approvals[row.request_id] ??= []).push(row);
    }
  }
  return { ...ctx, requests, approvals };
}

export type RequestDetail = RequestsContext & {
  request: VendorRequestRow;
  approvals: Approval[];
  events: RequestEvent[];
  files: RequestFile[];
  screenings: RequestScreening[];
  internal: Internal | null;
};

export async function loadRequest(supabase: SupabaseClient, userId: string, id: string): Promise<RequestDetail | null> {
  const ctx = await context(supabase, userId);
  const { data } = await supabase.from("vendor_requests").select(REQUEST_COLUMNS).eq("id", id).maybeSingle();
  if (!data) return null;
  const [approvals, events, files, screenings, internal] = await Promise.all([
    supabase.from("vendor_request_approvals").select("approver_person_id, decision, comment, screening_acknowledged, at").eq("request_id", id).order("at"),
    supabase.from("vendor_request_events").select("id, from_status, to_status, by_person, at").eq("request_id", id).order("id"),
    supabase.from("vendor_files").select("id, kind, file_name, mime_type, size_bytes, created_at").eq("request_id", id).order("created_at"),
    supabase.from("vendor_screenings").select("result, score, matches, list_version, screened_at").eq("request_id", id).order("screened_at", { ascending: false }).limit(5),
    ctx.roles.isStaff ? supabase.rpc("vendor_request_internal", { target: id }) : Promise.resolve({ data: null }),
  ]);
  const internalRow = ((internal.data as Internal[] | null) ?? [])[0] ?? null;
  const request = data as unknown as VendorRequestRow;
  if (internalRow) request.sanctions_cleared_by = internalRow.sanctions_cleared_by;
  return {
    ...ctx,
    request,
    approvals: (approvals.data as Approval[] | null) ?? [],
    events: (events.data as RequestEvent[] | null) ?? [],
    files: (files.data as RequestFile[] | null) ?? [],
    screenings: (screenings.data as RequestScreening[] | null) ?? [],
    internal: internalRow,
  };
}

// ── Sanctions on a request (service role) ─────────────────────────────────────
/** Screens the request's vendor names against the loaded OFAC list and records the result. */
export async function screenRequest(admin: SupabaseClient, id: string): Promise<{ result: string } | { error: string }> {
  const { data } = await admin.from("vendor_requests").select("payload").eq("id", id).maybeSingle();
  if (!data) return { error: "Request not found" };
  const index = await sanctionsIndex(admin);
  if (!index) return { error: "The OFAC sanctions list isn't loaded yet. Finance can load it in Vendors → Sanctions check." };
  const p = readPayload((data as { payload: unknown }).payload);
  const s = screenNames([p.vendor.legal_name, p.vendor.dba], index);
  const { data: status, error } = await admin.rpc("set_vendor_request_screening", {
    target: id, result: s.result, score: s.score, matches: s.hits, list_version: index.version,
  });
  if (error) return { error: error.message };
  return { result: String(status) };
}

// ── Emails ────────────────────────────────────────────────────────────────────
type Person = { id: string; full_name: string; email: string | null };

async function audience(admin: SupabaseClient, which: Audience, r: VendorRequestRow, approvals: ApprovalLike[]): Promise<{ id: string | null; name: string; email: string }[]> {
  let ids: string[] = [];
  let extraEmails: string[] = [];
  if (which === "requester") ids = r.requester_person_id ? [r.requester_person_id] : [];
  else if (which === "dept_heads") {
    const { data } = await admin.rpc("vendor_dept_heads", { dept: r.department_id });
    ids = (data as string[] | null) ?? [];
    if (!ids.length) {
      // Nobody in charge of the department: Finance confirms.
      const { data: fin } = await admin.from("positions").select("person_id").eq("department_id", "finance");
      ids = [...new Set(((fin as { person_id: string }[] | null) ?? []).map(x => x.person_id))];
    }
  } else {
    const duty = which === "approvers" ? "vendor_approver" : "payments";
    const { data } = await admin.from("duty_holders").select("person_id, email").eq("duty", duty);
    const rows = (data as { person_id: string | null; email: string | null }[] | null) ?? [];
    ids = rows.map(x => x.person_id).filter(Boolean) as string[];
    extraEmails = rows.filter(x => !x.person_id && x.email).map(x => x.email!.toLowerCase());
  }
  const skip = excludedFor(which, r, approvals);
  ids = [...new Set(ids)].filter(id => !skip.has(id));
  const { data: people } = ids.length ? await admin.from("people").select("id, full_name, email").in("id", ids) : { data: [] };
  const out: { id: string | null; name: string; email: string }[] = ((people as Person[] | null) ?? [])
    .filter(p => p.email)
    .map(p => ({ id: p.id, name: p.full_name, email: p.email!.toLowerCase() }));
  for (const e of extraEmails) if (!out.some(o => o.email === e)) out.push({ id: null, name: e, email: e });
  return out;
}

const SUBJECT: Record<string, (vendor: string) => string> = {
  vendor_submitted: v => `New vendor to confirm: ${v}`,
  vendor_approval: v => `Vendor waiting for approval: ${v}`,
  vendor_decision: v => `Your vendor request: ${v}`,
  vendor_registered: v => `Vendor ready to register at the bank: ${v}`,
};

const STATUS_WORDS: Record<string, string> = {
  submitted: "Waiting for the department head", pending_approval: "Waiting for approval", needs_info: "Sent back for more information",
  approved: "Approved — waiting to be registered at the bank", registered: "Registered at the bank", rejected: "Rejected", cancelled: "Cancelled",
};

/**
 * The emails for a step (see emailPlan), sent once each, never with bank details — only a link.
 * `actor` (who just acted) never gets an email about their own action.
 */
export async function notifyVendorRequest(
  admin: SupabaseClient, id: string, event: VendorEvent, actor: { personId: string | null; userId: string }, origin: string,
): Promise<MailResult[]> {
  const { data } = await admin.from("vendor_requests").select(`${REQUEST_COLUMNS}, sanctions_cleared_by`).eq("id", id).maybeSingle();
  if (!data) return [];
  const r = data as unknown as VendorRequestRow;
  const { data: a } = await admin.from("vendor_request_approvals").select("approver_person_id, decision, comment").eq("request_id", id);
  const approvals = (a as (ApprovalLike & { comment: string })[] | null) ?? [];
  const p = readPayload(r.payload);
  const names = async (ids: (string | null)[]) => {
    const list = [...new Set(ids.filter(Boolean) as string[])];
    if (!list.length) return {} as Record<string, string>;
    const { data: ps } = await admin.from("people").select("id, full_name").in("id", list);
    return Object.fromEntries(((ps as { id: string; full_name: string }[] | null) ?? []).map(x => [x.id, x.full_name]));
  };
  const who = await names([r.requester_person_id, r.dept_confirmed_by, r.registered_by]);
  const { data: dept } = r.department_id ? await admin.from("departments").select("name").eq("id", r.department_id).maybeSingle() : { data: null };
  const st = stage(r);
  const link = `${origin}/vendors/requests/${r.id}`;
  const vendor = p.vendor.legal_name || "Vendor";
  const results: MailResult[] = [];

  for (const step of emailPlan(event, r.status, !!r.registered_at && event === "registered")) {
    const kind = step.kind as EmailKind;
    const people = (await audience(admin, step.audience, r, approvals)).filter(x => x.id !== actor.personId);
    const rows: [string, string][] = [
      ["Vendor", [p.vendor.legal_name, p.vendor.dba && `(${p.vendor.dba})`].filter(Boolean).join(" ")],
      ["Country", p.vendor.country],
      ["Category", p.details.category],
      ["Requested by", (r.requester_person_id && who[r.requester_person_id]) || ""],
      ["Department", (dept as { name: string } | null)?.name ?? (r.department_id ? r.department_id : "Leadership")],
      ["Estimated annual spend", p.details.annual_spend],
      ["Status", STATUS_WORDS[st] ?? st],
      ...(step.audience === "approvers" && r.screening_status !== "clear" && r.screening_status !== "not_run"
        ? [["Sanctions check", r.screening_status === "match" ? "Matches the OFAC list — review before approving" : r.screening_status === "possible_match" ? "Possible OFAC match — check before approving" : "Cleared by an approver"] as [string, string]]
        : []),
      ...(step.kind === "vendor_decision" && r.decision_note ? [["Note", r.decision_note] as [string, string]] : []),
    ];
    const intro =
      step.kind === "vendor_submitted" ? "A vendor was requested for your department. Confirm the purchase or service is real and needed, or send it back."
      : step.kind === "vendor_approval" ? "A vendor is waiting for your approval before it can be added to the Master List."
      : step.kind === "vendor_decision" ? (r.status === "approved" ? "Your vendor was approved. Payments will register it at the bank." : r.status === "needs_info" ? "Your vendor request was sent back. Open it to see what's needed and resubmit." : "Your vendor request was rejected.")
      : step.audience === "payments" ? "This vendor was approved. Register it at the bank using the data in the intranet, then mark it as registered."
      : "Your vendor is registered at the bank and can now be paid.";
    const mail = renderEmail({ title: SUBJECT[step.kind](vendor).split(":")[0], intro, rows, link, linkLabel: "Open the request" });
    const subject = step.kind === "vendor_registered" && step.audience === "requester" ? `Vendor registered at the bank: ${vendor}` : SUBJECT[step.kind](vendor);
    for (const to of people) {
      const ref = emailRef(r.id, step.kind, st, step.audience, to.email);
      if (await alreadySent(admin, kind, ref)) continue;
      const result = await sendMail({ to: to.email, subject, ...mail });
      results.push(result);
      await logEmail(admin, { kind, ref_id: ref, to_email: to.email, subject, created_by: actor.userId, ...result });
    }
  }
  return results;
}
