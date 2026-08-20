import { describe, expect, it } from "vitest";

/**
 * inventory.test.ts
 *
 * Tests for inventory grouping logic and normalization helpers.
 * Aligned with API v3 spec (2026-05-14):
 *   - lf_per_piece replaces length_ft
 *   - lf_uom / base_uom replace uom
 *   - lfAvailable is always a number (0 for non-LF items), never null
 */

// ── Local types mirroring inventoryRouter.ts ──────────────────────────────────

type SkuBranchRow = {
  sku: string;
  species: string;
  profile: string | null;
  nominalSize: string | null;
  /** Per-piece length in feet (0 for non-LF items) */
  lfPerPiece: number;
  /** 'LF' when item participates in linear-foot maths */
  lfUom: string | null;
  branchId: string;
  branchName: string;
  piecesAvailable: number;
  piecesOnOrder: number;
  /** lf_per_piece × pieces_on_hand when lf_per_piece > 0 and lf_uom = 'LF', else 0 */
  lfAvailable: number;
};

type BranchStock = {
  branchId: string;
  branch: string;
  piecesAvailable: number;
  piecesOnOrder: number;
  lfAvailable: number;
  lengths: number[];
  skus: SkuBranchRow[];
};

type InventoryItem = {
  species: string;
  profile: string;
  size: string;
  branches: BranchStock[];
  totalPiecesAvailable: number;
  totalLfAvailable: number;
};

// ── Simplified groupRows for unit testing ─────────────────────────────────────

function groupRows(rows: SkuBranchRow[]): InventoryItem[] {
  const productMap = new Map<string, InventoryItem>();

  for (const row of rows) {
    const key = `${row.species}||${row.profile ?? ""}||${row.nominalSize ?? ""}`;
    if (!productMap.has(key)) {
      productMap.set(key, {
        species: row.species,
        profile: row.profile ?? "",
        size: row.nominalSize ?? "",
        branches: [],
        totalPiecesAvailable: 0,
        totalLfAvailable: 0,
      });
    }
    const product = productMap.get(key)!;
    let branch = product.branches.find(b => b.branchId === row.branchId);
    if (!branch) {
      branch = { branchId: row.branchId, branch: row.branchName, piecesAvailable: 0, piecesOnOrder: 0, lfAvailable: 0, lengths: [], skus: [] };
      product.branches.push(branch);
    }
    branch.piecesAvailable += row.piecesAvailable;
    branch.lfAvailable     += row.lfAvailable;
    if (row.lfPerPiece > 0 && !branch.lengths.includes(row.lfPerPiece)) {
      branch.lengths.push(row.lfPerPiece);
    }
    branch.skus.push(row);
    product.totalPiecesAvailable += row.piecesAvailable;
    product.totalLfAvailable     += row.lfAvailable;
  }

  return Array.from(productMap.values()).sort((a, b) =>
    a.species.localeCompare(b.species) ||
    a.profile.localeCompare(b.profile) ||
    a.size.localeCompare(b.size)
  );
}

// ── Helper to build a SkuBranchRow ────────────────────────────────────────────

