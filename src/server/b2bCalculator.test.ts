import { describe, it, expect } from "vitest";

// ── Inline the B2B matching helpers (same logic as B2BCalculator.tsx) ─────────

type PricingRow = {
  category: string;
  species: string;
  application: string;
  profile: string;
  nominalSize: string;
  length: string;
  exposedFace: string;
  piecesPerPkg: string;
  priceDistributor: number | null;
  priceDistributorFixed: number | null;
  priceDealer: number | null;
  priceDealerFixed: number | null;
  priceEndCustomer: number | null;
  priceEndCustomerFixed: number | null;
};

type B2BTier = "distributor" | "dealer";
type LengthType = "RL" | "Fixed";

function normalizeStr(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
}

function matchPricingRow(
  rows: PricingRow[],
  species: string,
  nominalSize: string,
  profile: string,
  tier: B2BTier,
  lengthType: LengthType
): number | null {
  const normSpecies = normalizeStr(species);
  const normSize = normalizeStr(nominalSize);
  const normProfile = normalizeStr(profile);

  let best: { score: number; row: PricingRow } | null = null;

  for (const row of rows) {
    if (row.category !== "THERMO") continue;

    const rSpecies = normalizeStr(row.species);
    const rSize = normalizeStr(row.nominalSize);
    const rProfile = normalizeStr(row.profile);

    let score = 0;

    if (rSpecies.includes(normSpecies) || normSpecies.includes(rSpecies)) score += 3;
    else continue;

    const sizeTokens = normSize.split(" ").filter(Boolean);
    const rSizeTokens = rSize.split(" ").filter(Boolean);
    const sizeMatch = sizeTokens.every((t) => rSizeTokens.some((rt) => rt.includes(t) || t.includes(rt)));
    if (sizeMatch) score += 3;
    else continue;

    const profTokens = normProfile.split(" ").filter(Boolean);
    const rProfTokens = rProfile.split(" ").filter(Boolean);
    const shared = profTokens.filter((t) => rProfTokens.some((rt) => rt.includes(t) || t.includes(rt)));
    score += shared.length;

    if (!best || score > best.score) best = { score, row };
  }

  if (!best) return null;

  const row = best.row;
  if (tier === "distributor") {
    return lengthType === "RL" ? row.priceDistributor : row.priceDistributorFixed;
  } else {
    return lengthType === "RL" ? row.priceDealer : row.priceDealerFixed;
  }
}

function getB2BSpecies(rows: PricingRow[]): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    if (r.category === "THERMO") set.add(r.species);
  }
  return Array.from(set);
}

function getB2BSizes(rows: PricingRow[], species: string): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    if (r.category === "THERMO" && r.species === species) set.add(r.nominalSize);
  }
  return Array.from(set);
}

function getB2BProfiles(rows: PricingRow[], species: string, nominalSize: string): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    if (r.category === "THERMO" && r.species === species && r.nominalSize === nominalSize) {
      set.add(r.profile);
    }
  }
  return Array.from(set);
}

