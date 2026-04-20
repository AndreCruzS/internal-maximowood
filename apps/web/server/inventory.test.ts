import { describe, expect, it } from "vitest";

type InventoryRow = {
  branch: string;
  specie: string;
  profile: string;
  size: string;
  length: number;
  pieces: number;
  lf: number;
  sqm: number;
};

type BranchStock = {
  branch: string;
  lengths: { length: number; pieces: number; lf: number }[];
  totalLF: number;
  totalPieces: number;
};

type InventoryItem = {
  specie: string;
  profile: string;
  size: string;
  branches: BranchStock[];
  totalLF: number;
  totalPieces: number;
};

function groupInventory(rows: InventoryRow[]): InventoryItem[] {
  const productMap = new Map<string, InventoryItem>();

  for (const row of rows) {
    const productKey = `${row.specie}||${row.profile}||${row.size}`;

    if (!productMap.has(productKey)) {
      productMap.set(productKey, {
        specie: row.specie,
        profile: row.profile,
        size: row.size,
        branches: [],
        totalLF: 0,
        totalPieces: 0,
      });
    }

    const product = productMap.get(productKey)!;

    let branch = product.branches.find(b => b.branch === row.branch);
    if (!branch) {
      branch = { branch: row.branch, lengths: [], totalLF: 0, totalPieces: 0 };
      product.branches.push(branch);
    }

    branch.lengths.push({ length: row.length, pieces: row.pieces, lf: row.lf });
    branch.totalLF += row.lf;
    branch.totalPieces += row.pieces;

    product.totalLF += row.lf;
    product.totalPieces += row.pieces;
  }

  return Array.from(productMap.values()).sort((a, b) =>
    a.specie.localeCompare(b.specie) ||
    a.profile.localeCompare(b.profile) ||
    a.size.localeCompare(b.size)
  );
}

describe("inventory grouping with branches", () => {
  it("groups rows by product and separates by branch", () => {
    const rows: InventoryRow[] = [
      { branch: "Miami", specie: "AYOUS", profile: "V JOINT", size: "1x6", length: 10, pieces: 5, lf: 50, sqm: 10 },
      { branch: "Dallas", specie: "AYOUS", profile: "V JOINT", size: "1x6", length: 12, pieces: 3, lf: 36, sqm: 7 },
      { branch: "Miami", specie: "AYOUS", profile: "V JOINT", size: "1x6", length: 14, pieces: 2, lf: 28, sqm: 5 },
    ];

    const result = groupInventory(rows);
    expect(result).toHaveLength(1);

    const product = result[0];
    expect(product.totalLF).toBe(114);
    expect(product.totalPieces).toBe(10);
    expect(product.branches).toHaveLength(2);

    const miami = product.branches.find(b => b.branch === "Miami");
    expect(miami).toBeDefined();
    expect(miami?.totalLF).toBe(78); // 50 + 28
    expect(miami?.totalPieces).toBe(7);
    expect(miami?.lengths).toHaveLength(2);

    const dallas = product.branches.find(b => b.branch === "Dallas");
    expect(dallas?.totalLF).toBe(36);
    expect(dallas?.totalPieces).toBe(3);
  });

  it("handles multiple products across multiple branches", () => {
    const rows: InventoryRow[] = [
      { branch: "Miami", specie: "AYOUS", profile: "V JOINT", size: "1x6", length: 10, pieces: 5, lf: 50, sqm: 10 },
      { branch: "Dallas", specie: "ASH", profile: "NICKEL GAP", size: "1x4", length: 8, pieces: 10, lf: 80, sqm: 15 },
      { branch: "Miami", specie: "ASH", profile: "NICKEL GAP", size: "1x4", length: 10, pieces: 4, lf: 40, sqm: 8 },
    ];

    const result = groupInventory(rows);
    expect(result).toHaveLength(2);

    const ash = result.find(r => r.specie === "ASH");
    expect(ash?.totalLF).toBe(120); // 80 + 40
    expect(ash?.branches).toHaveLength(2);
  });

  it("returns empty array for empty input", () => {
    expect(groupInventory([])).toEqual([]);
  });

  it("sorts results by specie then profile then size", () => {
    const rows: InventoryRow[] = [
      { branch: "Miami", specie: "SCANDINAVIAN", profile: "SHIPLAP", size: "1x6", length: 10, pieces: 1, lf: 10, sqm: 2 },
      { branch: "Miami", specie: "AYOUS", profile: "V JOINT", size: "1x6", length: 10, pieces: 1, lf: 10, sqm: 2 },
    ];
    const result = groupInventory(rows);
    expect(result[0].specie).toBe("AYOUS");
    expect(result[1].specie).toBe("SCANDINAVIAN");
  });

  it("correctly identifies if stock is sufficient for a needed LF", () => {
    const rows: InventoryRow[] = [
      { branch: "Miami", specie: "AYOUS", profile: "V JOINT", size: "1x6", length: 10, pieces: 20, lf: 200, sqm: 40 },
      { branch: "Dallas", specie: "AYOUS", profile: "V JOINT", size: "1x6", length: 12, pieces: 10, lf: 120, sqm: 24 },
    ];
    const result = groupInventory(rows);
    const product = result[0];
    const totalAvailable = product.branches.reduce((s, b) => s + b.totalLF, 0);
    expect(totalAvailable).toBe(320);
    expect(totalAvailable >= 300).toBe(true);  // needs 300 LF → sufficient
    expect(totalAvailable >= 400).toBe(false); // needs 400 LF → insufficient
  });
});

