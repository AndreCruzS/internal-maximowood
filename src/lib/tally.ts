/**
 * Ayous tally: split a customer order (in real LF) into whole packs per length,
 * following stock, the standard 5/45/50 mix, or a manual mix.
 * Ported from the "Maximo Thermo Ayous tally calculator" sheet. Pieces are billed
 * at their real length (each nominal foot is 300 mm — see realLengths.ts).
 */
import { realFt } from "@/lib/realLengths";

export const TALLY_LENGTHS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16] as const;
export type TallyGroup = "4-5" | "6-11" | "12+";
export const TALLY_GROUPS: Record<TallyGroup, number[]> = { "4-5": [4, 5], "6-11": [6, 7, 8, 9, 10, 11], "12+": [12, 13, 14, 15, 16] };
export const GROUP_IDS = Object.keys(TALLY_GROUPS) as TallyGroup[];
export const STANDARD_MIX: Record<TallyGroup, number> = { "4-5": 0.05, "6-11": 0.45, "12+": 0.5 };

/** Real piece lengths in inches, as on the tally sheet (= realInches(ft, "AYOUS") to 6 decimals). */
const LEN_IN: Record<number, number> = {
  4: 47.244094, 5: 59.055118, 6: 70.866142, 7: 82.677165, 8: 94.488189, 9: 106.299213, 10: 118.110236,
  11: 129.92126, 12: 141.732283, 13: 153.543307, 14: 165.354331, 15: 177.165354, 16: 188.976378,
};
/** Real LF of one Ayous piece sold as `ft`. */
export const pieceLF = (ft: number) => (LEN_IN[ft] ?? realFt(ft, "AYOUS") * 12) / 12;
export const groupOf = (ft: number): TallyGroup => GROUP_IDS.find(g => TALLY_GROUPS[g].includes(ft))!;

export type TallyMode = "stock" | "standard" | "manual" | "custom";
export type TallyRow = { ft: number; g: TallyGroup; pcs: number; lf: number; stockPcs: number };
export type TallyInput = {
  orderLF: number;
  pack: number;
  useStock: boolean;
  stock: Record<number, number>;
  mode: TallyMode;
  /** For "custom": which mix to start from. */
  customBase?: "standard" | "stock" | "manual";
  /** Manual mix as fractions (must add up to 1). */
  manual?: Record<TallyGroup, number>;
  /** For "custom": the lengths that may be used. */
  allowed?: number[];
};
export type TallyError = "order" | "mix" | "lengths" | "noStock" | "noUsable";

