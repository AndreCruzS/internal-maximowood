import { describe, it, expect } from "vitest";

const SUPABASE_URL = process.env.SUPABASE_INVENTORY_URL ?? "https://vvsyoxhmpmbmpbiugxen.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_INVENTORY_ANON_KEY ?? "";

describe("Supabase inventory view credentials", () => {
  it("should connect to the Supabase view and return rows", async () => {
    const url = `${SUPABASE_URL}/rest/v1/maximo_inventory_view?select=branch_name,species,nominal_size,profile,length,pieces,stock_lf&limit=5`;
    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    });

    expect(res.ok).toBe(true);
    const rows = await res.json() as unknown[];
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("should return rows with expected columns including new length and pieces", async () => {
    const url = `${SUPABASE_URL}/rest/v1/maximo_inventory_view?select=branch_name,species,nominal_size,profile,length,pieces,stock_lf&limit=1`;
    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    });

    const rows = await res.json() as Record<string, unknown>[];
    const row = rows[0];
    expect(row).toHaveProperty("branch_name");
    expect(row).toHaveProperty("species");
    expect(row).toHaveProperty("stock_lf");
    // New columns added by André
    expect(row).toHaveProperty("length");
    expect(row).toHaveProperty("pieces");
  });
});
