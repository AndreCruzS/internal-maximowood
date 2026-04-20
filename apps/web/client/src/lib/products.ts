export interface Product {
  id: string;
  species: string;
  application: string;
  profile: string;
  nominalSize: string;
  lengthRange: string;
  exposedFace: string;
  /** Price End Customer — Random Lengths (RL) */
  priceRL: number;
  /** Price End Customer — Fixed Lengths */
  priceFixed: number;
}

export type LengthType = "RL" | "Fixed";

/** Returns the correct price based on length type selection */
export const getPrice = (product: Product, lengthType: LengthType): number =>
  lengthType === "RL" ? product.priceRL : product.priceFixed;

// ── Pricing chain (all true margins, stacked from base) ──────────────────────
// Dist RL         = base                 (base price)
// Dist Fixed      = base / 0.75          (25% margin on base)
// Dealer RL       = base / 0.77          (23% margin on base)
// Dealer Fixed    = base / 0.77 / 0.75   (25% margin on Dealer RL)
// End Customer RL = base / 0.77 / 0.60   (40% margin on Dealer RL)
// End Customer Fx = base / 0.77 / 0.60 / 0.75  (25% margin on EC RL)
// ─────────────────────────────────────────────────────────────────────────────

export const THERMO_PRODUCTS: Product[] = [
  // ── AYOUS ──────────────────────────────────────────────────────────────────
  // base=1.72 → RL=3.7229, Fixed=4.9639
  { id: "ayous-1x4-sq",      species: "AYOUS", application: "Cladding",           profile: "SQUARE S4S E4E",                         nominalSize: "1 x 4",     lengthRange: "4' - 14'",  exposedFace: '3.62"',  priceRL: 3.72,  priceFixed: 4.96 },
  { id: "ayous-1x4-vj",      species: "AYOUS", application: "Cladding",           profile: "V JOINT / SQUARE BACK",                  nominalSize: "1 x 4",     lengthRange: "4' - 14'",  exposedFace: '3.37"',  priceRL: 3.72,  priceFixed: 4.96 },
  // base=2.69 → RL=5.8225, Fixed=7.7633
  { id: "ayous-1x6-sq",      species: "AYOUS", application: "Cladding",           profile: "SQUARE S4S E4E",                         nominalSize: "1 x 6",     lengthRange: "4' - 14'",  exposedFace: '5.51"',  priceRL: 5.82,  priceFixed: 7.76 },
  { id: "ayous-1x6-vj",      species: "AYOUS", application: "Cladding",           profile: "V JOINT / SQUARE BACK",                  nominalSize: "1 x 6",     lengthRange: "4' - 14'",  exposedFace: '5.26"',  priceRL: 5.82,  priceFixed: 7.76 },
  { id: "ayous-1x6-ng",      species: "AYOUS", application: "Cladding",           profile: "V JOINT / NICKEL GAP",                   nominalSize: "1 x 6",     lengthRange: "4' - 14'",  exposedFace: '5.26"',  priceRL: 5.82,  priceFixed: 7.76 },
  // base=2.97 → RL=6.4286, Fixed=8.5714
  { id: "ayous-1x6-ng-pf",   species: "AYOUS", application: "Cladding",           profile: "V JOINT / NICKEL GAP - PREFINISHED",     nominalSize: "1 x 6",     lengthRange: "4' - 14'",  exposedFace: '5.26"',  priceRL: 6.43,  priceFixed: 8.57 },
  // base=3.62 → RL=7.8355, Fixed=10.4473
  { id: "ayous-1x6-ng-bb",   species: "AYOUS", application: "Cladding",           profile: "V JOINT / NICKEL GAP - BURN BLOCK",      nominalSize: "1 x 6",     lengthRange: "4' - 14'",  exposedFace: '5.26"',  priceRL: 7.84,  priceFixed: 10.45 },
  // base=3.06 → RL=6.6234, Fixed=8.8312
  { id: "ayous-1x6-fl",      species: "AYOUS", application: "Cladding",           profile: "FLUTED #5",                              nominalSize: "1 x 6",     lengthRange: "4' - 14'",  exposedFace: '5.26"',  priceRL: 6.62,  priceFixed: 8.83 },
  // base=2.61 → RL=5.6494, Fixed=7.5325
  { id: "ayous-54x4-sq",     species: "AYOUS", application: "Decking",            profile: "SQUARE S4S E4E",                         nominalSize: "5/4 x 4",   lengthRange: "4' - 14'",  exposedFace: '3.62"',  priceRL: 5.65,  priceFixed: 7.53 },
  // base=4.14 → RL=8.9610, Fixed=11.9481
  { id: "ayous-54x6-sq",     species: "AYOUS", application: "Decking",            profile: "SQUARE S4S E4E",                         nominalSize: "5/4 x 6",   lengthRange: "4' - 14'",  exposedFace: '5.43"',  priceRL: 8.96,  priceFixed: 11.95 },
  // base=3.80 → RL=8.2251, Fixed=10.9668
  { id: "ayous-1x8-sq",      species: "AYOUS", application: "Trim Pieces",        profile: "SQUARE S4S E4E",                         nominalSize: "1 x 8",     lengthRange: "4' - 14'",  exposedFace: '7.09"',  priceRL: 8.23,  priceFixed: 10.97 },
  // base=6.15 → RL=13.3117, Fixed=17.7489
  { id: "ayous-1x10-sq",     species: "AYOUS", application: "Trim Pieces",        profile: "SQUARE S4S E4E",                         nominalSize: "1 x 10",    lengthRange: "4' - 14'",  exposedFace: '9.84"',  priceRL: 13.31, priceFixed: 17.75 },
  // base=7.48 → RL=16.1905, Fixed=21.5873
  { id: "ayous-1x12-sq",     species: "AYOUS", application: "Trim Pieces",        profile: "SQUARE S4S E4E",                         nominalSize: "1 x 12",    lengthRange: "4' - 14'",  exposedFace: '11.25"', priceRL: 16.19, priceFixed: 21.59 },
  // base=2.26 → RL=4.8918, Fixed=6.5224
  { id: "ayous-2x2-sq",      species: "AYOUS", application: "Trim Pieces",        profile: "SQUARE S4S E4E",                         nominalSize: "2 x 2",     lengthRange: "4' - 14'",  exposedFace: '1.57"',  priceRL: 4.89,  priceFixed: 6.52 },
  // base=4.56 → RL=9.8701, Fixed=13.1602
  { id: "ayous-2x4-sq",      species: "AYOUS", application: "Trim Pieces",        profile: "SQUARE S4S E4E",                         nominalSize: "2 x 4",     lengthRange: "4' - 14'",  exposedFace: '3.54"',  priceRL: 9.87,  priceFixed: 13.16 },
  // base=6.81 → RL=14.7403, Fixed=19.6537
  { id: "ayous-2x6-sq",      species: "AYOUS", application: "Trim Pieces",        profile: "SQUARE S4S E4E",                         nominalSize: "2 x 6",     lengthRange: "4' - 14'",  exposedFace: '5.51"',  priceRL: 14.74, priceFixed: 19.65 },

  // ── ASH ───────────────────────────────────────────────────────────────────
  // base=4.23 → RL=9.1558, Fixed=12.2078
  { id: "ash-1x6plus-sq-em", species: "ASH",   application: "Cladding / Decking", profile: "SQUARE S4S E4E - END MATCH",             nominalSize: "1 x 6 Plus",lengthRange: "4' - 16'",  exposedFace: '5.51"',  priceRL: 9.16,  priceFixed: 12.21 },
  // base=5.63 → RL=12.1861, Fixed=16.2482
  { id: "ash-1x8-sq",        species: "ASH",   application: "Trim Pieces",        profile: "SQUARE S4S E4E",                         nominalSize: "1 x 8",     lengthRange: "4' - 16'",  exposedFace: '7.09"',  priceRL: 12.19, priceFixed: 16.25 },
  // base=7.53 → RL=16.2987, Fixed=21.7316
  { id: "ash-1x10-sq",       species: "ASH",   application: "Trim Pieces",        profile: "SQUARE S4S E4E",                         nominalSize: "1 x 10",    lengthRange: "4' - 16'",  exposedFace: '9.84"',  priceRL: 16.30, priceFixed: 21.73 },
  // base=5.04 → RL=10.9091, Fixed=14.5455
  { id: "ash-54x6-sq-em",    species: "ASH",   application: "Decking",            profile: "SQUARE S4S E4E - END MATCH",             nominalSize: "5/4 x 6",   lengthRange: "4' - 16'",  exposedFace: '5.51"',  priceRL: 10.91, priceFixed: 14.55 },
  // base=3.31 → RL=7.1645, Fixed=9.5527
  { id: "ash-2x2-sq",        species: "ASH",   application: "Trim Pieces",        profile: "SQUARE S4S E4E",                         nominalSize: "2 x 2",     lengthRange: "4' - 16'",  exposedFace: '1.57"',  priceRL: 7.16,  priceFixed: 9.55 },
  // base=6.97 → RL=15.0866, Fixed=20.1154
  { id: "ash-2x4-sq",        species: "ASH",   application: "Trim Pieces",        profile: "SQUARE S4S E4E",                         nominalSize: "2 x 4",     lengthRange: "4' - 16'",  exposedFace: '3.54"',  priceRL: 15.09, priceFixed: 20.12 },
  // base=10.91 → RL=23.6147, Fixed=31.4863
  { id: "ash-2x6-sq",        species: "ASH",   application: "Decking",            profile: "SQUARE S4S E4E",                         nominalSize: "2 x 6",     lengthRange: "4' - 16'",  exposedFace: '5.51"',  priceRL: 23.61, priceFixed: 31.49 },

  // ── SCANDINAVIAN ──────────────────────────────────────────────────────────
  // base=1.59 → RL=3.4416, Fixed=4.5887
  { id: "scan-1x6-vj",       species: "SCANDINAVIAN", application: "Cladding",    profile: "V JOINT / SQUARE BACK",                  nominalSize: "1 x 6",     lengthRange: "8' - 17'",  exposedFace: '5.26"',  priceRL: 3.44,  priceFixed: 4.59 },
  { id: "scan-1x6-ng",       species: "SCANDINAVIAN", application: "Cladding",    profile: "V JOINT / NICKEL GAP",                   nominalSize: "1 x 6",     lengthRange: "8' - 17'",  exposedFace: '5.26"',  priceRL: 3.44,  priceFixed: 4.59 },
  // base=1.92 → RL=4.1558, Fixed=5.5411
  { id: "scan-1x6-fl",       species: "SCANDINAVIAN", application: "Cladding",    profile: "FLUTED #5",                              nominalSize: "1 x 6",     lengthRange: "8' - 17'",  exposedFace: '5.26"',  priceRL: 4.16,  priceFixed: 5.54 },
  // base=1.97 → RL=4.2641, Fixed=5.6854
  { id: "scan-54x6-sq",      species: "SCANDINAVIAN", application: "Decking",     profile: "SQUARE S4S E4E",                         nominalSize: "5/4 x 6",   lengthRange: "8' - 17'",  exposedFace: '5.43"',  priceRL: 4.26,  priceFixed: 5.69 },
  // base=0.99 → RL=2.1429, Fixed=2.8571
  { id: "scan-58x4-vj",      species: "SCANDINAVIAN", application: "Cladding",    profile: "V JOINT / SQUARE BACK",                  nominalSize: "5/8 x 4",   lengthRange: "8' - 17'",  exposedFace: '3.37"',  priceRL: 2.14,  priceFixed: 2.86 },
  // base=2.87 → RL=6.2121, Fixed=8.2828
  { id: "scan-2x4-sq",       species: "SCANDINAVIAN", application: "Trim Pieces", profile: "SQUARE S4S E4E",                         nominalSize: "2 x 4",     lengthRange: "8' - 17'",  exposedFace: '3.62"',  priceRL: 6.21,  priceFixed: 8.28 },

  // ── CLEAR RADIATA ─────────────────────────────────────────────────────────
  // base=1.10 → RL=2.3810, Fixed=3.1746
  { id: "cr-38x4-vj",        species: "CLEAR RADIATA", application: "Cladding",   profile: "V JOINT / SQUARE BACK",                  nominalSize: "3/8 x 4",   lengthRange: "10' - 16'", exposedFace: '3.29"',  priceRL: 2.38,  priceFixed: 3.17 },
  // base=2.12 → RL=4.5887, Fixed=6.1183
  { id: "cr-1x5-ng-wb",      species: "CLEAR RADIATA", application: "Cladding",   profile: "NICKEL GAP - WIRE BRUSHED",              nominalSize: "1 x 5",     lengthRange: "10' - 16'", exposedFace: '3.7"',   priceRL: 4.59,  priceFixed: 6.12 },
  // base=3.46 → RL=7.4892, Fixed=9.9856 (PREFINISHED BLACK/WHITE)
  { id: "cr-1x6-ng-pf",      species: "CLEAR RADIATA", application: "Cladding",   profile: "NICKEL GAP - PREFINISHED - BLACK/WHITE", nominalSize: "1 x 6",     lengthRange: "10' - 16'", exposedFace: '4.6"',   priceRL: 7.49,  priceFixed: 9.99 },
  // base=2.62 → RL=5.6710, Fixed=7.5613 (OPX)
  { id: "cr-1x6-ng-opx",     species: "CLEAR RADIATA", application: "Cladding",   profile: "NICKEL GAP - OPX",                       nominalSize: "1 x 6",     lengthRange: "10' - 16'", exposedFace: '4.6"',   priceRL: 5.67,  priceFixed: 7.56 },
  // base=3.36 → RL=7.2727, Fixed=9.6970
  { id: "cr-1x8-sq",         species: "CLEAR RADIATA", application: "Trim Pieces",profile: "SQUARE S4S E4E",                         nominalSize: "1 x 8",     lengthRange: "10' - 16'", exposedFace: '7.28"',  priceRL: 7.27,  priceFixed: 9.70 },
  // base=5.01 → RL=10.8442, Fixed=14.4589
  { id: "cr-1x12-sq",        species: "CLEAR RADIATA", application: "Trim Pieces",profile: "SQUARE S4S E4E",                         nominalSize: "1 x 12",    lengthRange: "10' - 16'", exposedFace: '11.22"', priceRL: 10.84, priceFixed: 14.46 },
  // base=3.20 → RL=6.9264, Fixed=9.2352
  { id: "cr-54x6-sq-opx",    species: "CLEAR RADIATA", application: "Decking",    profile: "SQUARE S4S E4E - OPX",                   nominalSize: "5/4 x 6",   lengthRange: "10' - 16'", exposedFace: '5.43"',  priceRL: 6.93,  priceFixed: 9.24 },
  // base=4.87 → RL=10.5411, Fixed=14.0548
  { id: "cr-2x6-sq-opx",     species: "CLEAR RADIATA", application: "Decking",    profile: "SQUARE S4S E4E - OPX",                   nominalSize: "2 x 6",     lengthRange: "10' - 16'", exposedFace: '5.43"',  priceRL: 10.54, priceFixed: 14.05 },
];

