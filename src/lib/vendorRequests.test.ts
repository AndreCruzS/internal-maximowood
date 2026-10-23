import { describe, expect, it } from "vitest";
import {
  approvalOutcome, canApprove, canConfirm, canMove, canRegister, emailPlan, emptyPayload, excludedFor, filePath, fileProblem,
  payloadIsSafe, payloadToSend, readPayload, requestProblems, rolesOn, screeningGate, stage,
  type ApprovalLike, type RequestLike,
} from "./vendorRequests";

const req = (over: Partial<RequestLike> = {}): RequestLike => ({
  id: "r1", kind: "new", status: "pending_approval", requester_person_id: "ana", department_id: "commercial",
  dept_confirmed_by: "head", registered_by: null, registered_at: null, screening_status: "clear", sanctions_cleared_by: null, ...over,
});
const ok = { ok: true };

describe("bank numbers never leave the browser in full", () => {
  it("keeps only the last 4 of what was typed", () => {
    const p = payloadToSend(emptyPayload(), { account: "000123456789", routing: "026 009 593" });
    expect(p.bank.account_last4).toBe("6789");
    expect(p.bank.routing_last4).toBe("9593");
    expect(JSON.stringify(p)).not.toContain("123456789");
    expect(JSON.stringify(p)).not.toContain("026009593");
    expect(payloadIsSafe(p)).toBe(true);
  });
  it("truncates even if a full number ended up in a last-4 field", () => {
    const p = emptyPayload();
    p.bank.account_last4 = "9876543210";
    expect(payloadToSend(p, {}).bank.account_last4).toBe("3210");
  });
  it("flags payloads carrying full numbers (same rule as the database)", () => {
    expect(payloadIsSafe({ bank: { account_number: "123456789" } })).toBe(false);
    expect(payloadIsSafe({ iban: "GB29NWBK60161331926819" })).toBe(false);
    expect(payloadIsSafe({ bank: { account_last4: "123456" } })).toBe(false);
    expect(payloadIsSafe({ bank: { account_last4: "1234", routing_last4: "" } })).toBe(true);
  });
  it("normalizes SWIFT and currency", () => {
    const p = emptyPayload();
    p.bank.swift_bic = "bofa us 3n";
    p.bank.currency = "brl";
    const out = payloadToSend(p, {});
    expect(out.bank.swift_bic).toBe("BOFAUS3N");
    expect(out.bank.currency).toBe("BRL");
  });
});

describe("readPayload", () => {
  it("fills missing fields and ignores junk", () => {
    const p = readPayload({ vendor: { legal_name: "Acme LLC", website: 42 }, details: { is_1099: true }, compliance: { vetted: false } });
    expect(p.vendor.legal_name).toBe("Acme LLC");
    expect(p.vendor.website).toBe("");
    expect(p.vendor.address.city).toBe("");
    expect(p.details.is_1099).toBe(true);
    expect(p.compliance.vetted).toBe(false);
    expect(readPayload(null).bank.currency).toBe("USD");
  });
});

describe("request problems", () => {
  const base = () => ({ payload: emptyPayload(), company_ids: ["lumberplus"], department_id: "commercial", hasBankProof: true, leadership: false });
  it("needs a legal name, a company, a department and the bank proof", () => {
    expect(requestProblems({ ...base(), company_ids: [], department_id: null, hasBankProof: false })).toEqual(["legal_name", "companies", "department", "bank_proof"]);
  });
  it("leadership requests don't need a department", () => {
    const b = base();
    b.payload.vendor.legal_name = "Acme";
    expect(requestProblems({ ...b, department_id: null, leadership: true })).toEqual([]);
  });
  it("checks SWIFT, currency and the contact email", () => {
    const b = base();
    b.payload.vendor.legal_name = "Acme";
    b.payload.bank.swift_bic = "BOFA";
    b.payload.bank.currency = "DOLLARS";
    b.payload.vendor.contact.email = "not-an-email";
    expect(requestProblems(b)).toEqual(["swift", "currency", "contact_email"]);
  });
});

