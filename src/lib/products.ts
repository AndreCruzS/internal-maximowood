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

// Filter helpers are defined after ALL_PRODUCTS below

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
export type PreFinishColorType = "regular" | "regular_ca" | "fluted" | "special";

export const PRE_FINISH_COLOR_OPTIONS: { id: PreFinishColorType; label: string; pricePerLF: number }[] = [
  { id: "regular",    label: "Regular",                              pricePerLF: 2.20 },
  { id: "regular_ca", label: "Regular - CA - 3/4 weeks",             pricePerLF: 2.20 },
  { id: "fluted",     label: "Fluted",                               pricePerLF: 2.40 },
  { id: "special",    label: "Special Sizes (2x4, 2x6, 1x8, 1x10)", pricePerLF: 2.70 },
];

/** Pre-Finish: Texture is an independent add-on (+$0.50/LF) */
export const PRE_FINISH_TEXTURE_PRICE_PER_LF = 0.50;

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

// ── HARDWOOD PRODUCTS ──────────────────────────────────────────────────────────
// Prices from spreadsheet: End Customer RL / End Customer Fixed
// Exposed face: 1x6 = 5.43" (actual), 5/4x6 = 5.43" (actual)

export const HARDWOOD_PRODUCTS: Product[] = [
  // ── CUMARU ─────────────────────────────────────────────────────────────────
  // EC RL=$6.41, EC Fixed=$8.54
  { id: "cumaru-1x6-sq",         species: "CUMARU",           application: "Decking", profile: "SQUARE S4S E4E",         nominalSize: "1 x 6",   lengthRange: "8' - 20'", exposedFace: '5.43"', priceRL: 6.41,  priceFixed: 8.54  },
  // EC RL=$8.55, EC Fixed=$11.40
  { id: "cumaru-54x6-sq-solid",   species: "CUMARU",           application: "Decking", profile: "SQUARE S4S E4E - SOLID",  nominalSize: "5/4 x 6", lengthRange: "8' - 20'", exposedFace: '5.43"', priceRL: 8.55,  priceFixed: 11.40 },
  // EC RL=$8.70, EC Fixed=$11.72
  { id: "cumaru-54x6-sq-grooved", species: "CUMARU",           application: "Decking", profile: "SQUARE S4S E4E - GROOVED",nominalSize: "5/4 x 6", lengthRange: "8' - 20'", exposedFace: '5.43"', priceRL: 8.70,  priceFixed: 11.72 },

  // ── IPE ────────────────────────────────────────────────────────────────────
  // EC RL=$10.15, EC Fixed=$13.54
  { id: "ipe-1x6-sq",             species: "IPE",              application: "Decking", profile: "SQUARE S4S E4E",         nominalSize: "1 x 6",   lengthRange: "8' - 20'", exposedFace: '5.43"', priceRL: 10.15, priceFixed: 13.54 },
  // EC RL=$14.26, EC Fixed=$19.02
  { id: "ipe-54x6-sq-solid",      species: "IPE",              application: "Decking", profile: "SQUARE S4S E4E - SOLID",  nominalSize: "5/4 x 6", lengthRange: "8' - 20'", exposedFace: '5.43"', priceRL: 14.26, priceFixed: 19.02 },
  // EC RL=$14.48, EC Fixed=$19.31
  { id: "ipe-54x6-sq-grooved",    species: "IPE",              application: "Decking", profile: "SQUARE S4S E4E - GROOVED",nominalSize: "5/4 x 6", lengthRange: "8' - 20'", exposedFace: '5.43"', priceRL: 14.48, priceFixed: 19.31 },

  // ── GARAPA ─────────────────────────────────────────────────────────────────
  // EC RL=$5.35, EC Fixed=$7.13
  { id: "garapa-1x6-sq",          species: "GARAPA",           application: "Decking", profile: "SQUARE S4S E4E",         nominalSize: "1 x 6",   lengthRange: "8' - 20'", exposedFace: '5.43"', priceRL: 5.35,  priceFixed: 7.13  },
  // EC RL=$7.14, EC Fixed=$9.52
  { id: "garapa-54x6-sq-solid",   species: "GARAPA",           application: "Decking", profile: "SQUARE S4S E4E - SOLID",  nominalSize: "5/4 x 6", lengthRange: "8' - 20'", exposedFace: '5.43"', priceRL: 7.14,  priceFixed: 9.52  },
  // EC RL=$7.38, EC Fixed=$9.84
  { id: "garapa-54x6-sq-grooved", species: "GARAPA",           application: "Decking", profile: "SQUARE S4S E4E - GROOVED",nominalSize: "5/4 x 6", lengthRange: "8' - 20'", exposedFace: '5.43"', priceRL: 7.38,  priceFixed: 9.84  },

  // ── BULLETWOOD / BALATA ────────────────────────────────────────────────────
  // EC RL=$5.09, EC Fixed=$6.78
  { id: "bw-1x6-sq",              species: "BULLETWOOD/BALATA", application: "Decking", profile: "SQUARE S4S E4E",         nominalSize: "1 x 6",   lengthRange: "8' - 20'", exposedFace: '5.43"', priceRL: 5.09,  priceFixed: 6.78  },
  // EC RL=$6.80, EC Fixed=$9.06
  { id: "bw-54x6-sq-solid",       species: "BULLETWOOD/BALATA", application: "Decking", profile: "SQUARE S4S E4E - SOLID",  nominalSize: "5/4 x 6", lengthRange: "8' - 20'", exposedFace: '5.43"', priceRL: 6.80,  priceFixed: 9.06  },
  // EC RL=$7.01, EC Fixed=$9.35
  { id: "bw-54x6-sq-grooved",     species: "BULLETWOOD/BALATA", application: "Decking", profile: "SQUARE S4S E4E - GROOVED",nominalSize: "5/4 x 6", lengthRange: "8' - 20'", exposedFace: '5.43"', priceRL: 7.01,  priceFixed: 9.35  },
];