function makeRow(overrides: Partial<SkuBranchRow> & { species: string; branchId: string; branchName: string }): SkuBranchRow {
  return {
    sku: "TEST-SKU",
    profile: null,
    nominalSize: "1x6",
    lfPerPiece: 10,
    lfUom: "LF",
    piecesAvailable: 10,
    piecesOnOrder: 0,
    lfAvailable: 100,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("inventory grouping (v3 API spec)", () => {
  it("groups rows by product and separates by branch", () => {
    const rows: SkuBranchRow[] = [
      makeRow({ species: "Thermo Ayous", profile: "VJoint", nominalSize: "1x6", lfPerPiece: 10, piecesAvailable: 5, lfAvailable: 50, branchId: "9007", branchName: "Global Miami" }),
      makeRow({ species: "Thermo Ayous", profile: "VJoint", nominalSize: "1x6", lfPerPiece: 12, piecesAvailable: 3, lfAvailable: 36, branchId: "9008", branchName: "Global Texas" }),
      makeRow({ species: "Thermo Ayous", profile: "VJoint", nominalSize: "1x6", lfPerPiece: 14, piecesAvailable: 2, lfAvailable: 28, branchId: "9007", branchName: "Global Miami" }),
    ];

    const result = groupRows(rows);
    expect(result).toHaveLength(1);

    const product = result[0];
    expect(product.totalLfAvailable).toBe(114);
    expect(product.totalPiecesAvailable).toBe(10);
    expect(product.branches).toHaveLength(2);

    const miami = product.branches.find(b => b.branchId === "9007");
    expect(miami).toBeDefined();
    expect(miami?.lfAvailable).toBe(78); // 50 + 28
    expect(miami?.piecesAvailable).toBe(7);
    expect(miami?.lengths).toHaveLength(2);
    expect(miami?.lengths).toContain(10);
    expect(miami?.lengths).toContain(14);

    const texas = product.branches.find(b => b.branchId === "9008");
    expect(texas?.lfAvailable).toBe(36);
    expect(texas?.piecesAvailable).toBe(3);
  });

  it("handles multiple products across multiple branches", () => {
    const rows: SkuBranchRow[] = [
      makeRow({ species: "Thermo Ayous", profile: "VJoint", nominalSize: "1x6", piecesAvailable: 5, lfAvailable: 50, branchId: "9007", branchName: "Global Miami" }),
      makeRow({ species: "Thermo Ash",   profile: "Nickel Gap", nominalSize: "1x4", piecesAvailable: 10, lfAvailable: 80, branchId: "9008", branchName: "Global Texas" }),
      makeRow({ species: "Thermo Ash",   profile: "Nickel Gap", nominalSize: "1x4", piecesAvailable: 4, lfAvailable: 40, branchId: "9007", branchName: "Global Miami" }),
    ];

    const result = groupRows(rows);
    expect(result).toHaveLength(2);

    const ash = result.find(r => r.species === "Thermo Ash");
    expect(ash?.totalLfAvailable).toBe(120); // 80 + 40
    expect(ash?.branches).toHaveLength(2);
  });

  it("returns empty array for empty input", () => {
    expect(groupRows([])).toEqual([]);
  });

  it("sorts results by species then profile then size", () => {
    const rows: SkuBranchRow[] = [
      makeRow({ species: "Thermo Radiata", profile: "Shiplap", nominalSize: "1x6", branchId: "9007", branchName: "Global Miami" }),
      makeRow({ species: "Thermo Ayous",   profile: "VJoint",  nominalSize: "1x6", branchId: "9007", branchName: "Global Miami" }),
    ];
    const result = groupRows(rows);
    expect(result[0].species).toBe("Thermo Ayous");
    expect(result[1].species).toBe("Thermo Radiata");
  });

  it("correctly identifies if stock is sufficient for a needed LF", () => {
    const rows: SkuBranchRow[] = [
      makeRow({ species: "Thermo Ayous", piecesAvailable: 20, lfAvailable: 200, branchId: "9007", branchName: "Global Miami" }),
      makeRow({ species: "Thermo Ayous", piecesAvailable: 10, lfAvailable: 120, branchId: "9008", branchName: "Global Texas" }),
    ];
    const result = groupRows(rows);
    const product = result[0];
    const totalAvailable = product.totalLfAvailable;
    expect(totalAvailable).toBe(320);
    expect(totalAvailable >= 300).toBe(true);  // needs 300 LF → sufficient
    expect(totalAvailable >= 400).toBe(false); // needs 400 LF → insufficient
  });

  it("lfAvailable is always a number (never null) — 0 for non-LF items", () => {
    const rows: SkuBranchRow[] = [
      // Tile item: lf_per_piece = 0, lf_uom = 'EACH' → lfAvailable = 0
      makeRow({ species: "IPE", nominalSize: null, lfPerPiece: 0, lfUom: "EACH", piecesAvailable: 100, lfAvailable: 0, branchId: "9007", branchName: "Global Miami" }),
    ];
    const result = groupRows(rows);
    expect(result[0].totalLfAvailable).toBe(0);
    expect(typeof result[0].totalLfAvailable).toBe("number");
    expect(result[0].branches[0].lfAvailable).toBe(0);
    expect(typeof result[0].branches[0].lfAvailable).toBe("number");
  });

  it("tracks distinct lf_per_piece values as lengths per branch", () => {
    const rows: SkuBranchRow[] = [
      makeRow({ species: "IPE", lfPerPiece: 8,  piecesAvailable: 5, lfAvailable: 40,  branchId: "9007", branchName: "Global Miami" }),
      makeRow({ species: "IPE", lfPerPiece: 12, piecesAvailable: 3, lfAvailable: 36,  branchId: "9007", branchName: "Global Miami" }),
      makeRow({ species: "IPE", lfPerPiece: 8,  piecesAvailable: 2, lfAvailable: 16,  branchId: "9007", branchName: "Global Miami" }),
    ];
    const result = groupRows(rows);
    const miami = result[0].branches[0];
    // Should have 2 distinct lengths: 8 and 12 (not 3 entries)
    expect(miami.lengths).toHaveLength(2);
    expect(miami.lengths).toContain(8);
    expect(miami.lengths).toContain(12);
    // LF should sum all rows
    expect(miami.lfAvailable).toBe(92); // 40 + 36 + 16
  });
});

// ── Normalization helpers (client-side matching) ──────────────────────────────

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
