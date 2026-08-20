import { describe, it, expect } from "vitest";
import { fetchAllPricing, type PricingRow } from "./pricing";

// Google Sheets export can be slow — allow up to 30s for network requests
const NETWORK_TIMEOUT = 30_000;

// Live integration test against the current pricing sheet
// (replaces the legacy test that pointed at a deleted sheet).
describe("Pricing — Google Sheet integration", () => {
  let rowsPromise: Promise<PricingRow[]> | null = null;
  const getRows = () => (rowsPromise ??= fetchAllPricing());

  it(
    "fetches and parses rows from all three tabs",
    async () => {
      const rows = await getRows();
      expect(rows.length).toBeGreaterThan(0);
      const categories = new Set(rows.map(r => r.category));
      expect(categories.has("THERMO")).toBe(true);
      expect(categories.has("HARDWOOD")).toBe(true);
      expect(categories.has("ACCOYA")).toBe(true);
    },
    NETWORK_TIMEOUT,
  );

  it(
    "THERMO tab includes AYOUS rows with all 6 price tiers",
    async () => {
      const rows = await getRows();
      const ayous = rows.filter(
        r => r.category === "THERMO" && r.species.toUpperCase().includes("AYOUS"),
      );
      expect(ayous.length).toBeGreaterThan(0);
      const full = ayous.find(
        r =>
          r.priceDistributor !== null &&
          r.priceDistributorFixed !== null &&
          r.priceDealer !== null &&
          r.priceDealerFixed !== null &&
          r.priceEndCustomer !== null &&
          r.priceEndCustomerFixed !== null,
      );
      expect(full).toBeDefined();
    },
    NETWORK_TIMEOUT,
  );

  it(
    "HARDWOOD tab includes CUMARU and IPE",
    async () => {
      const rows = await getRows();
      const hardwoodSpecies = rows
        .filter(r => r.category === "HARDWOOD")
        .map(r => r.species.toUpperCase());
      expect(hardwoodSpecies.some(s => s.includes("CUMARU"))).toBe(true);
      expect(hardwoodSpecies.some(s => s.includes("IPE"))).toBe(true);
    },
    NETWORK_TIMEOUT,
  );

  it(
    "parsed prices are sane $/LF values",
    async () => {
      const rows = await getRows();
      for (const r of rows) {
        for (const price of [
          r.priceDistributor,
          r.priceDistributorFixed,
          r.priceDealer,
          r.priceDealerFixed,
          r.priceEndCustomer,
          r.priceEndCustomerFixed,
        ]) {
          if (price !== null) {
            expect(price).toBeGreaterThan(0);
            expect(price).toBeLessThan(1000);
          }
        }
      }
    },
    NETWORK_TIMEOUT,
  );
});