describe("files", () => {
  it("accepts PDF / JPG / PNG up to 10 MB", () => {
    expect(fileProblem({ type: "application/pdf", size: 1000 })).toBeNull();
    expect(fileProblem({ type: "image/png", size: 10 * 1024 * 1024 })).toBeNull();
    expect(fileProblem({ type: "", size: 10, name: "check.JPG" })).toBeNull();
  });
  it("refuses other types, empty and large files", () => {
    expect(fileProblem({ type: "application/vnd.ms-excel", size: 10, name: "list.xls" })).toBe("type");
    expect(fileProblem({ type: "image/heic", size: 10 })).toBe("type");
    expect(fileProblem({ type: "application/pdf", size: 10 * 1024 * 1024 + 1 })).toBe("size");
    expect(fileProblem({ type: "application/pdf", size: 0 })).toBe("empty");
  });
  it("stores files in the uploader's own folder with a safe name", () => {
    expect(filePath("u1", "r1", "Voided chéque (1).pdf", "ab12")).toBe("u1/r1/ab12-Voided-cheque-1-.pdf");
  });
});

describe("segregation of duties", () => {
  it("the requester can't confirm or approve their own request", () => {
    expect(canConfirm("ana", req({ status: "submitted", dept_confirmed_by: null }), ["commercial"])).toEqual({ ok: false, reason: "own_request" });
    expect(canApprove("ana", req(), [], true)).toEqual({ ok: false, reason: "own_request" });
  });
  it("only heads of the request's department confirm", () => {
    const r = req({ status: "submitted", dept_confirmed_by: null });
    expect(canConfirm("bob", r, ["finance"])).toEqual({ ok: false, reason: "not_head" });
    expect(canConfirm("bob", r, ["commercial"])).toEqual(ok);
  });
  it("whoever confirmed for the department can't also approve", () => {
    expect(canApprove("head", req(), [], true)).toEqual({ ok: false, reason: "confirmed_it" });
  });
  it("approvers need the duty and decide once", () => {
    expect(canApprove("paulo", req(), [], false)).toEqual({ ok: false, reason: "not_approver" });
    expect(canApprove("paulo", req(), [{ approver_person_id: "paulo", decision: "approve" }], true)).toEqual({ ok: false, reason: "already_decided" });
    expect(canApprove("paulo", req(), [], true)).toEqual(ok);
  });
  it("Paulo (approver and Payments) can't register a vendor he approved", () => {
    const r = req({ status: "approved" });
    const approvals: ApprovalLike[] = [{ approver_person_id: "paulo", decision: "approve" }];
    expect(canRegister("paulo", r, approvals, true)).toEqual({ ok: false, reason: "other_role" });
    expect(canRegister("silmara", r, approvals, true)).toEqual(ok);
  });
  it("nobody who requested, confirmed or cleared a sanctions hit registers it", () => {
    const r = req({ status: "approved", sanctions_cleared_by: "giovani" });
    expect(canRegister("ana", r, [], true).ok).toBe(false);
    expect(canRegister("head", r, [], true).ok).toBe(false);
    expect(canRegister("giovani", r, [], true).ok).toBe(false);
    expect(canRegister("vinicios", r, [], false)).toEqual({ ok: false, reason: "not_payments" });
  });
  it("only once, and only after approval", () => {
    expect(canRegister("silmara", req({ status: "pending_approval" }), [], true)).toEqual({ ok: false, reason: "not_waiting" });
    expect(canRegister("silmara", req({ status: "approved", registered_at: "2026-10-23", registered_by: "vinicios" }), [], true)).toEqual({ ok: false, reason: "not_waiting" });
  });
  it("lists every role a person played", () => {
    const roles = rolesOn(req({ registered_by: "silmara", sanctions_cleared_by: "paulo" }), [{ approver_person_id: "paulo", decision: "approve" }]);
    expect(roles.get("paulo")).toEqual(["sanctions", "approver"]);
    expect(roles.get("silmara")).toEqual(["payments"]);
  });
});

