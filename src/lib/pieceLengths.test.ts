import { describe, expect, it } from "vitest";
import { distributePieces } from "@/lib/pieceLengths";

describe("distributePieces", () => {
  it("covers the need with the least extra LF, counts differing by at most one", () => {
    // 100 sqft → 250.95 LF with 10% waste, lengths 7–16'
    const r = distributePieces(250.95, [7, 8, 9, 10, 12, 14, 16])!;
    expect(r.actualLF).toBe(251);
    expect(r.totalPieces).toBe(23);
    // 3 of each (228 LF) + two extra pieces adding 23 LF (e.g. 9' + 14')
    expect(r.piecesEach).toBe(3);
    expect(r.breakdown.filter(b => b.pieces === 4).reduce((s, b) => s + b.length, 0)).toBe(23);
  });

  it("never comes up short", () => {
    for (const need of [1, 37.5, 76, 100.01, 999.99]) {
      const r = distributePieces(need, [8, 12, 16])!;
      expect(r.actualLF).toBeGreaterThanOrEqual(need);
      const counts = r.breakdown.map(b => b.pieces);
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    }
  });

  it("adds nothing extra when the need divides exactly", () => {
    const r = distributePieces(72, [8, 10])!; // 4 × (8 + 10)
    expect(r.breakdown).toEqual([{ length: 8, pieces: 4, lf: 32 }, { length: 10, pieces: 4, lf: 40 }]);
  });

  it("rounds a single length up to whole pieces", () => {
    expect(distributePieces(250.95, [12])).toMatchObject({ totalPieces: 21, actualLF: 252 });
  });

  it("returns null with no lengths or no quantity", () => {
    expect(distributePieces(100, [])).toBeNull();
    expect(distributePieces(0, [8])).toBeNull();
  });
});