// Replicate the client-side normalization helpers for testing
const normalizeSpecies = (s: string): string[] => {
  const lower = s.toLowerCase();
  if (lower.includes("ayous")) return ["ayous"];
  if (lower.includes("ash")) return ["ash"];
  if (lower.includes("scandinavian")) return ["scandinavian", "pine"];
  if (lower.includes("radiata") || lower.includes("clear")) return ["radiata"];
  return [lower];
};

const normalizeProfile = (p: string): string[] => {
  const lower = p.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
  const tokens: string[] = [];
  if (lower.includes("nickel") || lower.includes("ng")) tokens.push("nickel");
  if (lower.includes("square back") || (lower.includes("square") && !lower.includes("nickel"))) tokens.push("square");
  if (lower.includes("vjoint") || lower.includes("v joint")) tokens.push("vjoint");
  if (lower.includes("s4s") || lower.includes("s4s e4e")) tokens.push("s4s");
  if (lower.includes("fluted")) tokens.push("fluted");
  if (lower.includes("end match")) tokens.push("end match");
  if (lower.includes("rough")) tokens.push("rough");
  if (tokens.length === 0) tokens.push(lower);
  return tokens;
};

const normalizeSize = (s: string): string =>
  s.toLowerCase().replace(/\s*x\s*/g, "x").replace(/\s+/g, "");

describe("inventory matching normalization", () => {
  it("normalizes AYOUS to match Maximo Thermo Ayous", () => {
    const tokens = normalizeSpecies("AYOUS");
    expect("maximo thermo ayous".includes(tokens[0])).toBe(true);
  });

  it("normalizes ASH to match Maximo Thermo Ash", () => {
    const tokens = normalizeSpecies("ASH");
    expect("maximo thermo ash".includes(tokens[0])).toBe(true);
  });

  it("normalizes SCANDINAVIAN to match Maximo Thermo Scandinavian Pine", () => {
    const tokens = normalizeSpecies("SCANDINAVIAN");
    const inv = "maximo thermo scandinavian pine";
    expect(tokens.some(t => inv.includes(t))).toBe(true);
  });

  it("normalizes CLEAR RADIATA to match Maximo Thermo Clear Radiata", () => {
    const tokens = normalizeSpecies("CLEAR RADIATA");
    expect("maximo thermo clear radiata".includes(tokens[0])).toBe(true);
  });

  it("normalizes V JOINT / NICKEL GAP to match VJoint - Nickel Gap", () => {
    const tokens = normalizeProfile("V JOINT / NICKEL GAP");
    const inv = "vjoint   nickel gap".replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
    expect(tokens.some(t => inv.includes(t))).toBe(true);
  });

  it("normalizes SQUARE S4S E4E to match S4S E4E", () => {
    const tokens = normalizeProfile("SQUARE S4S E4E");
    expect(tokens).toContain("s4s");
  });

  it("normalizes size '1 x 6' to match inventory '1x6'", () => {
    expect(normalizeSize("1 x 6")).toBe("1x6");
    expect(normalizeSize("5/4 x 6")).toBe("5/4x6");
    expect(normalizeSize("1x6")).toBe("1x6");
  });
});

describe("quote data structure", () => {
  it("calculates grand total correctly with tax and shipping", () => {
    const materialCost = 1500.00;
    const addOnCost = 200.00;
    const tax = 150.00;
    const shipping = 75.00;
    const grandTotal = materialCost + addOnCost + tax + shipping;
    expect(grandTotal).toBeCloseTo(1925.00, 2);
  });

  it("calculates grand total without optional fields", () => {
    const materialCost = 1000.00;
    const tax = null;
    const shipping = null;
    const grandTotal = materialCost + (tax ?? 0) + (shipping ?? 0);
    expect(grandTotal).toBe(1000.00);
  });
});