describe("approval counting", () => {
  const a = (who: string, decision: "approve" | "reject" = "approve"): ApprovalLike => ({ approver_person_id: who, decision });
  it("one approval is enough when the setting is 1", () => {
    expect(approvalOutcome([a("paulo")], 1)).toMatchObject({ approves: 1, done: true });
  });
  it("needs two different approvers when the setting is 2", () => {
    expect(approvalOutcome([a("paulo")], 2).done).toBe(false);
    expect(approvalOutcome([a("paulo"), a("paulo")], 2).done).toBe(false);
    expect(approvalOutcome([a("paulo"), a("giovani")], 2).done).toBe(true);
  });
  it("any rejection closes it", () => {
    expect(approvalOutcome([a("paulo"), a("giovani", "reject")], 1)).toMatchObject({ rejected: true, done: false });
  });
  it("never needs fewer than one", () => {
    expect(approvalOutcome([], 0)).toMatchObject({ required: 1, done: false });
  });
});

describe("sanctions gating", () => {
  it("a match blocks approval until it's cleared as a false positive with a note", () => {
    expect(screeningGate("match", true, "")).toEqual({ ok: false, needs: "note" });
    expect(screeningGate("match", false, "Different company: checked Sunbiz and the OFAC entry")).toEqual({ ok: true, needs: null });
  });
  it("a possible match needs the approver's acknowledgement", () => {
    expect(screeningGate("possible_match", false, "")).toEqual({ ok: false, needs: "ack" });
    expect(screeningGate("possible_match", true, "")).toEqual({ ok: true, needs: null });
  });
  it("no approval before the check ran; clear and cleared pass", () => {
    expect(screeningGate("not_run", true, "x".repeat(20)).needs).toBe("screening");
    expect(screeningGate("clear", false, "").ok).toBe(true);
    expect(screeningGate("false_positive", false, "").ok).toBe(true);
  });
});

describe("status moves", () => {
  it("follows the flow", () => {
    expect(canMove("draft", "submitted")).toBe(true);
    expect(canMove("submitted", "pending_approval")).toBe(true);
    expect(canMove("pending_approval", "approved")).toBe(true);
    expect(canMove("draft", "approved")).toBe(false);
    expect(canMove("approved", "cancelled")).toBe(false);
    expect(canMove("rejected", "submitted")).toBe(false);
  });
  it("shows registered once Payments set it up", () => {
    expect(stage({ status: "approved", registered_at: null })).toBe("approved");
    expect(stage({ status: "approved", registered_at: "2026-10-23" })).toBe("registered");
  });
});

describe("emails", () => {
  it("a submitted request goes to the department head; a confirmed one to the approvers", () => {
    expect(emailPlan("submitted", "submitted", false)).toEqual([{ kind: "vendor_submitted", audience: "dept_heads" }]);
    expect(emailPlan("submitted", "pending_approval", false)).toEqual([{ kind: "vendor_approval", audience: "approvers" }]);
    expect(emailPlan("confirmed", "pending_approval", false)).toEqual([{ kind: "vendor_approval", audience: "approvers" }]);
  });
  it("an approval still waiting for more approvers sends nothing", () => {
    expect(emailPlan("approved", "pending_approval", false)).toEqual([]);
  });
  it("approved: the requester hears, and Payments is asked to register it", () => {
    expect(emailPlan("approved", "approved", false)).toEqual([
      { kind: "vendor_decision", audience: "requester" },
      { kind: "vendor_registered", audience: "payments" },
    ]);
  });
  it("rejected or sent back: the requester; registered: the requester", () => {
    expect(emailPlan("approved", "rejected", false)).toEqual([{ kind: "vendor_decision", audience: "requester" }]);
    expect(emailPlan("confirmed", "needs_info", false)).toEqual([{ kind: "vendor_decision", audience: "requester" }]);
    expect(emailPlan("registered", "approved", true)).toEqual([{ kind: "vendor_registered", audience: "requester" }]);
  });
  it("Payments emails skip anyone who had a role on the request", () => {
    const ex = excludedFor("payments", req({ status: "approved" }), [{ approver_person_id: "paulo", decision: "approve" }]);
    expect([...ex].sort()).toEqual(["ana", "head", "paulo"]);
    expect([...excludedFor("approvers", req(), [])].sort()).toEqual(["ana", "head"]);
  });
});
