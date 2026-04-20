import { describe, it, expect } from "vitest";
import {
  getSpecies,
  getNominalSizes,
  getProfiles,
  findProduct,
  getPrice,
  parseExposedFaceInches,
  lfToSqft,
  sqftToLf,
  calculateCoatingNeeded,
  calculateAddOnCost,
  applyWaste,
  THERMO_PRODUCTS,
  PRE_FINISH_COLOR_OPTIONS,
  PRE_FINISH_TEXTURE_PRICE_PER_LF,
  MILLING_PRICE_PER_LF,
  WASTE_OPTIONS,
} from "../client/src/lib/products";

describe("THERMO_PRODUCTS data integrity", () => {
  it("has 37 products loaded", () => {
    expect(THERMO_PRODUCTS.length).toBe(37);
  });

  it("all products have required fields", () => {
    for (const p of THERMO_PRODUCTS) {
      expect(p.id).toBeTruthy();
      expect(p.species).toBeTruthy();
      expect(p.nominalSize).toBeTruthy();
      expect(p.profile).toBeTruthy();
      expect(p.priceRL).toBeGreaterThan(0);
      expect(p.priceFixed).toBeGreaterThan(0);
    }
  });

  it("priceFixed is always greater than priceRL", () => {
    for (const p of THERMO_PRODUCTS) {
      expect(p.priceFixed).toBeGreaterThan(p.priceRL);
    }
  });

  it("has all four species", () => {
    const species = getSpecies();
    expect(species).toContain("AYOUS");
    expect(species).toContain("ASH");
    expect(species).toContain("SCANDINAVIAN");
    expect(species).toContain("CLEAR RADIATA");
  });
});

describe("getPrice", () => {
  it("returns priceRL when lengthType is RL", () => {
    const product = THERMO_PRODUCTS[0];
    expect(getPrice(product, "RL")).toBe(product.priceRL);
  });

  it("returns priceFixed when lengthType is Fixed", () => {
    const product = THERMO_PRODUCTS[0];
    expect(getPrice(product, "Fixed")).toBe(product.priceFixed);
  });
});

describe("filter helpers", () => {
  it("getNominalSizes returns sizes for AYOUS", () => {
    const sizes = getNominalSizes("AYOUS");
    expect(sizes).toContain("1 x 6");
    expect(sizes).toContain("1 x 4");
  });

  it("getProfiles returns profiles for AYOUS 1x6", () => {
    const profiles = getProfiles("AYOUS", "1 x 6");
    expect(profiles.length).toBeGreaterThan(0);
    expect(profiles).toContain("SQUARE S4S E4E");
  });

  it("findProduct returns correct product", () => {
    const p = findProduct("AYOUS", "1 x 6", "SQUARE S4S E4E");
    expect(p).toBeDefined();
    expect(p?.priceRL).toBe(5.82);
    expect(p?.priceFixed).toBe(7.76);
  });

  it("PREFINISHED profiles are included in product list", () => {
    const prefinished = THERMO_PRODUCTS.filter(p => p.profile.includes("PREFINISHED"));
    expect(prefinished.length).toBeGreaterThan(0);
  });

  it("findProduct returns undefined for unknown combo", () => {
    const p = findProduct("AYOUS", "1 x 6", "NONEXISTENT PROFILE");
    expect(p).toBeUndefined();
  });
});

describe("conversion helpers", () => {
  it("parseExposedFaceInches extracts numeric value", () => {
    expect(parseExposedFaceInches('5.51"')).toBeCloseTo(5.51);
    expect(parseExposedFaceInches('3.62"')).toBeCloseTo(3.62);
  });

  it("lfToSqft converts correctly", () => {
    const sqft = lfToSqft(100, 5.51);
    expect(sqft).toBeCloseTo(45.92, 1);
  });

  it("sqftToLf converts correctly", () => {
    const lf = sqftToLf(45.92, 5.51);
    expect(lf).toBeCloseTo(100, 0);
  });

  it("lfToSqft and sqftToLf are inverse operations", () => {
    const originalLF = 250;
    const exposedFace = 5.51;
    const sqft = lfToSqft(originalLF, exposedFace);
    const backToLF = sqftToLf(sqft, exposedFace);
    expect(backToLF).toBeCloseTo(originalLF, 5);
  });
});

