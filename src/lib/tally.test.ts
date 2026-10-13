import { describe, expect, it } from "vitest";
import { TALLY_LENGTHS, allocateTally, fillStatus, pieceLF } from "./tally";

const stockAll = (n: number) => Object.fromEntries(TALLY_LENGTHS.map(ft => [ft, n]));

describe("Ayous tally", () => {
  it("uses real lengths: a 9 ft piece is 2.70 m", () => {
    expect(pieceLF(9)).toBeCloseTo(8.858, 3);
  });
  it("fills an order in whole packs, close to the order and near the standard mix", () => {
    const r = allocateTally({ orderLF: 5000, pack: 7, useStock: false, stock: {}, mode: "standard" });
    if ("error" in r) throw new Error(r.error);
    expect(r.rows.every(x => x.pcs % 7 === 0)).toBe(true);
    const status = fillStatus(r.rows, 5000, 7);
    expect(["exact", "close"]).toContain(status.kind);
    const total = r.rows.reduce((s, x) => s + x.lf, 0);
    const long = r.rows.filter(x => x.g === "12+").reduce((s, x) => s + x.lf, 0) / total;
    expect(long).toBeGreaterThan(0.45);
    expect(long).toBeLessThan(0.55);
  });
  it("never uses more than the stock on hand", () => {
    const stock: Record<number, number> = { ...stockAll(0), 8: 70, 12: 140, 16: 35 };
    const r = allocateTally({ orderLF: 4000, pack: 7, useStock: true, stock, mode: "stock" });
    if ("error" in r) throw new Error(r.error);
    for (const row of r.rows) expect(row.pcs).toBeLessThanOrEqual(stock[row.ft] ?? 0);
    expect(fillStatus(r.rows, 4000, 7).kind).toBe("short");
  });
  it("only uses the chosen lengths in custom mode", () => {
    const r = allocateTally({ orderLF: 2000, pack: 7, useStock: false, stock: {}, mode: "custom", customBase: "standard", allowed: [8, 12] });
    if ("error" in r) throw new Error(r.error);
    expect(r.rows.filter(x => x.pcs > 0).map(x => x.ft).sort((a, b) => a - b)).toEqual([8, 12]);
  });
  it("explains what's missing", () => {
    expect(allocateTally({ orderLF: 0, pack: 7, useStock: false, stock: {}, mode: "standard" })).toEqual({ error: "order" });
    expect(allocateTally({ orderLF: 100, pack: 7, useStock: true, stock: {}, mode: "stock" })).toEqual({ error: "noStock" });
    expect(allocateTally({ orderLF: 100, pack: 7, useStock: false, stock: {}, mode: "manual", manual: { "4-5": 0.5, "6-11": 0.2, "12+": 0.1 } })).toEqual({ error: "mix" });
  });
});