// ── Filter helpers ──────────────────────────────────────────────────────────

export const getSpecies = (): string[] =>
  Array.from(new Set(THERMO_PRODUCTS.map((p) => p.species)));

export const getNominalSizes = (species: string): string[] =>
  Array.from(new Set(THERMO_PRODUCTS.filter((p) => p.species === species).map((p) => p.nominalSize)));

export const getProfiles = (species: string, nominalSize: string): string[] =>
  Array.from(new Set(
    THERMO_PRODUCTS
      .filter((p) => p.species === species && p.nominalSize === nominalSize)
      .map((p) => p.profile)
  ));

export const findProduct = (
  species: string,
  nominalSize: string,
  profile: string
): Product | undefined =>
  THERMO_PRODUCTS.find(
    (p) => p.species === species && p.nominalSize === nominalSize && p.profile === profile
  );

// ── Conversion helpers ──────────────────────────────────────────────────────

export const parseExposedFaceInches = (exposedFace: string): number => {
  const val = parseFloat(exposedFace.replace(/[^0-9.]/g, ""));
  return isNaN(val) ? 0 : val;
};

export const lfToSqft = (lf: number, exposedFaceInches: number): number => {
  const widthFt = exposedFaceInches / 12;
  return lf * widthFt;
};

export const sqftToLf = (sqft: number, exposedFaceInches: number): number => {
  const widthFt = exposedFaceInches / 12;
  if (widthFt === 0) return 0;
  return sqft / widthFt;
};

