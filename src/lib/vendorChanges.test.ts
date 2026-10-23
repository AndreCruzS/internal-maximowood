import { describe, expect, it } from "vitest";
import {
  bankChange, buildDiff, changeProblems, digestRecipients, isChangeKind, needsBankStep, reviewDigest, reviewDue, reviewKindFor,
  type VendorSnapshot,
} from "./vendorChanges";
import { emailPlan, emptyPayload, payloadIsSafe, payloadToSend, readPayload, stage, canRegister, type RequestPayload } from "./vendorRequests";

const before: VendorSnapshot = {
  legal_name: "Ocean Class Shipping Group LLC", dba: "", country: "US", tax_id: "12-3456789", tax_id_type: "ein",
  address: { line1: "1 Main St", city: "Miami" }, contact: { name: "Ana", email: "ana@ocean.com" }, website: "", category: "Freight / logistics",
  companies: ["lumberplus"],
  bank: [{ id: "b1", bank_name: "Chase", holder_name: "Ocean Class Shipping Group LLC", account_last4: "6789", routing_last4: "0021", swift_bic: "", bank_country: "US", currency: "USD", payment_method: "wire" }],
};
const payloadFrom = (patch: (p: RequestPayload) => void): RequestPayload => {
  const p = emptyPayload();
  p.vendor.legal_name = before.legal_name!;
  p.vendor.country = before.country!;
  p.vendor.tax_id = before.tax_id!;
  p.vendor.tax_id_type = before.tax_id_type!;
  p.vendor.address = { ...p.vendor.address, ...before.address };
  p.vendor.contact = { ...p.vendor.contact, ...before.contact };
  p.details.category = before.category!;
  patch(p);
  return p;
};

describe("details change diff", () => {
  it("lists only changed fields that really differ, old → new", () => {
    const p = payloadFrom(x => { x.vendor.dba = "Ocean Class"; x.details.category = "Services"; x.changed = ["dba", "category", "country"]; });
    expect(buildDiff(before, p, [])).toEqual([
      { field: "dba", before: "", after: "Ocean Class" },
      { field: "category", before: "Freight / logistics", after: "Services" },
    ]);
  });
  it("ignores fields not in payload.changed", () => {
    const p = payloadFrom(x => { x.vendor.legal_name = "Something Else"; x.changed = []; });
    expect(buildDiff(before, p, [])).toEqual([]);
  });
  it("shows companies by name and tax id with its type", () => {
    const p = payloadFrom(x => { x.vendor.tax_id = "98-7654321"; x.changed = ["tax_id", "companies"]; });
    const names = (id: string) => ({ lumberplus: "Lumber Plus", maximo: "Maximo" })[id] ?? id;
    expect(buildDiff(before, p, ["maximo", "lumberplus"], names)).toEqual([
      { field: "tax_id", before: "12-3456789 · EIN", after: "98-7654321 · EIN" },
      { field: "companies", before: "Lumber Plus", after: "Lumber Plus, Maximo" },
    ]);
  });
  it("keeps the changed list through save / reload, dropping unknown fields", () => {
    expect(readPayload({ changed: ["dba", "bank", "dba", 3] }).changed).toEqual(["dba"]);
    expect(readPayload({}).changed).toEqual([]);
  });
});

describe("bank change", () => {
  it("shows the account in use and the new one, masked", () => {
    const p = payloadFrom(x => { x.bank = { ...x.bank, bank_name: "Wells Fargo", account_last4: "4321", currency: "USD", payment_method: "ach" }; });
    const b = bankChange(before, p);
    expect(b.before).toEqual(["Chase · Ocean Class Shipping Group LLC · •••• 6789 · routing •••• 0021 · USD · WIRE"]);
    expect(b.after).toBe("Wells Fargo · •••• 4321 · USD · ACH");
  });
  it("never sends a full account number", () => {
    const p = payloadToSend(payloadFrom(() => {}), { account: "000123454321", routing: "026009593" });
    expect(p.bank.account_last4).toBe("4321");
    expect(p.bank.routing_last4).toBe("9593");
    expect(payloadIsSafe(p)).toBe(true);
    expect(JSON.stringify(p)).not.toContain("000123454321");
    expect(payloadIsSafe({ ...p, bank: { ...p.bank, account_number: "000123454321" } })).toBe(false);
  });
});

describe("change problems", () => {
  it("bank change needs a reason, the new bank and a new bank proof", () => {
    const p = payloadFrom(() => {});
    expect(changeProblems("change_bank", { payload: p, purpose: "", hasBankProof: false })).toEqual(["reason", "new_bank", "bank_proof"]);
    p.bank = { ...p.bank, bank_name: "Wells Fargo", account_last4: "4321" };
    expect(changeProblems("change_bank", { payload: p, purpose: "Moved banks", hasBankProof: true })).toEqual([]);
  });
  it("details change needs at least one real change", () => {
    const p = payloadFrom(() => {});
    expect(changeProblems("change_details", { payload: p, purpose: "x", hasBankProof: false, diff: [] })).toEqual(["no_change"]);
    expect(changeProblems("change_details", { payload: p, purpose: "x", hasBankProof: false, diff: [{ field: "dba", before: "", after: "A" }] })).toEqual([]);
  });
});

