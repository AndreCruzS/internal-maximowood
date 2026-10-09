import type { CompanyId } from "@/lib/intranet";

/**
 * Official brand kits, from each brand's guide. Files live in the private
 * "brand-kit" storage bucket and are opened through /brand-kit/<path> (signed-in
 * only). Logos for the brand page header are public in /public/brand/logos.
 * Extra kit files can be added by any department as "Brand kit" documents.
 */
export type BrandKit = {
  logo: string | null;
  /** Background the logo is designed for (US4's is on black). */
  logoBg: string;
  palette: { name: string; hex: string; note?: string }[];
  fonts: { name: string; use: string }[];
  files: { title: string; path: string; kind: "guide" | "logo"; size: string }[];
};

export const BRAND_KITS: Record<CompanyId, BrandKit> = {
  gmx: {
    logo: "/brand/gmx-logo-color.png",
    logoBg: "#ffffff",
    palette: [{ name: "GMX Green", hex: "#009f67" }],
    fonts: [],
    files: [],
  },
  maximo: {
    logo: "/logos/logo-maximo-tagline-black.png",
    logoBg: "#ffffff",
    palette: [
      { name: "Ipe Yellow", hex: "#f6ca21", note: "CMYK 5 20 90 0 · 5%" },
      { name: "Black", hex: "#000000", note: "15%" },
      { name: "Graphite", hex: "#3f3e3e", note: "CMYK 0 0 0 90 · 30%" },
      { name: "White", hex: "#ffffff", note: "50%" },
    ],
    fonts: [
      { name: "Artega", use: "Main brand, tagline and product brands" },
      { name: "Anybody", use: "Titles (ExtraExpanded) and body texts" },
    ],
    files: [{ title: "Maximo Brand Guide (v7)", path: "maximo/maximo-brand-guide-v7.pdf", kind: "guide", size: "17 MB" }],
  },
  lumberplus: {
    logo: "/brand/logos/lumberplus.png",
    logoBg: "#ffffff",
    palette: [
      { name: "Lumber Plus Yellow", hex: "#f6b015", note: "Pantone 1235 C" },
      { name: "Black", hex: "#000000" },
      { name: "White", hex: "#ffffff" },
      { name: "Gray", hex: "#727272", note: "Secondary" },
      { name: "Charcoal", hex: "#242424", note: "Secondary" },
      { name: "Light gray", hex: "#d6d6d6", note: "Secondary" },
    ],
    fonts: [{ name: "Montserrat", use: "All texts (Light to Extra Black)" }],
    files: [{ title: "Lumber Plus Brand Book (v3)", path: "lumberplus/lumberplus-brand-book-v3.pdf", kind: "guide", size: "5.7 MB" }],
  },
  us4pro: {
    logo: "/brand/logos/us4pro.png",
    logoBg: "#000000",
    palette: [
      { name: "Proud Blue", hex: "#2573f2", note: "Pantone 285 C" },
      { name: "Black", hex: "#000000", note: "Pantone Black 6 C" },
      { name: "Off-white", hex: "#f4f4f4" },
      { name: "White", hex: "#ffffff" },
    ],
    fonts: [
      { name: "TT Fors", use: "Primary" },
      { name: "Uniform Extra Condensed", use: "Primary" },
      { name: "Brothers", use: "Secondary" },
    ],
    files: [{ title: "US4 Brand Book", path: "us4pro/us4-brand-guide.pdf", kind: "guide", size: "37 MB" }],
  },
  builderexpress: {
    logo: "/brand/logos/builderexpress.png",
    logoBg: "#ffffff",
    palette: [
      { name: "Builder Teal", hex: "#09adbe", note: "From the logo" },
      { name: "Deep Teal", hex: "#08393f", note: "From the logo" },
    ],
    fonts: [],
    files: [{ title: "Builder Express logo (all versions)", path: "builderexpress/builderexpress-logo-color.pdf", kind: "logo", size: "650 KB" }],
  },
  globallbm: {
    logo: "/brand/logos/globallbm.png",
    logoBg: "#ffffff",
    palette: [
      { name: "Global Green", hex: "#4bc660", note: "From the logo" },
      { name: "Forest", hex: "#1c453a", note: "From the logo" },
    ],
    fonts: [],
    files: [{ title: "Global LBM logo (vertical, PNG)", path: "globallbm/globallbm-logo-vertical.png", kind: "logo", size: "17 KB" }],
  },
};
