import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { RAMP_SCOPES, fromMinor, normalizeTxn, requestedScopes } from "./client";
import { demoRamp, isDemoId } from "./demo";
import { verifyRampSignature } from "./webhook";
import { needsReceipt, rampMemo, receiptPath } from "@/lib/expenses";
import { reimbState } from "@/components/expenses/parts";

describe("ramp amounts", () => {
  it("reads minor units (cents) and the legacy dollar field", () => {
    expect(fromMinor({ value: 6418, currency: "USD" })).toEqual({ amount: 64.18, currency: "USD" });
    expect(fromMinor({ amount: 1000, currency_code: "JPY", minor_unit_conversion_rate: 1 })).toEqual({ amount: 1000, currency: "JPY" });
    expect(fromMinor(null, 12.5)).toEqual({ amount: 12.5, currency: "USD" });
    expect(fromMinor(undefined)).toEqual({ amount: null, currency: "USD" });
  });
  it("normalizes a transaction", () => {
    const t = normalizeTxn(
      { id: "t1", entity_amount: { value: 4210, currency: "USD" }, merchant_name: "Shell", user_transaction_time: "2026-10-01T10:00:00Z",
        state: "CLEARED", card_id: "c1", receipts: [], card_holder: { user_id: "u1", first_name: "Ana", last_name: "M" }, sk_category_name: "Fuel" },
      new Map([["c1", "4242"]]),
    );
    expect(t).toMatchObject({ amount: 42.1, merchant: "Shell", cardLast4: "4242", holderName: "Ana M", receiptCount: 0 });
    expect(needsReceipt(t)).toBe(true);
    expect(needsReceipt({ ...t, state: "DECLINED" })).toBe(false);
    expect(needsReceipt({ ...t, receiptCount: 1 })).toBe(false);
  });
});

describe("webhook signature", () => {
  const body = JSON.stringify({ id: "evt_1", type: "transactions.cleared" });
  const hex = createHmac("sha256", "s3cret").update(body).digest("hex");
  it("accepts the right signature, hex or base64, with or without the prefix", () => {
    expect(verifyRampSignature(body, hex, "s3cret")).toBe(true);
    expect(verifyRampSignature(body, `sha256=${hex}`, "s3cret")).toBe(true);
    expect(verifyRampSignature(body, Buffer.from(hex, "hex").toString("base64"), "s3cret")).toBe(true);
  });
  it("refuses anything else", () => {
    expect(verifyRampSignature(body, hex, "other")).toBe(false);
    expect(verifyRampSignature(`${body} `, hex, "s3cret")).toBe(false);
    expect(verifyRampSignature(body, null, "s3cret")).toBe(false);
    expect(verifyRampSignature(body, hex, undefined)).toBe(false);
  });
});

describe("expenses helpers", () => {
  it("notes who made the purchase when it wasn't the card holder", () => {
    expect(rampMemo("Lunch", "Ana", "Ana")).toBe("Lunch");
    expect(rampMemo("", "Bruno", "Ana")).toBe("Purchased by Bruno (receipt sent via the GMX intranet)");
    expect(rampMemo(" Lunch ", "Bruno", "Ana")).toBe("Lunch — Purchased by Bruno (receipt sent via the GMX intranet)");
  });
  it("names uploads safely inside the uploader's folder", () => {
    expect(receiptPath("u1", "Recibo Março.HEIC", "abc")).toBe("u1/abc.heic");
    expect(receiptPath("u1", "noext", "abc")).toBe("u1/abc.noext");
    expect(receiptPath("u1", "../../evil.p/hp", "abc")).toBe("u1/abc.php");
  });
  it("sums Ramp's reimbursement states into four", () => {
    const s = { paid: "paid", approved: "approved", pending: "pending", rejected: "rejected", draft: "draft" };
    expect(reimbState("REIMBURSED_VIA_PUSH", s)).toBe("paid");
    expect(reimbState("AWAITING_PAYMENT", s)).toBe("approved");
    expect(reimbState("PENDING", s)).toBe("pending");
    expect(reimbState("REJECTED", s)).toBe("rejected");
    expect(reimbState("DRAFT", s)).toBe("draft");
  });
});

describe("sample data", () => {
  it("is the same for the same person and never looks like a real Ramp id", () => {
    const now = new Date("2026-10-15T12:00:00Z");
    const a = demoRamp("11111111-2222-3333-4444-555555555555", "Ana", now);
    expect(demoRamp("11111111-2222-3333-4444-555555555555", "Ana", now)).toEqual(a);
    expect(a.txns.filter(needsReceipt).length).toBe(4);
    expect([...a.txns, ...a.cards].every(x => isDemoId(x.id))).toBe(true);
  });
});

describe("ramp scopes", () => {
  it("asks for every scope by default", () => {
    expect(requestedScopes(undefined)).toEqual([...RAMP_SCOPES]);
    expect(requestedScopes("")).toEqual([...RAMP_SCOPES]);
  });
  it("uses RAMP_SCOPES when set, ignoring junk and duplicates", () => {
    expect(requestedScopes("transactions:read, cards:read  cards:read bogus users;write")).toEqual(["transactions:read", "cards:read"]);
  });
});