describe("yearly review", () => {
  const today = "2026-10-23";
  it("is due within 30 days, overdue after the date, only for approved vendors", () => {
    expect(reviewDue({ status: "approved", next_review_on: "2026-11-22" }, today)).toBe("due_soon");
    expect(reviewDue({ status: "approved", next_review_on: "2026-11-23" }, today)).toBe(null);
    expect(reviewDue({ status: "approved", next_review_on: "2026-10-22" }, today)).toBe("overdue");
    expect(reviewDue({ status: "approved", next_review_on: "2026-10-23" }, today)).toBe("due_soon");
    expect(reviewDue({ status: "suspended", next_review_on: "2026-01-01" }, today)).toBe(null);
    expect(reviewDue({ status: "approved", next_review_on: null }, today)).toBe(null);
  });
  it("picks the kind of review that can be started", () => {
    expect(reviewKindFor({ status: "legacy_pending", next_review_on: null }, today)).toBe("legacy_review");
    expect(reviewKindFor({ status: "suspended", next_review_on: "2027-01-01" }, today)).toBe("reactivate");
    expect(reviewKindFor({ status: "approved", next_review_on: "2026-11-01" }, today)).toBe("periodic_review");
    expect(reviewKindFor({ status: "approved", next_review_on: "2027-06-01" }, today)).toBe(null);
  });
  it("digest: overdue first, then by date; nothing that isn't due", () => {
    const list = reviewDigest([
      { id: "a", legal_name: "A", status: "approved", next_review_on: "2026-11-10" },
      { id: "b", legal_name: "B", status: "approved", next_review_on: "2026-10-01" },
      { id: "c", legal_name: "C", status: "approved", next_review_on: "2027-03-01" },
      { id: "d", legal_name: "D", status: "approved", next_review_on: "2026-10-30" },
      { id: "e", legal_name: "E", status: "suspended", next_review_on: "2026-09-01" },
    ], today);
    expect(list.map(x => `${x.id}:${x.window}`)).toEqual(["b:overdue", "d:due_soon", "a:due_soon"]);
  });
  it("digest recipients: approvers + Finance once each, no blanks", () => {
    expect(digestRecipients([
      [{ email: "Paulo@gmx.us", name: "Paulo" }, { email: null, name: "No email" }, { email: "giovani@gmx.us", name: "Giovani" }],
      [{ email: "paulo@gmx.us", name: "Paulo (Finance)" }, { email: "silmara@gmx.us", name: "Silmara" }, { email: "not-an-email", name: "x" }],
    ])).toEqual([
      { email: "paulo@gmx.us", name: "Paulo" }, { email: "giovani@gmx.us", name: "Giovani" }, { email: "silmara@gmx.us", name: "Silmara" },
    ]);
  });
});

describe("bank step by kind", () => {
  it("a yearly review has no bank step; every other kind does", () => {
    expect(needsBankStep("periodic_review")).toBe(false);
    for (const k of ["new", "change_bank", "change_details", "legacy_review", "reactivate"] as const) expect(needsBankStep(k)).toBe(true);
    expect(isChangeKind("change_bank")).toBe(true);
    expect(isChangeKind("reactivate")).toBe(false);
  });
  it("an approved yearly review is 'reviewed', with no Payments step or email", () => {
    expect(stage({ status: "approved", registered_at: null, kind: "periodic_review" })).toBe("reviewed");
    expect(stage({ status: "approved", registered_at: null, kind: "change_bank" })).toBe("approved");
    const r = { id: "r", kind: "periodic_review" as const, status: "approved" as const, requester_person_id: "f", department_id: "finance", dept_confirmed_by: "f", registered_by: null, registered_at: null, screening_status: "clear" as const };
    expect(canRegister("s", r, [], true)).toEqual({ ok: false, reason: "not_waiting" });
    expect(canRegister("s", { ...r, kind: "change_bank" }, [], true)).toEqual({ ok: true });
    expect(emailPlan("approved", "approved", false, "periodic_review")).toEqual([{ kind: "vendor_decision", audience: "requester" }]);
    expect(emailPlan("approved", "approved", false, "change_bank")).toEqual([
      { kind: "vendor_decision", audience: "requester" }, { kind: "vendor_registered", audience: "payments" },
    ]);
  });
  it("Paulo's rule still holds on a change request", () => {
    const r = { id: "r", kind: "change_bank" as const, status: "approved" as const, requester_person_id: "ana", department_id: "commercial", dept_confirmed_by: "head", registered_by: null, registered_at: null, screening_status: "clear" as const };
    expect(canRegister("paulo", r, [{ approver_person_id: "paulo", decision: "approve" }], true)).toEqual({ ok: false, reason: "other_role" });
    expect(canRegister("silmara", r, [{ approver_person_id: "paulo", decision: "approve" }], true)).toEqual({ ok: true });
  });
});
