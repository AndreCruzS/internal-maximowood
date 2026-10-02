/**
 * Match a calculator line (species / profile / size as the calculator names
 * them) to a row of the Maximo inventory view, whose names differ
 * ("THERMO® AYOUS" vs "Maximo Thermo Ayous", "V JOINT / NICKEL GAP" vs
 * "VJoint - Nickel Gap", "1 x 6" vs "1x6").
 */

export type LengthEntry = {
  lengthFt: number | null;
  pieces: number | null;
  stockLf: number;
};

export type InventoryItem = {
  specie: string;
  category: string;
  model: string;
  profile: string;
  size: string;
  branches: { branch: string; totalLF: number; lengths: LengthEntry[] }[];
  totalLF: number;
  isUnmapped: boolean;
};

// ── Normalize helpers ─────────────────────────────────────────────────────────
/**
 * Canonical species map — same as server-side SPECIES_CANONICAL.
 * Maps any variant to a single canonical token for matching.
 */
const SPECIES_CANONICAL_CLIENT: Record<string, string> = {
  // Ayous
  "thermo ayous": "ayous", "maximo thermo ayous": "ayous", "maximo thermo ayous dark": "ayous",
  "maximo thermo ayous jpl": "ayous", "ayous": "ayous", "thermowood ayous": "ayous",
  // Ash
  "thermowood ash": "ash", "maximo thermo ash": "ash", "thermo ash": "ash",
  // Radiata
  "thermo radiata": "radiata", "maximo thermo clear radiata": "radiata",
  "thermo clear radiata": "radiata", "radiata": "radiata",
  // Pine
  "thermo pine": "pine", "maximo thermo scandinavian pine": "pine",
  "thermo scandinavian pine": "pine", "scandinavian pine": "pine", "scandinavian": "pine",
  // IPE
  "ipe": "ipe", "ipeb": "ipe", "ipe b": "ipe",
  // Accoya
  "accoya": "accoya", "maximo accoya": "accoya", "accoya radiata pine": "accoya",
  // Angelim
  "angelim": "angelim", "angelim pedra": "angelim",
  // Massaranduba
  "massaranduba": "massaranduba", "massaranduba bullet wood": "massaranduba",
  // Others
  "cumaru": "cumaru", "garapa": "garapa", "tigerwood": "tigerwood",
  "wawa": "wawa", "ironthermo": "ironthermo",
  // Bulletwood / Balata
  "bulletwood/balata": "bulletwood", "bulletwood": "bulletwood", "balata": "bulletwood",
  "bulletwood balata": "bulletwood",
};

const normalizeSpecies = (s: string): string[] => {
  const lower = s.toLowerCase().trim();
  const canonical = SPECIES_CANONICAL_CLIENT[lower];
  if (canonical) return [canonical];
  // Fallback: substring matching
  if (lower.includes("ayous")) return ["ayous"];
  if (lower.includes("ash")) return ["ash"];
  if (lower.includes("scandinavian") || lower.includes("pine")) return ["pine"];
  if (lower.includes("radiata") || lower.includes("clear")) return ["radiata"];
  if (lower.includes("ipe")) return ["ipe"];
  if (lower.includes("accoya")) return ["accoya"];
  if (lower.includes("angelim")) return ["angelim"];
  if (lower.includes("massaranduba")) return ["massaranduba"];
  if (lower.includes("cumaru")) return ["cumaru"];
  if (lower.includes("garapa")) return ["garapa"];
  if (lower.includes("tigerwood")) return ["tigerwood"];
  if (lower.includes("wawa")) return ["wawa"];
  if (lower.includes("bullet") || lower.includes("balata")) return ["bulletwood"];
  return [lower];
};

const normalizeProfile = (p: string): string[] => {
  const lower = p.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
  const tokens: string[] = [];
  if (lower.includes("nickel") || lower.includes("ng")) tokens.push("nickel");
  // "s4s e4e" and "square" (without nickel or back) → s4s
  if (lower.includes("s4s") || (lower.includes("square") && !lower.includes("nickel") && !lower.includes("back"))) tokens.push("s4s");
  // "square back" or "v joint / square back" → squareback + vjoint
  if (lower.includes("square back") || lower.includes("sq back") || lower.includes("sq/back")) tokens.push("squareback");
  if (lower.includes("vjoint") || lower.includes("v joint") || lower.includes("v-joint")) tokens.push("vjoint");
  if (lower.includes("fluted")) tokens.push("fluted");
  if (lower.includes("jpl")) tokens.push("jpl");
  if (lower.includes("end match")) tokens.push("end match");
  if (lower.includes("rough")) tokens.push("rough");
  if (lower.includes("decking") || lower.includes("deck")) tokens.push("deck");
  if (lower.includes("solid")) tokens.push("solid");
  if (lower.includes("grooved")) tokens.push("grooved");
  if (lower.includes("opx")) tokens.push("opx");
  // Prefinished / wire brushed — match against inventory profile_finish strings
  if (lower.includes("prefinish") || lower.includes("pre finish") || lower.includes("pre-finish") || lower.includes("pf ") || lower.includes(" pf") || lower.endsWith(" pf")) tokens.push("prefinish");
  if (lower.includes("wire brush") || lower.includes("wirebrushed")) tokens.push("wirebrushed");
  if (lower.includes("hemel")) tokens.push("hemel");
  if (lower.includes("white")) tokens.push("white");
  if (lower.includes("black")) tokens.push("black");
  if (tokens.length === 0) tokens.push(lower);
  return tokens;
};

const normalizeSize = (s: string): string =>
  s.toLowerCase().replace(/\s*x\s*/g, "x").replace(/\s+/g, "");

export function findInventoryMatch(inventoryItems: InventoryItem[], speciesKey: string, profileKey: string, sizeKey: string): InventoryItem | null {
  const specTokens = normalizeSpecies(speciesKey);
  const profTokens = normalizeProfile(profileKey);
  const normSize = normalizeSize(sizeKey);

  let bestItem: InventoryItem | null = null;
  let bestScore = 0;

  for (const item of inventoryItems) {
    const invSpecieRaw = (item.specie ?? "").toLowerCase().trim();
    // Resolve inventory species to canonical token too
    const invSpecieCanonical = SPECIES_CANONICAL_CLIENT[invSpecieRaw] ?? invSpecieRaw;
    // Also normalize the inventory profile for token matching
    const invProfileRaw = (item.profile ?? "").toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
    const invProfileTokens = normalizeProfile(item.profile ?? "");
    const invSize = normalizeSize(item.size ?? "");

    // Size must match exactly (after normalization)
    if (invSize !== normSize) continue;

    // Species: calculator token must appear in inventory canonical OR raw species string
    const specScore = specTokens.filter((t: string) => invSpecieCanonical.includes(t) || invSpecieRaw.includes(t)).length;
    if (specScore === 0) continue;

    // Profile: score based on how many calculator profile tokens appear in inventory profile
    // Use both raw substring match AND token-to-token overlap for better coverage
    const profScore = profTokens.filter((t: string) =>
      invProfileRaw.includes(t) || invProfileTokens.includes(t)
    ).length;
    if (profScore === 0) continue;

    const totalScore = specScore * 10 + profScore;
    if (totalScore > bestScore) {
      bestScore = totalScore;
      bestItem = item;
    }
  }
  return bestItem;
}

