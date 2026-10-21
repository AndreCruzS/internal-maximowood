import { describe, expect, it } from "vitest";
import { HR_LINK_IDS, RIPPLING_HOME, canCancel, invalidLinks, isApproved, parseHrPay, workdays } from "./timeOff";

describe("workdays", () => {
  it("counts Monday to Friday, both ends included", () => {
    expect(workdays("2026-10-19", "2026-10-23")).toBe(5); // Mon–Fri
    expect(workdays("2026-10-23", "2026-10-26")).toBe(2); // Fri–Mon
    expect(workdays("2026-10-24", "2026-10-25")).toBe(0); // weekend
    expect(workdays("2026-10-21", "2026-10-21")).toBe(1);
  });
  it("is 0 for reversed or bad dates", () => {
    expect(workdays("2026-10-23", "2026-10-19")).toBe(0);
    expect(workdays("nope", "2026-10-19")).toBe(0);
  });
});

describe("status helpers", () => {
  it("treats rows without a status (before migration 0024) as approved", () => {
    expect(isApproved({})).toBe(true);
    expect(isApproved({ status: "pending" })).toBe(false);
  });
  it("lets the person cancel pending or upcoming approved time off, never Rippling's", () => {
    const today = "2026-10-21";
    expect(canCancel({ status: "pending", ends_on: "2026-10-01", source: "intranet" }, today)).toBe(true);
    expect(canCancel({ status: "approved", ends_on: "2026-10-21", source: "intranet" }, today)).toBe(true);
    expect(canCancel({ status: "approved", ends_on: "2026-10-20", source: "intranet" }, today)).toBe(false);
    expect(canCancel({ status: "declined", ends_on: "2026-12-01", source: "intranet" }, today)).toBe(false);
    expect(canCancel({ status: "pending", ends_on: "2026-12-01", source: "rippling" }, today)).toBe(false);
  });
});

describe("parseHrPay", () => {
  it("returns every known link in order, defaulting to Rippling's home page", () => {
    const s = parseHrPay(null);
    expect(s.links.map(l => l.id)).toEqual([...HR_LINK_IDS]);
    expect(s.links.every(l => l.url === RIPPLING_HOME)).toBe(true);
    expect(s.note).toBe("");
  });
  it("keeps stored https links, drops unknown ids and non-https URLs", () => {
    const s = parseHrPay({
      links: [
        { id: "paystubs", url: "https://app.rippling.com/payroll" },
        { id: "benefits", url: "javascript:alert(1)" },
        { id: "evil", url: "https://example.com" },
        { id: "paystubs", url: "https://second.example.com" },
      ],
      note: "US team only",
    });
    expect(s.links.find(l => l.id === "paystubs")?.url).toBe("https://app.rippling.com/payroll");
    expect(s.links.find(l => l.id === "benefits")?.url).toBe(RIPPLING_HOME);
    expect(s.links).toHaveLength(HR_LINK_IDS.length);
    expect(s.note).toBe("US team only");
  });
  it("flags links that aren't https", () => {
    expect(invalidLinks([{ id: "a", url: "https://ok.com" }, { id: "b", url: "http://no.com" }, { id: "c", url: "" }])).toEqual(["b", "c"]);
  });
});
