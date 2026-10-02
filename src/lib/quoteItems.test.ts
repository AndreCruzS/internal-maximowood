import { describe, expect, it } from "vitest";
import { addOnName, addOnRate, editQuoteItem } from "@/lib/quoteItems";
import type { QuoteCartItem } from "@/components/QuoteModal";

// 1,111.1 LF of Ayous V-Joint 1x6 at $5.82, exposed face 5.26" → 487.03 sqft
const item: QuoteCartItem = {
  species: "THERMO® AYOUS",
  profile: "V JOINT / NICKEL GAP",
  nominalSize: "1 x 6",
  lf: 1111.1,
  sqft: 487.03,
  pricePerLF: 5.82,
  total: 6466.6,
  lengthType: "RL",
  addOns: [
    { label: "🏷️ Promo: Conservador scenario (was $6.10/LF)", amount: 0 },
    { label: "Milling ($1.50/LF)", amount: 1666.65 },
  ],
  speciesKey: "AYOUS",
  profileKey: "V JOINT / NICKEL GAP",
  sizeKey: "1 x 6",
  neededLF: 1111.1,
};

describe("editQuoteItem", () => {
  it("changing LF rescales sqft, material total, per-LF add-ons and stock need", () => {
    const e = editQuoteItem(item, { field: "lf", value: 2000 });
    expect(e.lf).toBe(2000);
    expect(e.neededLF).toBe(2000);
    expect(e.sqft).toBeCloseTo(876.66, 1);
    expect(e.total).toBe(11640);
    expect(e.addOns?.[1]).toEqual({ label: "Milling ($1.50/LF)", amount: 3000 });
    expect(e.addOns?.[0].amount).toBe(0); // promo note untouched
  });

  it("changing sqft back-computes LF", () => {
    const e = editQuoteItem(item, { field: "sqft", value: 974.06 });
    expect(e.lf).toBeCloseTo(2222.2, 1);
  });

  it("changing price recomputes only the material total", () => {
    const e = editQuoteItem(item, { field: "pricePerLF", value: 5 });
    expect(e.total).toBe(5555.5);
    expect(e.lf).toBe(1111.1);
    expect(e.addOns?.[1].amount).toBe(1666.65);
  });

  it("edits an add-on rate (and its label) or removes it", () => {
    const e = editQuoteItem(item, { field: "addOnRate", index: 1, value: 2 });
    expect(e.addOns?.[1]).toEqual({ label: "Milling ($2.00/LF)", amount: 2222.2 });
    const r = editQuoteItem(item, { field: "removeAddOn", index: 1 });
    expect(r.addOns).toHaveLength(1);
  });

  it("reads add-on rates and names from labels", () => {
    expect(addOnRate({ label: "Pre-Finish Color: Regular ($2.20/LF)", amount: 1 }, 10)).toBe(2.2);
    expect(addOnRate({ label: "Custom", amount: 50 }, 10)).toBe(5);
    expect(addOnName("Milling ($1.50/LF)")).toBe("Milling");
  });
});