// ── Sample pricing data (mimics Google Sheet structure) ───────────────────────
const SAMPLE_ROWS: PricingRow[] = [
  {
    category: "THERMO",
    species: "Maximo Thermo Ayous",
    application: "Cladding",
    profile: "Square S4S E4E",
    nominalSize: "1x4",
    length: "4'-14'",
    exposedFace: '3.62"',
    piecesPerPkg: "10",
    priceDistributor: 2.10,
    priceDistributorFixed: 2.63,
    priceDealer: 2.58,
    priceDealerFixed: 3.23,
    priceEndCustomer: 2.96,
    priceEndCustomerFixed: 3.70,
  },
  {
    category: "THERMO",
    species: "Maximo Thermo Ayous",
    application: "Cladding",
    profile: "VJoint - Nickel Gap",
    nominalSize: "1x6",
    length: "4'-14'",
    exposedFace: '5.26"',
    piecesPerPkg: "8",
    priceDistributor: 3.29,
    priceDistributorFixed: 4.11,
    priceDealer: 4.05,
    priceDealerFixed: 5.06,
    priceEndCustomer: 4.63,
    priceEndCustomerFixed: 5.79,
  },
  {
    category: "HARDWOOD",
    species: "Oak",
    application: "Flooring",
    profile: "Tongue and Groove",
    nominalSize: "3/4 x 3",
    length: "Random",
    exposedFace: '2.75"',
    piecesPerPkg: "20",
    priceDistributor: 5.00,
    priceDistributorFixed: 6.25,
    priceDealer: 6.15,
    priceDealerFixed: 7.69,
    priceEndCustomer: 7.00,
    priceEndCustomerFixed: 8.75,
  },
];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("B2B price matching", () => {
  it("returns distributor RL price for matching THERMO product", () => {
    const price = matchPricingRow(SAMPLE_ROWS, "Maximo Thermo Ayous", "1x4", "Square S4S E4E", "distributor", "RL");
    expect(price).toBe(2.10);
  });

  it("returns distributor Fixed price for matching THERMO product", () => {
    const price = matchPricingRow(SAMPLE_ROWS, "Maximo Thermo Ayous", "1x4", "Square S4S E4E", "distributor", "Fixed");
    expect(price).toBe(2.63);
  });

  it("returns dealer RL price for matching THERMO product", () => {
    const price = matchPricingRow(SAMPLE_ROWS, "Maximo Thermo Ayous", "1x6", "VJoint - Nickel Gap", "dealer", "RL");
    expect(price).toBe(4.05);
  });

  it("returns dealer Fixed price for matching THERMO product", () => {
    const price = matchPricingRow(SAMPLE_ROWS, "Maximo Thermo Ayous", "1x6", "VJoint - Nickel Gap", "dealer", "Fixed");
    expect(price).toBe(5.06);
  });

  it("returns null for non-THERMO category rows", () => {
    const price = matchPricingRow(SAMPLE_ROWS, "Oak", "3/4 x 3", "Tongue and Groove", "distributor", "RL");
    expect(price).toBeNull();
  });

  it("returns null when species does not match", () => {
    const price = matchPricingRow(SAMPLE_ROWS, "ASH", "1x4", "Square S4S E4E", "distributor", "RL");
    expect(price).toBeNull();
  });

  it("returns null when size does not match", () => {
    const price = matchPricingRow(SAMPLE_ROWS, "Maximo Thermo Ayous", "2x6", "Square S4S E4E", "distributor", "RL");
    expect(price).toBeNull();
  });

  it("distributor price is lower than dealer price", () => {
    const distPrice = matchPricingRow(SAMPLE_ROWS, "Maximo Thermo Ayous", "1x4", "Square S4S E4E", "distributor", "RL");
    const dealerPrice = matchPricingRow(SAMPLE_ROWS, "Maximo Thermo Ayous", "1x4", "Square S4S E4E", "dealer", "RL");
    expect(distPrice).not.toBeNull();
    expect(dealerPrice).not.toBeNull();
    expect(distPrice!).toBeLessThan(dealerPrice!);
  });

  it("fixed price is higher than RL price for distributor", () => {
    const rlPrice = matchPricingRow(SAMPLE_ROWS, "Maximo Thermo Ayous", "1x4", "Square S4S E4E", "distributor", "RL");
    const fixedPrice = matchPricingRow(SAMPLE_ROWS, "Maximo Thermo Ayous", "1x4", "Square S4S E4E", "distributor", "Fixed");
    expect(rlPrice).not.toBeNull();
    expect(fixedPrice).not.toBeNull();
    expect(fixedPrice!).toBeGreaterThan(rlPrice!);
  });
});

describe("B2B product list helpers", () => {
  it("getB2BSpecies returns only THERMO species", () => {
    const species = getB2BSpecies(SAMPLE_ROWS);
    expect(species).toContain("Maximo Thermo Ayous");
    expect(species).not.toContain("Oak"); // HARDWOOD excluded
    expect(species.length).toBe(1);
  });

  it("getB2BSizes returns sizes for a given species", () => {
    const sizes = getB2BSizes(SAMPLE_ROWS, "Maximo Thermo Ayous");
    expect(sizes).toContain("1x4");
    expect(sizes).toContain("1x6");
    expect(sizes.length).toBe(2);
  });

  it("getB2BProfiles returns profiles for species + size", () => {
    const profiles = getB2BProfiles(SAMPLE_ROWS, "Maximo Thermo Ayous", "1x6");
    expect(profiles).toContain("VJoint - Nickel Gap");
    expect(profiles.length).toBe(1);
  });

  it("getB2BSizes returns empty array for unknown species", () => {
    const sizes = getB2BSizes(SAMPLE_ROWS, "UNKNOWN");
    expect(sizes.length).toBe(0);
  });

  it("getB2BProfiles returns empty array for unknown size", () => {
    const profiles = getB2BProfiles(SAMPLE_ROWS, "Maximo Thermo Ayous", "99x99");
    expect(profiles.length).toBe(0);
  });
});