export function allocateTally(input: TallyInput): { rows: TallyRow[]; target: Record<TallyGroup, number> } | { error: TallyError } {
  const { orderLF, useStock, stock } = input;
  const pack = input.pack > 0 ? Math.floor(input.pack) : 7;
  if (!(orderLF > 0)) return { error: "order" };
  const base = input.mode === "custom" ? input.customBase ?? "standard" : input.mode;
  let mix: Record<TallyGroup, number> | null = null;
  if (base === "standard") mix = { ...STANDARD_MIX };
  if (base === "manual") {
    const m = input.manual ?? STANDARD_MIX;
    if (Math.abs(m["4-5"] + m["6-11"] + m["12+"] - 1) > 0.01) return { error: "mix" };
    mix = { ...m };
  }
  const allowed = new Set<number>(input.mode === "custom" ? input.allowed ?? [] : TALLY_LENGTHS);
  if (allowed.size === 0) return { error: "lengths" };

  const lf = pieceLF;
  const have = (ft: number) => stock[ft] ?? 0;
  const maxPcs: Record<number, number> = {};
  const stockLF: Record<number, number> = {};
  let totalStockLF = 0;
  for (const ft of TALLY_LENGTHS) {
    maxPcs[ft] = !allowed.has(ft) ? 0 : useStock ? have(ft) : Infinity;
    stockLF[ft] = allowed.has(ft) ? have(ft) * lf(ft) : 0;
    totalStockLF += stockLF[ft];
  }
  const groupStockLF = (g: TallyGroup) => TALLY_GROUPS[g].reduce((s, ft) => s + stockLF[ft], 0);
  const weightOf = (ft: number) => (!allowed.has(ft) ? 0 : useStock ? stockLF[ft] : lf(ft));

  const target = {} as Record<TallyGroup, number>;
  if (base === "stock") {
    if (totalStockLF === 0) return { error: "noStock" };
    for (const g of GROUP_IDS) target[g] = groupStockLF(g) / totalStockLF;
  } else Object.assign(target, mix);
  let shareSum = 0;
  for (const g of GROUP_IDS) {
    const usable = TALLY_GROUPS[g].some(ft => allowed.has(ft) && (!useStock || have(ft) > 0));
    if (!usable) target[g] = 0;
    shareSum += target[g];
  }
  if (shareSum <= 0) return { error: "noUsable" };
  for (const g of GROUP_IDS) target[g] /= shareSum;

  // Pass 1: proportional allocation in whole packs, short groups carry over to the next.
  const rows: TallyRow[] = [];
  let carry = 0;
  for (const g of GROUP_IDS) {
    const fts = TALLY_GROUPS[g];
    const groupTarget = orderLF * target[g] + carry;
    let alloc = 0;
    fts.forEach((ft, idx) => {
      const remaining = groupTarget - alloc;
      if (remaining <= 0 || maxPcs[ft] <= 0) return rows.push({ ft, g, pcs: 0, lf: 0, stockPcs: have(ft) });
      const remainWeight = fts.slice(idx).reduce((s, f) => s + weightOf(f), 0);
      const want = idx === fts.length - 1 || remainWeight <= 0 ? remaining / lf(ft) : (remaining * weightOf(ft)) / remainWeight / lf(ft);
      const pcs = Math.min(Math.floor(want / pack) * pack, maxPcs[ft]);
      alloc += pcs * lf(ft);
      rows.push({ ft, g, pcs, lf: pcs * lf(ft), stockPcs: have(ft) });
    });
    carry = Math.max(0, groupTarget - alloc);
  }
  const total = () => rows.reduce((s, r) => s + r.lf, 0);
  const groupLF = (g: TallyGroup) => rows.filter(r => r.g === g).reduce((s, r) => s + r.lf, 0);

  // Pass 2: fill the gap pack by pack where it doesn't overshoot, favouring the group furthest below its share.
  let gap = orderLF - total();
  const eligible = (g: TallyGroup | null) => rows.filter(r => (!g || r.g === g) && pack * lf(r.ft) <= gap + 0.001 && r.pcs + pack <= maxPcs[r.ft]);
  for (let i = 0; i < 4000; i++) {
    const all = eligible(null);
    if (!all.length || gap < Math.min(...all.map(r => pack * lf(r.ft))) - 0.001) break;
    const projected = total() + gap;
    let best = all[0].g;
    let bestDeficit = -Infinity;
    for (const g of new Set(all.map(r => r.g))) {
      const d = target[g] * projected - groupLF(g);
      if (d > bestDeficit) { bestDeficit = d; best = g; }
    }
    const gRows = eligible(best);
    if (!gRows.length) break;
    const gStock = groupStockLF(best);
    const gTarget = target[best] * projected;
    const share = (r: TallyRow) => (gStock > 0 ? stockLF[r.ft] / gStock : 1);
    gRows.sort((a, b) => share(b) * gTarget - b.lf - (share(a) * gTarget - a.lf));
    const pick = gRows[0];
    pick.pcs += pack;
    pick.lf += pack * lf(pick.ft);
    gap -= pack * lf(pick.ft);
  }

  // Pass 3: local search (add / remove / swap a pack) to land as close to the order as possible.
  // Shipping short costs twice as much as shipping over; a small mix term keeps the proportions.
  const MIX_W = orderLF * 0.04;
  const cost = (T: number, mixErr: number) => (T < orderLF - 1e-6 ? (orderLF - T) * 2 : T - orderLF) + MIX_W * mixErr;
  const trial = (delta: number, addFt?: number, remFt?: number) => {
    const T = total() + delta;
    const ga = Object.fromEntries(GROUP_IDS.map(g => [g, groupLF(g)])) as Record<TallyGroup, number>;
    if (remFt !== undefined) ga[groupOf(remFt)] -= pack * lf(remFt);
    if (addFt !== undefined) ga[groupOf(addFt)] += pack * lf(addFt);
    const tt = T || 1;
    return cost(T, GROUP_IDS.reduce((e, g) => e + Math.abs(ga[g] / tt - target[g]), 0));
  };
  for (let guard = 0; guard < 1000; guard++) {
    let bestC = trial(0);
    let best: { ft: number; d: number }[] | null = null;
    for (const r of rows) {
      if (r.pcs + pack <= maxPcs[r.ft]) { const c = trial(pack * lf(r.ft), r.ft); if (c < bestC - 1e-9) { bestC = c; best = [{ ft: r.ft, d: 1 }]; } }
    }
    for (const r of rows) {
      if (r.pcs - pack >= 0) { const c = trial(-pack * lf(r.ft), undefined, r.ft); if (c < bestC - 1e-9) { bestC = c; best = [{ ft: r.ft, d: -1 }]; } }
    }
    for (const a of rows) {
      if (a.pcs - pack < 0) continue;
      for (const b of rows) {
        if (b.ft === a.ft || b.pcs + pack > maxPcs[b.ft]) continue;
        const c = trial(pack * lf(b.ft) - pack * lf(a.ft), b.ft, a.ft);
        if (c < bestC - 1e-9) { bestC = c; best = [{ ft: a.ft, d: -1 }, { ft: b.ft, d: 1 }]; }
      }
    }
    if (!best) break;
    for (const m of best) {
      const r = rows.find(x => x.ft === m.ft)!;
      r.pcs += m.d * pack;
      r.lf = r.pcs * lf(r.ft);
    }
  }
  return { rows, target };
}

export type FillStatus = { kind: "exact" | "close" | "short" | "over"; gap: number; pct: number };

/** How close the allocation is to the order; within one pack of the smallest piece counts as "close". */
export function fillStatus(rows: TallyRow[], orderLF: number, pack: number): FillStatus {
  const total = rows.reduce((s, r) => s + r.lf, 0);
  const gap = orderLF - total;
  const pct = orderLF > 0 ? (total / orderLF) * 100 : 0;
  if (Math.abs(gap) < 0.5) return { kind: "exact", gap, pct };
  if (Math.abs(gap) < pack * pieceLF(4)) return { kind: "close", gap, pct };
  return { kind: gap > 0 ? "short" : "over", gap, pct };
}
