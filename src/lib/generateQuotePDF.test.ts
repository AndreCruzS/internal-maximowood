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

  it("folds add-ons into one product line with an unnumbered breakdown, and drops promo notes", () => {
    const rows = buildQuoteRows([item, { ...item, addOns: [] }]);
    expect(rows.map(r => [r.line, r.item, r.qty, r.amount])).toEqual([
      [1, "Maximo Thermo", 1000, 9020],
      [2, "Maximo Thermo", 1000, 5820],
    ]);
    expect(rows[0].rate).toBeCloseTo(9.02);
    expect(rows[0].breakdown).toEqual([
      { label: "Material", rate: 5.82, amount: 5820 },
      { label: "Pre-Finished Color: Regular", rate: 2.2, amount: 2200 },
      { label: "Milling", rate: 1, amount: 1000 },
    ]);
    expect(rows[1].breakdown).toEqual([]);
    expect(rows[0].desc).toContainEqual(["Lengths", "Random Lengths"]);
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