export const HARDWOOD_SPECIES = Array.from(new Set(HARDWOOD_PRODUCTS.map(p => p.species)));
export const THERMO_SPECIES   = Array.from(new Set(THERMO_PRODUCTS.map(p => p.species)));

// ── ACCOYA ──────────────────────────────────────────────────────────────────
// Prices from spreadsheet (EC RL / EC Fixed)
// NATURAL
// EC RL=$9.70, EC Fixed=$12.93
export const ACCOYA_PRODUCTS: Product[] = [
  { id: "accoya-natural-1x6-sq",        species: "ACCOYA NATURAL",    application: "Cladding / Decking", profile: "SQUARE S4S E4E", nominalSize: "1 x 6",   lengthRange: "8' - 20'", exposedFace: '5.75"', priceRL: 9.70,  priceFixed: 12.93 },
  // EC RL=$12.77, EC Fixed=$17.03
  { id: "accoya-natural-54x6-sq",       species: "ACCOYA NATURAL",    application: "Cladding / Decking", profile: "SQUARE S4S E4E", nominalSize: "5/4 x 6", lengthRange: "8' - 20'", exposedFace: '5.75"', priceRL: 12.77, priceFixed: 17.03 },
  // GREY
  // EC RL=$13.53, EC Fixed=$18.04
  { id: "accoya-grey-1x6-sq",           species: "ACCOYA GREY",       application: "Cladding / Decking", profile: "SQUARE S4S E4E", nominalSize: "1 x 6",   lengthRange: "8' - 20'", exposedFace: '5.75"', priceRL: 13.53, priceFixed: 18.04 },
  // EC RL=$17.49, EC Fixed=$23.32
  { id: "accoya-grey-54x6-sq",          species: "ACCOYA GREY",       application: "Decking",            profile: "SQUARE S4S E4E", nominalSize: "5/4 x 6", lengthRange: "8' - 20'", exposedFace: '5.75"', priceRL: 17.49, priceFixed: 23.32 },
  // IPE-BROWN (prices TBD — $0.00 placeholder)
  { id: "accoya-ipebrown-1x6-sq",       species: "ACCOYA IPE-BROWN",  application: "Decking",            profile: "SQUARE S4S E4E", nominalSize: "1 x 6",   lengthRange: "8' - 20'", exposedFace: '5.75"', priceRL: 0.00,  priceFixed: 0.00  },
  { id: "accoya-ipebrown-54x6-sq",      species: "ACCOYA IPE-BROWN",  application: "Decking",            profile: "SQUARE S4S E4E", nominalSize: "5/4 x 6", lengthRange: "8' - 20'", exposedFace: '5.75"', priceRL: 0.00,  priceFixed: 0.00  },
];

export const ACCOYA_SPECIES = Array.from(new Set(ACCOYA_PRODUCTS.map(p => p.species)));

/** All products combined */
export const ALL_PRODUCTS: Product[] = [...THERMO_PRODUCTS, ...HARDWOOD_PRODUCTS, ...ACCOYA_PRODUCTS];

/** Returns species list for a given category */
export const getSpeciesByCategory = (category: "thermo" | "hardwood" | "accoya"): string[] => {
  if (category === "hardwood") return HARDWOOD_SPECIES;
  if (category === "accoya")   return ACCOYA_SPECIES;
  return THERMO_SPECIES;
};

// ── Filter helpers (use ALL_PRODUCTS so hardwoods are included) ────────────────────

export const getSpecies = (): string[] =>
  Array.from(new Set(ALL_PRODUCTS.map((p) => p.species)));

export const getNominalSizes = (species: string): string[] =>
  Array.from(new Set(ALL_PRODUCTS.filter((p) => p.species === species).map((p) => p.nominalSize)));

export const getProfiles = (species: string, nominalSize: string): string[] =>
  Array.from(new Set(
    ALL_PRODUCTS
      .filter((p) => p.species === species && p.nominalSize === nominalSize)
      .map((p) => p.profile)
  ));

export const findProduct = (
  species: string,
  nominalSize: string,
  profile: string
): Product | undefined =>
  ALL_PRODUCTS.find(
    (p) => p.species === species && p.nominalSize === nominalSize && p.profile === profile
  );

