// apps/web/server/maximoInventoryView.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { groupMaximoRows, fetchMaximoInventory, type MaximoRow } from "./maximoInventoryView";

describe("groupMaximoRows", () => {
  it("groups rows by (species, profile, nominal_size) across branches", () => {
    const rows: MaximoRow[] = [
      {
        branch_name: "Global Miami",
        species: "IPE",
        category: "Hardwoods",
        nominal_size: "2x6",
        profile: "S4S E4E",
        description: null,
        lf_per_piece: 16,
        pieces_available: 10,
        lf_available: 160,
        last_updated: "2026-05-10T00:00:00Z",
      },
      {
        branch_name: "Global NY",
        species: "IPE",
        category: "Hardwoods",
        nominal_size: "2x6",
        profile: "S4S E4E",
        description: null,
        lf_per_piece: 14,
        pieces_available: 5,
        lf_available: 70,
        last_updated: "2026-05-11T00:00:00Z",
      },
      {
        branch_name: "Global Miami",
        species: "IPE",
        category: "Hardwoods",
        nominal_size: "2x6",
        profile: "S4S E4E",
        description: null,
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
    expect(result.categories).toEqual(["Hardwoods"]);
    expect(result.profiles).toEqual(["S4S E4E"]);
    expect(result.sizes).toEqual(["2x6"]);
    expect(result.items[0].category).toBe("Hardwoods");
    expect(result.lastUpdated).toEqual(new Date("2026-05-11T00:00:00Z"));
  });

  it("treats null profile and null nominal_size as empty-string keys", () => {
    const rows: MaximoRow[] = [
      {
        branch_name: "Global Miami",
        species: "IPE",
        category: "Hardwoods",
        nominal_size: null,
        profile: null,
        description: null,
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
    expect(result.categories).toEqual([]);
    expect(result.models).toEqual([]);
    expect(result.profiles).toEqual([]);
    expect(result.sizes).toEqual([]);
    expect(result.branches).toEqual([]);
    expect(result.lastUpdated).toBeNull();
  });

  it("sorts items by specie, then model, then profile, then size", () => {
    const rows: MaximoRow[] = [
      {
        branch_name: "Global Miami",
        species: "CUMARU",
        category: "Hardwoods",
        nominal_size: "2x6",
        profile: "S4S E4E",
        description: null,
        lf_per_piece: 16,
        pieces_available: 1,
        lf_available: 16,
        last_updated: "2026-05-10T00:00:00Z",
      },
      {
        branch_name: "Global Miami",
        species: "ANGELIM",
        category: "Hardwoods",
        nominal_size: "2x6",
        profile: "S4S E4E",
        description: null,
        lf_per_piece: 16,
        pieces_available: 1,
        lf_available: 16,
        last_updated: "2026-05-10T00:00:00Z",
      },
    ];
    const result = groupMaximoRows(rows);
    expect(result.items.map(i => i.specie)).toEqual(["ANGELIM", "CUMARU"]);
  });

  it("falls back to length parsed from description when lf_per_piece is 0", () => {
    // Real-world case: Cumaru 6x8 beams have lf_per_piece=0 in the view
    // because Spruce's LFBFLength field is empty for those SKUs — but the
    // description clearly encodes the length ("Cumaru 6x8x16' (5.5\" x 7.25\")").
    // Without the fallback parser, these show 0 LF even though they're
    // proper 16ft lumber.
    const rows: MaximoRow[] = [
      {
        branch_name: "Global Miami",
        species: "Cumaru",
        category: "Hardwoods",
        nominal_size: "6x8",
        profile: "Square",
        description: "Cumaru 6x8x16' (5.5\" x  7.25\")",
        lf_per_piece: 0,
        pieces_available: 19,
        lf_available: 0,
        last_updated: "2026-05-10T00:00:00Z",
      },
    ];
    const result = groupMaximoRows(rows);
    expect(result.items).toHaveLength(1);
    const item = result.items[0];
    expect(item.totalLF).toBe(304); // 19 × 16
    expect(item.branches[0].lengths[0]).toEqual({
      lengthFt: 16,
      pieces: 19,
      stockLf: 304,
    });
  });

  it("does NOT fall back to description length for tile SKUs (inches only)", () => {
    // Tile descriptions like "Ipe Tiles 24\" x 24\"" use inches, not feet —
    // the parser only matches `'` (foot mark), so true tiles continue to
    // return lengthFt=null and stockLf=0.
    const rows: MaximoRow[] = [
      {
        branch_name: "Global Miami",
        species: "IPE",
        category: "Hardwoods",
        nominal_size: "",
        profile: "IPE Decking",
        description: "Brushed Ipe Tiles 24\" x 24\"",
        lf_per_piece: 0,
        pieces_available: 7455,
        lf_available: 0,
        last_updated: "2026-05-10T00:00:00Z",
      },
    ];
    const result = groupMaximoRows(rows);
    expect(result.items[0].totalLF).toBe(0);
    expect(result.items[0].branches[0].lengths[0]).toEqual({
      lengthFt: null,
      pieces: 7455,
      stockLf: 0,
    });
  });

  it("derives size from description when nominal_size is empty (tiles)", () => {
    // Real-world tile SKUs come back from the view with nominal_size = ''
    // and the size info only in the description. Without parsing, all tile
    // SKUs of the same species + profile collapse into one un-named group.
    const rows: MaximoRow[] = [
      {
        branch_name: "Global Miami",
        species: "IPE",
        category: "Hardwoods",
        nominal_size: "",
        profile: "IPE Decking",
        description: "Ipe Tiles 24\" x 24\"",
        lf_per_piece: 1,
        pieces_available: 30,
        lf_available: 30,
        last_updated: "2026-05-10T00:00:00Z",
      },
      {
        branch_name: "Global Miami",
        species: "IPE",
        category: "Hardwoods",
        nominal_size: null,
        profile: "IPE Decking",
        description: "Ipe Tiles 24\" x 96\"",
        lf_per_piece: 0,
        pieces_available: 5,
        lf_available: 0,
        last_updated: "2026-05-10T00:00:00Z",
      },
    ];
    const result = groupMaximoRows(rows);
    expect(result.items.map(i => i.size).sort()).toEqual(["24x24", "24x96"]);
  });

  it("collects distinct categories sorted alphabetically", () => {
    const rows: MaximoRow[] = [
      {
        branch_name: "Global Miami",
        species: "Thermo Pine",
        category: "Thermowood",
        nominal_size: "1x6",
        profile: "V Joint",
        description: null,
        lf_per_piece: 12,
        pieces_available: 5,
        lf_available: 60,
        last_updated: "2026-05-10T00:00:00Z",
      },
      {
        branch_name: "Global Miami",
        species: "IPE",
        category: "Hardwoods",
        nominal_size: "2x6",
        profile: "S4S E4E",
        description: null,
        lf_per_piece: 16,
        pieces_available: 1,
        lf_available: 16,
        last_updated: "2026-05-10T00:00:00Z",
      },
      {
        branch_name: "Global Miami",
        species: "Accoya",
        category: "Accoya",
        nominal_size: "1x6",
        profile: "Coated",
        description: null,
        lf_per_piece: 10,
        pieces_available: 2,
        lf_available: 20,
        last_updated: "2026-05-10T00:00:00Z",
      },
    ];
    const result = groupMaximoRows(rows);
    expect(result.categories).toEqual(["Accoya", "Hardwoods", "Thermowood"]);
  });

  it("groups by dictionary fields and sources LF from the view's lf column", () => {
    const rows: MaximoRow[] = [
      {
        branch_name: "Global Texas",
        species: "Thermo Ayous",
        category: "Thermowood",
        nominal_size: "1x6",
        profile: "S4S",
        description: null,
        lf_per_piece: 14,
        pieces_available: 160,
        lf_available: 2240,
        last_updated: "2026-05-10T00:00:00Z",
        specie: "Maximo Thermo Ayous",
        model: "Alfa Profile",
        profile_finish: "Groco Matte",
        size: "1x6",
        length_ft: 14,
        lf: 2240,
        is_unmapped: false,
      },
      {
        branch_name: "Global Texas",
        species: "Thermo Ayous",
        category: "Thermowood",
        nominal_size: "1x6",
        profile: "S4S",
        description: null,
        lf_per_piece: 16,
        pieces_available: 228,
        lf_available: 3648,
        last_updated: "2026-05-11T00:00:00Z",
        specie: "Maximo Thermo Ayous",
        model: "Alfa Profile",
        profile_finish: "Groco Matte",
        size: "1x6",
        length_ft: 16,
        lf: 3648,
        is_unmapped: false,
      },
    ];

    const result = groupMaximoRows(rows);

    expect(result.items).toHaveLength(1);
    const item = result.items[0];
    expect(item.specie).toBe("Maximo Thermo Ayous");
    expect(item.model).toBe("Alfa Profile");
    expect(item.profile).toBe("Groco Matte");
    expect(item.size).toBe("1x6");
    expect(item.isUnmapped).toBe(false);
    expect(item.totalLF).toBe(5888); // 2240 + 3648, taken straight from `lf`
    expect(item.branches[0].lengths).toEqual([
      { lengthFt: 14, pieces: 160, stockLf: 2240 },
      { lengthFt: 16, pieces: 228, stockLf: 3648 },
    ]);
    expect(result.models).toEqual(["Alfa Profile"]);
  });

  it("falls back to raw fields and flags isUnmapped when dictionary columns are null", () => {
    const rows: MaximoRow[] = [
      {
        branch_name: "Global Miami",
        species: "IPE",
        category: "Hardwoods",
        nominal_size: "2x6",
        profile: "S4S E4E",
        description: null,
        lf_per_piece: 16,
        pieces_available: 10,
        lf_available: 160,
        last_updated: "2026-05-10T00:00:00Z",
        specie: null,
        model: null,
        profile_finish: null,
        size: null,
        length_ft: null,
        lf: null,
        is_unmapped: true,
      },
    ];

    const result = groupMaximoRows(rows);
    const item = result.items[0];
    expect(item.specie).toBe("IPE");      // fell back to species
    expect(item.model).toBe("");
    expect(item.profile).toBe("S4S E4E"); // fell back to profile
    expect(item.size).toBe("2x6");        // fell back to nominal_size
    expect(item.isUnmapped).toBe(true);
    expect(item.totalLF).toBe(160);       // computed 16 × 10 because `lf` was null
    expect(item.branches[0].lengths).toEqual([
      { lengthFt: 16, pieces: 10, stockLf: 160 },
    ]);
    expect(result.models).toEqual([]);    // empty model filtered out
  });

  it("uses the view's lf for mapped tiles (lf = pieces, length null)", () => {
    const rows: MaximoRow[] = [
      {
        branch_name: "Global Miami",
        species: "IPE",
        category: "Hardwoods",
        nominal_size: "",
        profile: "IPE Decking",
        description: 'Ipe Tiles 24" x 24"',
        lf_per_piece: 0,
        pieces_available: 30,
        lf_available: 30,
        last_updated: "2026-05-10T00:00:00Z",
        specie: "IpeB",
        model: "Tile",
        profile_finish: "Brushed",
        size: "24x24",
        length_ft: null,
        lf: 30,
        is_unmapped: false,
      },
    ];
    const result = groupMaximoRows(rows);
    const item = result.items[0];
    expect(item.size).toBe("24x24");
    expect(item.totalLF).toBe(30); // straight from `lf` (tiles convention)
    expect(item.branches[0].lengths).toEqual([
      { lengthFt: null, pieces: 30, stockLf: 30 },
    ]);
  });

  it("flags the product as unmapped when any contributing row is unmapped", () => {
    // Two rows that resolve to the SAME product key (IPE || (no model) || S4S || 2x6):
    // one mapped, one unmapped. The product must end up flagged unmapped.
    const rows: MaximoRow[] = [
      {
        branch_name: "Global Miami",
        species: "IPE",
        category: "Hardwoods",
        nominal_size: "2x6",
        profile: "S4S",
        description: null,
        lf_per_piece: 16,
        pieces_available: 10,
        lf_available: 160,
        last_updated: "2026-05-10T00:00:00Z",
        specie: "IPE",
        model: "",
        profile_finish: "S4S",
        size: "2x6",
        length_ft: 16,
        lf: 160,
        is_unmapped: false,
      },
      {
        branch_name: "Global NY",
        species: "IPE",
        category: "Hardwoods",
        nominal_size: "2x6",
        profile: "S4S",
        description: null,
        lf_per_piece: 16,
        pieces_available: 5,
        lf_available: 80,
        last_updated: "2026-05-10T00:00:00Z",
        specie: null,
        model: null,
        profile_finish: null,
        size: null,
        length_ft: null,
        lf: null,
        is_unmapped: true,
      },
    ];
    const result = groupMaximoRows(rows);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].isUnmapped).toBe(true);
  });
});

describe("fetchMaximoInventory", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("calls the view with apikey, Bearer, and Range headers + stable ordering", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [] as MaximoRow[],
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    await fetchMaximoInventory();

    // Empty response â†’ loop exits after the first page.
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("https://example.supabase.co/rest/v1/maximo_inventory_view");
    expect(url).toContain("select=branch_name%2Cspecies%2Ccategory%2Cnominal_size%2Cprofile%2Cdescription%2Clf_per_piece%2Cpieces_available%2Clf_available%2Clast_updated");
    expect(url).toContain("pieces_available=gt.0");
    expect(url).toContain("order=branch_id.asc%2Csku.asc");
    const headers = init.headers as Record<string, string>;
    expect(headers.apikey).toBe("test-apikey");
    expect(headers.Authorization).toBe("Bearer test-jwt");
    expect(headers.Accept).toBe("application/json");
    expect(headers["Range-Unit"]).toBe("items");
    expect(headers.Range).toBe("0-999");
  });

  it("pages through Range when a full page comes back", async () => {
    // Build a full-page (1000) result for the first call, then a short page to terminate.
    const fullPage: MaximoRow[] = Array.from({ length: 1000 }, (_, i) => ({
      branch_name: "Global Miami",
      species: "IPE",
      category: "Hardwoods",
      nominal_size: "2x6",
      profile: "S4S E4E",
      description: null,
      lf_per_piece: 16,
      pieces_available: 1,
      lf_available: 16,
      last_updated: "2026-05-10T00:00:00Z",
    }));
    const shortPage: MaximoRow[] = fullPage.slice(0, 5);
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 206, json: async () => fullPage })
      .mockResolvedValueOnce({ ok: true, status: 206, json: async () => shortPage });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const rows = await fetchMaximoInventory();

    expect(rows).toHaveLength(1005);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const range0 = (mockFetch.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    const range1 = (mockFetch.mock.calls[1][1] as RequestInit).headers as Record<string, string>;
    expect(range0.Range).toBe("0-999");
    expect(range1.Range).toBe("1000-1999");
  });

  it("throws with status + body when the view returns non-2xx", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "invalid JWT",
      json: async () => ({}),
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    await expect(fetchMaximoInventory()).rejects.toThrow(/401.*invalid JWT/);
  });

  it("returns rows on a 200 response", async () => {
    const sample: MaximoRow[] = [
      {
        branch_name: "Global Miami",
        species: "IPE",
        category: "Hardwoods",
        nominal_size: "2x6",
        profile: "S4S E4E",
        description: null,
        lf_per_piece: 16,
        pieces_available: 3,
        lf_available: 48,
        last_updated: "2026-05-10T00:00:00Z",
      },
    ];
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => sample,
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const rows = await fetchMaximoInventory();
    expect(rows).toEqual(sample);
  });
});
