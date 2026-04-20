import { describe, it, expect } from "vitest";

const SHEET_ID = "1I7cW-6kntiUWl-V2dSYS5MqkafsoJpZHu_Sgt-wADqw";

describe("Pricing Router — Google Sheet integration", () => {
  it("fetches THERMO tab and returns valid rows", async () => {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;
    const res = await fetch(url);
    expect(res.ok).toBe(true);
    const text = await res.text();
    expect(text.length).toBeGreaterThan(100);
    // Should contain price columns
    expect(text).toContain("Price Distributor");
    expect(text).toContain("Price Dealers");
    // Should contain THERMO species
    expect(text).toContain("MAXIMO THERMO AYOUS");
  });

  it("fetches HARDWOOD tab and returns valid rows", async () => {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=2087042726`;
    const res = await fetch(url);
    expect(res.ok).toBe(true);
    const text = await res.text();
    expect(text.length).toBeGreaterThan(100);
    expect(text).toContain("CUMARU");
    expect(text).toContain("IPE");
  });

  it("parses prices correctly from THERMO CSV", async () => {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;
    const res = await fetch(url);
    const text = await res.text();
    const lines = text.split(/\r?\n/);
    // Find a data row with a price
    const dataRows = lines.slice(3).filter((l) => l.includes("$") && l.includes("AYOUS"));
    expect(dataRows.length).toBeGreaterThan(0);
    // Extract first price value — should be a valid number
    const firstPriceMatch = dataRows[0].match(/\$(\d+\.\d+)/);
    expect(firstPriceMatch).not.toBeNull();
    const price = parseFloat(firstPriceMatch![1]);
    expect(price).toBeGreaterThan(0);
    expect(price).toBeLessThan(100); // sanity check — prices are per LF
  });

  it("has all 6 price tier columns in THERMO tab", async () => {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;
    const res = await fetch(url);
    const text = await res.text();
    expect(text).toContain("Price Distributor");
    expect(text).toContain("Price Distributor Fixed");
    expect(text).toContain("Price Dealers");
    expect(text).toContain("Price Dealers Fixed");
    expect(text).toContain("Price End Customer");
    expect(text).toContain("Price End Customer Fixed");
  });
});
