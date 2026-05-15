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
    expect(result.branches).toEqual([]);
    expect(result.lastUpdated).toBeNull();
  });

  it("sorts items by species, then profile, then size", () => {
    const rows: MaximoRow[] = [
      {
        branch_name: "Global Miami",
        species: "CUMARU",
        category: "Hardwoods",
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
        category: "Hardwoods",
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

  it("collects distinct categories sorted alphabetically", () => {
    const rows: MaximoRow[] = [
      {
        branch_name: "Global Miami",
        species: "Thermo Pine",
        category: "Thermowood",
        nominal_size: "1x6",
        profile: "V Joint",
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
        lf_per_piece: 10,
        pieces_available: 2,
        lf_available: 20,
        last_updated: "2026-05-10T00:00:00Z",
      },
    ];
    const result = groupMaximoRows(rows);
    expect(result.categories).toEqual(["Accoya", "Hardwoods", "Thermowood"]);
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

    // Empty response → loop exits after the first page.
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("https://example.supabase.co/rest/v1/maximo_inventory_view");
    expect(url).toContain("select=branch_name%2Cspecies%2Ccategory%2Cnominal_size%2Cprofile%2Clf_per_piece%2Cpieces_available%2Clf_available%2Clast_updated");
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