// ── Piece length calculation helper (mirrors Calculator.tsx logic) ─────────────

function calcPieceLengths(wastedLF: number, selectedLengths: number[]) {
  if (selectedLengths.length === 0) return null;
  const sumLengths = selectedLengths.reduce((a, b) => a + b, 0);
  const piecesEach = Math.ceil(wastedLF / sumLengths);
  const totalPieces = piecesEach * selectedLengths.length;
  const actualLF = piecesEach * sumLengths;
  const breakdown = selectedLengths.map(l => ({ length: l, pieces: piecesEach, lf: piecesEach * l }));
  return { selectedLengths, piecesEach, totalPieces, actualLF, breakdown };
}

describe("Piece length calculation", () => {
  it("returns null when no lengths selected", () => {
    expect(calcPieceLengths(500, [])).toBeNull();
  });

  it("single fixed length: 500 LF in 12ft boards = 42 pieces, 504 LF", () => {
    const result = calcPieceLengths(500, [12]);
    expect(result).not.toBeNull();
    expect(result!.piecesEach).toBe(42);
    expect(result!.totalPieces).toBe(42);
    expect(result!.actualLF).toBe(504);
  });

  it("single fixed length: 500 LF in 10ft boards = 50 pieces, 500 LF (exact)", () => {
    const result = calcPieceLengths(500, [10]);
    expect(result).not.toBeNull();
    expect(result!.piecesEach).toBe(50);
    expect(result!.totalPieces).toBe(50);
    expect(result!.actualLF).toBe(500);
  });

  it("multi-length: 500 LF with 7+8+9+10ft = 15 pieces each, 60 total, 510 LF", () => {
    const result = calcPieceLengths(500, [7, 8, 9, 10]);
    expect(result).not.toBeNull();
    expect(result!.piecesEach).toBe(15);
    expect(result!.totalPieces).toBe(60);
    expect(result!.actualLF).toBe(510);
  });

  it("multi-length: 500 LF with 8+10+12ft = 17 pieces each, 51 total, 510 LF", () => {
    const result = calcPieceLengths(500, [8, 10, 12]);
    expect(result).not.toBeNull();
    expect(result!.piecesEach).toBe(17);
    expect(result!.totalPieces).toBe(51);
    expect(result!.actualLF).toBe(510);
  });

  it("multi-length: 1000 LF with 7+8+9+10ft = 30 pieces each, 120 total, 1020 LF", () => {
    const result = calcPieceLengths(1000, [7, 8, 9, 10]);
    expect(result).not.toBeNull();
    expect(result!.piecesEach).toBe(30);
    expect(result!.totalPieces).toBe(120);
    expect(result!.actualLF).toBe(1020);
  });

  it("breakdown has correct per-length LF values", () => {
    const result = calcPieceLengths(500, [7, 8, 9, 10]);
    expect(result).not.toBeNull();
    const bd = result!.breakdown;
    expect(bd.find(r => r.length === 7)?.lf).toBe(105);  // 15 * 7
    expect(bd.find(r => r.length === 8)?.lf).toBe(120);  // 15 * 8
    expect(bd.find(r => r.length === 9)?.lf).toBe(135);  // 15 * 9
    expect(bd.find(r => r.length === 10)?.lf).toBe(150); // 15 * 10
  });

  it("actual LF is always >= wastedLF (never under-orders)", () => {
    for (const lengths of [[7,8,9,10], [12], [8,10,12], [14,16]]) {
      for (const lf of [100, 250, 500, 750, 1000]) {
        const result = calcPieceLengths(lf, lengths);
        expect(result!.actualLF).toBeGreaterThanOrEqual(lf);
      }
    }
  });

  it("250 LF with 14+16ft = 9 pieces each, 18 total, 270 LF", () => {
    const result = calcPieceLengths(250, [14, 16]);
    expect(result).not.toBeNull();
    expect(result!.piecesEach).toBe(9);
    expect(result!.totalPieces).toBe(18);
    expect(result!.actualLF).toBe(270);
  });
});
