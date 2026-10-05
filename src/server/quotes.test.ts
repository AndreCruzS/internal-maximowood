import { describe, expect, it } from "vitest";
import { parseQuoteInput, quoteToRow, rowToQuote, MAX_QUOTE_ITEMS, type QuoteRow } from "@/server/quotes";
import { quoteEditHref, quoteItemsTotal } from "@/lib/quotes";

const item = {
  species: "THERMO® Ayous",
  profile: "Nickel Gap",
  nominalSize: "1x6",
  sqft: 100,
  lf: 240,
  pricePerLF: 3.5,
  total: 840,
  lengthType: "RL",
  addOns: [{ label: "Milling", amount: 60 }],
  speciesKey: "Ayous",
  profileKey: "Nickel Gap",
  sizeKey: "1x6",
  neededLF: 240,
};

const body = { projectName: "  Deck — Main St  ", calculator: "retail", items: [item] };

describe("parseQuoteInput", () => {
  it("accepts a valid quote and trims the project name", () => {
    const r = parseQuoteInput({ ...body, company: " ABC ", tax: "12.345", shipping: "" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.quote.projectName).toBe("Deck — Main St");
    expect(r.quote.company).toBe("ABC");
    expect(r.quote.tax).toBe(12.35);
    expect(r.quote.shipping).toBeNull();
    expect(r.quote.items[0]).toMatchObject({ species: "THERMO® Ayous", lengthType: "RL", neededLF: 240 });
  });

  it("requires a project name", () => {
    const r = parseQuoteInput({ ...body, projectName: "   " });
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/project name/i) });
  });

  it("requires at least one item and caps the count", () => {
    expect(parseQuoteInput({ ...body, items: [] }).ok).toBe(false);
    expect(parseQuoteInput({ ...body, items: Array(MAX_QUOTE_ITEMS + 1).fill(item) }).ok).toBe(false);
  });

  it("rejects malformed items and money", () => {
    expect(parseQuoteInput({ ...body, items: [{ ...item, total: "840" }] }).ok).toBe(false);
    expect(parseQuoteInput({ ...body, items: [{ ...item, addOns: [{ label: "x" }] }] }).ok).toBe(false);
    expect(parseQuoteInput({ ...body, tax: -1 }).ok).toBe(false);
    expect(parseQuoteInput({ ...body, shipping: "abc" }).ok).toBe(false);
  });

  it("defaults unknown calculators to retail", () => {
    const r = parseQuoteInput({ ...body, calculator: "nope" });
    expect(r.ok && r.quote.calculator).toBe("retail");
  });
});

describe("quote row mapping", () => {
  it("computes the stored total from items + add-ons", () => {
    const r = parseQuoteInput({ ...body, items: [item, item] });
    if (!r.ok) throw new Error(r.error);
    expect(quoteToRow(r.quote).total).toBe(1800);
    expect(quoteItemsTotal(r.quote.items)).toBe(1800);
  });

  it("accepts a whole-number lead time and rejects anything else", () => {
    const ok = parseQuoteInput({ ...body, leadTimeWeeks: 6 });
    if (!ok.ok) throw new Error(ok.error);
    expect(ok.quote.leadTimeWeeks).toBe(6);
    expect(quoteToRow(ok.quote).lead_time_weeks).toBe(6);
    const none = parseQuoteInput(body);
    expect(none.ok && none.quote.leadTimeWeeks).toBeNull();
    for (const bad of [0, 2.5, 53, "x"]) expect(parseQuoteInput({ ...body, leadTimeWeeks: bad }).ok).toBe(false);
  });

  it("converts PostgREST numeric strings back to numbers", () => {
    const row: QuoteRow = {
      id: "6f1c1f9e-0000-4000-8000-000000000000",
      user_id: "11111111-0000-4000-8000-000000000000",
      project_name: "Deck",
      calculator: "b2b",
      company: null,
      contact: null,
      address: null,
      prepared_by: null,
      notes: null,
      tax: "10.50",
      shipping: null,
      lead_time_weeks: 6,
      items: [item],
      total: "900.00",
      created_at: "2026-10-01T00:00:00Z",
      updated_at: "2026-10-02T00:00:00Z",
    };
    const q = rowToQuote(row);
    expect(q).toMatchObject({ ownerId: "11111111-0000-4000-8000-000000000000", calculator: "b2b", tax: 10.5, shipping: null, leadTimeWeeks: 6, total: 900, company: "" });
    expect(quoteEditHref(q)).toBe("/b2b?quote=6f1c1f9e-0000-4000-8000-000000000000");
    expect(quoteEditHref({ ...q, calculator: "retail" })).toBe("/calculator?quote=6f1c1f9e-0000-4000-8000-000000000000");
  });
});