// ── Coating ─────────────────────────────────────────────────────────────────

export const COATING_OPTIONS = [
  { id: "saicos_2_5L", label: "SAICOS 2.5L", coverageSqft: 170 },
  { id: "saicos_10L",  label: "SAICOS 10L",  coverageSqft: 680 },
] as const;

export type CoatingId = (typeof COATING_OPTIONS)[number]["id"];

export const calculateCoatingNeeded = (sqft: number, coatingId: CoatingId): number => {
  const option = COATING_OPTIONS.find((c) => c.id === coatingId);
  if (!option) return 0;
  return Math.ceil(sqft / option.coverageSqft);
};

// ── Add-ons / Custom Orders ────────────────────────────────────────────────

/** Pre-Finish: Color options (pick one) */
export type PreFinishColorType = "regular" | "fluted" | "special";

export const PRE_FINISH_COLOR_OPTIONS: { id: PreFinishColorType; label: string; pricePerLF: number }[] = [
  { id: "regular", label: "Regular",                              pricePerLF: 1.50 },
  { id: "fluted",  label: "Fluted",                               pricePerLF: 1.90 },
  { id: "special", label: "Special Sizes (2x4, 2x6, 1x8, 1x10)", pricePerLF: 2.20 },
];

/** Pre-Finish: Texture is an independent add-on (+$0.30/LF) */
export const PRE_FINISH_TEXTURE_PRICE_PER_LF = 0.30;

