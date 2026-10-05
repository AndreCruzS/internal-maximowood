import { describe, expect, it } from "vitest";
import { addDays, buildQuoteRows } from "@/lib/generateQuotePDF";

describe("buildQuoteRows", () => {
  const item = {
    species: "THERMO® AYOUS", profile: "V JOINT / NICKEL GAP", nominalSize: "1 x 6",
    sqft: 438.33, lf: 1000, pricePerLF: 5.82, total: 5820, lengthType: "RL" as const,
    addOns: [
      { label: "🏷️ Promo: Dealer scenario (was $6.10/LF)", amount: 0 },
      { label: "Pre-Finish Color: Regular ($2.20/LF)", amount: 2200 },
      { label: "Milling ($1.00/LF)", amount: 1000 },
    ],
  };

  it("puts each add-on on its own line with the calculator's own amounts, and drops promo notes", () => {
    const rows = buildQuoteRows([item]);
    expect(rows.map(r => [r.line, r.item, r.qty, r.rate, r.amount])).toEqual([
      [1, "Maximo Thermo", 1000, 5.82, 5820],
      [2, "Pre-Finish", 1000, 2.2, 2200],
      [3, "Milling", 1000, 1, 1000],
    ]);
    expect(rows[0].desc).toContainEqual(["Lengths", "Random Lengths"]);
    expect(rows[1].desc[0]).toEqual(["Color", "Regular"]);
    expect(rows[1].desc[1]).toEqual(["Applied To", "Line 1, 1,000.00 LF"]);
  });

  it("names non-thermo products", () => {
    expect(buildQuoteRows([{ ...item, species: "IPE", addOns: [] }])[0].item).toBe("Maximo Hardwood");
    expect(buildQuoteRows([{ ...item, species: "ACCOYA", addOns: [] }])[0].item).toBe("Maximo Accoya");
  });
});

describe("addDays", () => {
  it("rolls over month ends", () => {
    expect(addDays("10/25/2026", 10)).toBe("11/04/2026");
    expect(addDays("not a date", 10)).toBe("");
  });
});