// Legacy compat
export const PRODUCTS = { thermo: THERMO_PRODUCTS, accoya: [], hardwood: HARDWOOD_PRODUCTS };
export const extractWidthFromExposedFace = parseExposedFaceInches;

// ── PROMO / CLEARANCE PRODUCTS ────────────────────────────────────────────────
// Three pricing scenarios (all Random Lengths):
//   Conservador  — 20% global LBM margin
//   Moderado     — 15% global LBM margin
//   Agressivo    — 10% global LBM margin
// Each scenario has: Distributor Base, Dealer 23%, End Customer 40%
// "status" indicates product availability

export type PromoScenario = "conservador" | "moderado" | "agressivo";

export interface PromoProduct {
  id: string;
  species: string;
  profile: string;
  nominalSize: string;
  exposedFace: string;
  newArrival: boolean;
  /** Produto em Linha status */
  status: "Descontinuado" | "A confirmar" | "Em linha";
  /** Prices per scenario: [distBase, dealer23, endCustomer40] */
  conservador: { dist: number; dealer: number; ec: number };
  moderado:    { dist: number; dealer: number; ec: number };
  agressivo:   { dist: number; dealer: number; ec: number };
}

export const PROMO_PRODUCTS: PromoProduct[] = [
  {
    id: "promo-radiata-ng-pf-white-1x6",
    species: "MAXIMO THERMO CLEAR RADIATA",
    profile: "NICKEL GAP - PREFINISHED WHITE",
    nominalSize: "1 x 6",
    exposedFace: '4.6"',
    newArrival: false,
    status: "Descontinuado",
    conservador: { dist: 3.19, dealer: 4.14, ec: 6.90 },
    moderado:    { dist: 3.00, dealer: 3.90, ec: 6.49 },
    agressivo:   { dist: 2.83, dealer: 3.68, ec: 6.13 },
  },
  {
    id: "promo-radiata-ng-pf-black-1x6",
    species: "MAXIMO THERMO CLEAR RADIATA",
    profile: "NICKEL GAP - PREFINISHED BLACK",
    nominalSize: "1 x 6",
    exposedFace: '4.6"',
    newArrival: false,
    status: "Descontinuado",
    conservador: { dist: 3.19, dealer: 4.14, ec: 6.90 },
    moderado:    { dist: 3.00, dealer: 3.90, ec: 6.49 },
    agressivo:   { dist: 2.83, dealer: 3.68, ec: 6.13 },
  },
  {
    id: "promo-radiata-ng-wire-brushed-1x5",
    species: "MAXIMO THERMO CLEAR RADIATA",
    profile: "NICKEL GAP - WIRE BRUSHED",
    nominalSize: "1 x 5",
    exposedFace: '3.7"',
    newArrival: false,
    status: "A confirmar",
    conservador: { dist: 1.95, dealer: 2.53, ec: 4.22 },
    moderado:    { dist: 1.84, dealer: 2.38, ec: 3.97 },
    agressivo:   { dist: 1.73, dealer: 2.25, ec: 3.75 },
  },
  {
    id: "promo-radiata-vj-sq-3x8x4",
    species: "MAXIMO THERMO CLEAR RADIATA",
    profile: "V JOINT / SQUARE BACK",
    nominalSize: "3/8 x 4",
    exposedFace: '3.29"',
    newArrival: false,
    status: "Descontinuado",
    conservador: { dist: 1.00, dealer: 1.30, ec: 2.16 },
    moderado:    { dist: 0.94, dealer: 1.22, ec: 2.04 },
    agressivo:   { dist: 0.89, dealer: 1.15, ec: 1.92 },
  },
  {
    id: "promo-scandinavian-vj-sq-5x8x4",
    species: "MAXIMO THERMO SCANDINAVIAN PINE",
    profile: "V JOINT / SQUARE BACK",
    nominalSize: "5/8 x 4",
    exposedFace: '3.37"',
    newArrival: false,
    status: "Descontinuado",
    conservador: { dist: 0.91, dealer: 1.19, ec: 1.98 },
    moderado:    { dist: 0.86, dealer: 1.12, ec: 1.86 },
    agressivo:   { dist: 0.81, dealer: 1.05, ec: 1.76 },
  },
  {
    id: "promo-ayous-ng-pf-hemel-1x6",
    species: "MAXIMO THERMO AYOUS",
    profile: "NICKEL GAP - PREFINISHED HEMEL",
    nominalSize: "1 x 6",
    exposedFace: '5.26"',
    newArrival: false,
    status: "Descontinuado",
    conservador: { dist: 2.63, dealer: 3.41, ec: 5.68 },
    moderado:    { dist: 2.47, dealer: 3.21, ec: 5.35 },
    agressivo:   { dist: 2.33, dealer: 3.03, ec: 5.05 },
  },
];

export const getPromoPrice = (
  product: PromoProduct,
  scenario: PromoScenario,
  tier: "dist" | "dealer" | "ec"
): number => product[scenario][tier];