describe("coating calculation", () => {
  it("calculates 2.5L cans correctly", () => {
    expect(calculateCoatingNeeded(340, "saicos_2_5L")).toBe(2);
    expect(calculateCoatingNeeded(171, "saicos_2_5L")).toBe(2);
    expect(calculateCoatingNeeded(170, "saicos_2_5L")).toBe(1);
  });

  it("calculates 10L cans correctly", () => {
    expect(calculateCoatingNeeded(680, "saicos_10L")).toBe(1);
    expect(calculateCoatingNeeded(681, "saicos_10L")).toBe(2);
  });
});

describe("add-ons calculation", () => {
  it("milling adds $1.00/LF", () => {
    expect(MILLING_PRICE_PER_LF).toBe(1.00);
    const cost = calculateAddOnCost(100, { milling: true, preFinishColor: false, preFinishColorType: "regular", preFinishTexture: false });
    expect(cost).toBe(100.00);
  });

  it("pre-finish color options have correct prices", () => {
    expect(PRE_FINISH_COLOR_OPTIONS.find(o => o.id === "regular")?.pricePerLF).toBe(1.50);
    expect(PRE_FINISH_COLOR_OPTIONS.find(o => o.id === "fluted")?.pricePerLF).toBe(1.90);
    expect(PRE_FINISH_COLOR_OPTIONS.find(o => o.id === "special")?.pricePerLF).toBe(2.20);
  });

  it("pre-finish color regular adds $1.50/LF", () => {
    const cost = calculateAddOnCost(100, { milling: false, preFinishColor: true, preFinishColorType: "regular", preFinishTexture: false });
    expect(cost).toBe(150.00);
  });

  it("pre-finish color fluted adds $1.90/LF", () => {
    const cost = calculateAddOnCost(100, { milling: false, preFinishColor: true, preFinishColorType: "fluted", preFinishTexture: false });
    expect(cost).toBe(190.00);
  });

  it("pre-finish color special adds $2.20/LF", () => {
    const cost = calculateAddOnCost(100, { milling: false, preFinishColor: true, preFinishColorType: "special", preFinishTexture: false });
    expect(cost).toBeCloseTo(220.00);
  });

  it("pre-finish texture adds $0.30/LF independently", () => {
    expect(PRE_FINISH_TEXTURE_PRICE_PER_LF).toBe(0.30);
    const cost = calculateAddOnCost(100, { milling: false, preFinishColor: false, preFinishColorType: "regular", preFinishTexture: true });
    expect(cost).toBeCloseTo(30.00);
  });

  it("pre-finish color + texture can be combined", () => {
    const cost = calculateAddOnCost(100, { milling: false, preFinishColor: true, preFinishColorType: "fluted", preFinishTexture: true });
    expect(cost).toBeCloseTo(220.00); // 190 + 30
  });

  it("milling + pre-finish color + texture all combined", () => {
    const cost = calculateAddOnCost(100, { milling: true, preFinishColor: true, preFinishColorType: "regular", preFinishTexture: true });
    expect(cost).toBeCloseTo(280.00); // 100 + 150 + 30
  });

  it("no add-ons returns 0", () => {
    const cost = calculateAddOnCost(100, { milling: false, preFinishColor: false, preFinishColorType: "regular", preFinishTexture: false });
    expect(cost).toBe(0);
  });
});

describe("material waste", () => {
  // Waste uses division: 10% → ÷0.90, 15% → ÷0.85, 20% → ÷0.80
  it("WASTE_OPTIONS has correct divisors", () => {
    expect(WASTE_OPTIONS.find(w => w.id === "none")?.divisor).toBe(1.00);
    expect(WASTE_OPTIONS.find(w => w.id === "10")?.divisor).toBe(0.90);
    expect(WASTE_OPTIONS.find(w => w.id === "15")?.divisor).toBe(0.85);
    expect(WASTE_OPTIONS.find(w => w.id === "20")?.divisor).toBe(0.80);
  });

  it("applyWaste with none returns same quantity", () => {
    expect(applyWaste(100, "none")).toBe(100);
  });

  it("applyWaste with 10% divides by 0.90 (~111.11 LF needed for 100 LF net)", () => {
    expect(applyWaste(100, "10")).toBeCloseTo(100 / 0.90, 2);
  });

  it("applyWaste with 15% divides by 0.85 (~117.65 LF needed for 100 LF net)", () => {
    expect(applyWaste(100, "15")).toBeCloseTo(100 / 0.85, 2);
  });

  it("applyWaste with 20% divides by 0.80 (125 LF needed for 100 LF net)", () => {
    expect(applyWaste(100, "20")).toBeCloseTo(100 / 0.80, 2);
  });
});
