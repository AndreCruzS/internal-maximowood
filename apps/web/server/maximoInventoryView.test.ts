// apps/web/server/maximoInventoryView.test.ts
import { describe, it, expect } from "vitest";
import { groupMaximoRows, type MaximoRow } from "./maximoInventoryView";

describe("groupMaximoRows", () => {
  it("groups rows by (species, profile, nominal_size) across branches", () => {
    const rows: MaximoRow[] = [
      {
        branch_name: "Global Miami",
        species: "IPE",
        nominal_size: "2x6",
        profile: "S4S E4E",
        lf_per_piece: 16,
        pieces_available: 10,
        lf_available: 160,
        last_updated: "2026-05-10T00:00:00Z",
      },
      {
        branch_name: "Global NY",
        species: "IPE",
        nominal_size: "2x6",
        profile: "S4S E4E",
        lf_per_piece: 14,
        pieces_available: 5,
        lf_available: 70,
        last_updated: "2026-05-11T00:00:00Z",
      },
      {
        branch_name: "Global Miami",
        species: "IPE",
        nominal_size: "2x6",
        profile: "S4S E4E",
        lf_per_piece: 12,
        pieces_available: 2,
        lf_available: 24,
        last_updated: "2026-05-09T00:00:00Z",
      },
    ];

    const result = groupMaximoRows(rows);

    expect(result.items).toHaveLength(1);
    const ipe = result.items[0];
    expect(ipe.specie).toBe("IPE");
    expect(ipe.profile).toBe("S4S E4E");
    expect(ipe.size).toBe("2x6");
    expect(ipe.totalLF).toBe(254); // 160 + 70 + 24

    expect(ipe.branches).toHaveLength(2);
    const miami = ipe.branches.find(b => b.branch === "Global Miami");
    expect(miami?.totalLF).toBe(184); // 160 + 24
    expect(miami?.lengths).toEqual([
      { lengthFt: 16, pieces: 10, stockLf: 160 },
      { lengthFt: 12, pieces: 2, stockLf: 24 },
    ]);

    expect(result.species).toEqual(["IPE"]);
    expect(result.branches).toEqual(["Global Miami", "Global NY"]);
    expect(result.lastUpdated).toEqual(new Date("2026-05-11T00:00:00Z"));
  });

  it("treats null profile and null nominal_size as empty-string keys", () => {
    const rows: MaximoRow[] = [
      {
        branch_name: "Global Miami",
        species: "IPE",
        nominal_size: null,
        profile: null,
        lf_per_piece: 0,
        pieces_available: 100,
        lf_available: 0,
        last_updated: "2026-05-10T00:00:00Z",
      },
    ];
    const result = groupMaximoRows(rows);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].profile).toBe("");
    expect(result.items[0].size).toBe("");
  });

  it("returns empty arrays and null lastUpdated for empty input", () => {
    const result = groupMaximoRows([]);
    expect(result.items).toEqual([]);
    expect(result.species).toEqual([]);
    expect(result.branches).toEqual([]);
    expect(result.lastUpdated).toBeNull();
  });

  it("sorts items by species, then profile, then size", () => {
    const rows: MaximoRow[] = [
      {
        branch_name: "Global Miami",
        species: "CUMARU",
        nominal_size: "2x6",
        profile: "S4S E4E",
        lf_per_piece: 16,
        pieces_available: 1,
        lf_available: 16,
        last_updated: "2026-05-10T00:00:00Z",
      },
      {
        branch_name: "Global Miami",
        species: "ANGELIM",
        nominal_size: "2x6",
        profile: "S4S E4E",
        lf_per_piece: 16,
        pieces_available: 1,
        lf_available: 16,
        last_updated: "2026-05-10T00:00:00Z",
      },
    ];
    const result = groupMaximoRows(rows);
    expect(result.items.map(i => i.specie)).toEqual(["ANGELIM", "CUMARU"]);
  });
});
