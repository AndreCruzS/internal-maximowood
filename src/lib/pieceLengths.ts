/**
 * Fixed-length piece counts: cover `neededLF` with the chosen lengths as
 * evenly as possible and with the least extra LF.
 *
 * Every length gets the same base count (floor of neededLF / sum of lengths);
 * the remainder is covered by one extra piece of the combination of lengths
 * that overshoots it the least (ties: fewer pieces). So counts differ by at
 * most one between lengths. E.g. 250.95 LF over 7', 8', 9', 10', 12', 14', 16'
 * → 3 of each (228 LF) + one extra 9' and 14' (23 LF) = 23 pieces, 251 LF.
 */

export type PieceLengthResult = {
  selectedLengths: number[];
  /** Base count every length gets; some lengths get one more (see breakdown). */
  piecesEach: number;
  totalPieces: number;
  actualLF: number;
  breakdown: { length: number; pieces: number; lf: number }[];
};

// Exhaustive search is 2^n subsets; above this many lengths, fall back to greedy.
const MAX_EXACT_LENGTHS = 16;
const EPS = 1e-9;

/** Indexes of `lengths` (one piece each) whose sum covers `remainder` with the least overshoot. */
function extraPieces(lengths: number[], remainder: number): number[] {
  if (remainder <= EPS) return [];
  const n = lengths.length;
  if (n > MAX_EXACT_LENGTHS) {
    // Greedy: longest first until covered.
    const order = lengths.map((_, i) => i).sort((a, b) => lengths[b] - lengths[a]);
    const picked: number[] = [];
    let sum = 0;
    for (const i of order) {
      if (sum >= remainder - EPS) break;
      picked.push(i);
      sum += lengths[i];
    }
    return picked;
  }
  let best: number[] = [];
  let bestOver = Infinity;
  for (let mask = 1; mask < 1 << n; mask++) {
    let sum = 0;
    const picked: number[] = [];
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) {
        sum += lengths[i];
        picked.push(i);
      }
    }
    if (sum < remainder - EPS) continue;
    const over = sum - remainder;
    if (over < bestOver - EPS || (Math.abs(over - bestOver) <= EPS && picked.length < best.length)) {
      best = picked;
      bestOver = over;
    }
  }
  return best;
}

export function distributePieces(neededLF: number, selectedLengths: number[]): PieceLengthResult | null {
  const lengths = selectedLengths.filter(l => l > 0);
  if (lengths.length === 0 || !(neededLF > 0)) return null;
  const sum = lengths.reduce((a, b) => a + b, 0);
  const base = Math.floor(neededLF / sum + EPS);
  const extra = new Set(extraPieces(lengths, neededLF - base * sum));
  const breakdown = lengths.map((length, i) => {
    const pieces = base + (extra.has(i) ? 1 : 0);
    return { length, pieces, lf: pieces * length };
  });
  return {
    selectedLengths: lengths,
    piecesEach: base,
    totalPieces: breakdown.reduce((s, r) => s + r.pieces, 0),
    actualLF: breakdown.reduce((s, r) => s + r.lf, 0),
    breakdown,
  };
}
