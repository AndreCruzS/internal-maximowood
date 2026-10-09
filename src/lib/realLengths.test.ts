import { describe, expect, it } from "vitest";
import { isMetricLength, lengthLabel, realFt, realInches } from "./realLengths";
import { distributePieces } from "./pieceLengths";

describe("real lengths (EQUIVALENCE OF LENGTHS sheet)", () => {
  it("treats Ayous, Ash and Scandinavian Pine as metric-cut", () => {
    for (const s of ["AYOUS", "AYOUS BURNBLOCK", "THERMO® ASH", "SCANDINAVIAN", "MAXIMO THERMO SCANDINAVIAN PINE", "MAXIMO THERMO AYOUS"]) {
      expect(isMetricLength(s)).toBe(true);
    }
    for (const s of ["CLEAR RADIATA", "IPE", "CUMARU", "GARAPA", "ACCOYA GREY", "BULLETWOOD/BALATA", "", null]) {
      expect(isMetricLength(s)).toBe(false);
    }
  });

  it("matches the sheet: nominal N' = N × 0.30 m", () => {
    expect(realInches(4, "AYOUS")).toBeCloseTo(47.2441, 4);
    expect(realInches(9, "AYOUS")).toBeCloseTo(106.2992, 4);
    expect(realInches(19, "ASH")).toBeCloseTo(224.4094, 4);
    expect(realFt(9, "AYOUS")).toBeCloseTo(8.8583, 4);
    expect(realFt(9, "IPE")).toBe(9);
    expect(lengthLabel(9, "AYOUS")).toBe(`9' (106.30")`);
    expect(lengthLabel(9, "IPE")).toBe("9'");
  });

  it("pieces cover the need with real lengths", () => {
    // 250 sqft of 1x6 V-joint (5.26" face) + 10% waste over 8', 10', 12' Ayous
    const need = (250 / (5.26 / 12)) * 1.1;
    const r = distributePieces(need, [8, 10, 12], ft => realFt(ft, "AYOUS"))!;
    expect(r.breakdown.map(b => b.pieces)).toEqual([22, 21, 21]);
    expect(r.totalPieces).toBe(64);
    expect(r.actualLF).toBeGreaterThanOrEqual(need);
    expect(r.actualLF).toBeCloseTo(627.95, 2);
    // True-feet species are unchanged
    expect(distributePieces(need, [8, 10, 12])!.totalPieces).toBe(63);
  });
});