export const MILLING_PRICE_PER_LF = 1.00;

export type AddOnConfig = {
  milling: boolean;
  preFinishColor: boolean;
  preFinishColorType: PreFinishColorType;
  preFinishTexture: boolean;
};

export const calculateAddOnCost = (lf: number, addOns: AddOnConfig): number => {
  let total = 0;
  if (addOns.milling) total += lf * MILLING_PRICE_PER_LF;
  if (addOns.preFinishColor) {
    const opt = PRE_FINISH_COLOR_OPTIONS.find((o) => o.id === addOns.preFinishColorType);
    if (opt) total += lf * opt.pricePerLF;
  }
  if (addOns.preFinishTexture) total += lf * PRE_FINISH_TEXTURE_PRICE_PER_LF;
  return total;
};

// ── Material Waste ───────────────────────────────────────────────────────────

export const WASTE_OPTIONS = [
  { id: "none", label: "No waste",   divisor: 1.00 },
  { id: "10",   label: "10% waste",  divisor: 0.90 },
  { id: "15",   label: "15% waste",  divisor: 0.85 },
  { id: "20",   label: "20% waste",  divisor: 0.80 },
] as const;

export type WasteId = (typeof WASTE_OPTIONS)[number]["id"];

export const applyWaste = (quantity: number, wasteId: WasteId): number => {
  const opt = WASTE_OPTIONS.find((w) => w.id === wasteId);
  return quantity / (opt ? opt.divisor : 1);
};

// Legacy compat
export const PRODUCTS = { thermo: THERMO_PRODUCTS, accoya: [], hardwood: [] };
export const extractWidthFromExposedFace = parseExposedFaceInches;
