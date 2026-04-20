import { publicProcedure, router } from "./_core/trpc";

const SHEET_ID = "1I7cW-6kntiUWl-V2dSYS5MqkafsoJpZHu_Sgt-wADqw";

const TABS = [
  { name: "THERMO", gid: "0" },
  { name: "HARDWOOD", gid: "2087042726" },
  { name: "ACCOYA", gid: "1127570088" },
];

export interface PricingRow {
  category: string;
  species: string;
  application: string;
  profile: string;
  nominalSize: string;
  length: string;
  exposedFace: string;
  piecesPerPkg: string;
  priceDistributor: number | null;
  priceDistributorFixed: number | null;
  priceDealer: number | null;
  priceDealerFixed: number | null;
  priceEndCustomer: number | null;
  priceEndCustomerFixed: number | null;
}

/**
 * Recalculate all tier prices from the base (Distributor RL) price
 * using true margins (divide, not multiply):
 *
 *   Dist RL     = base
 *   Dist Fixed  = base / 0.75        (25% margin on base)
 *   Dealer RL   = base / 0.77        (23% margin on base)
 *   Dealer Fixed= base / 0.77 / 0.75 (25% margin on Dealer RL)
 *   EC RL       = base / 0.77 / 0.60 (40% margin on Dealer RL)
 *   EC Fixed    = base / 0.77 / 0.60 / 0.75 (25% margin on EC RL)
 */
function recalcFromBase(base: number | null): {
  priceDistributor: number | null;
  priceDistributorFixed: number | null;
  priceDealer: number | null;
  priceDealerFixed: number | null;
  priceEndCustomer: number | null;
  priceEndCustomerFixed: number | null;
} {
  if (base === null) {
    return {
      priceDistributor: null,
      priceDistributorFixed: null,
      priceDealer: null,
      priceDealerFixed: null,
      priceEndCustomer: null,
      priceEndCustomerFixed: null,
    };
  }
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const distFixed  = base / 0.75;
  const dealerRL   = base / 0.77;
  const dealerFixed = dealerRL / 0.75;
  const ecRL       = dealerRL / 0.60;
  const ecFixed    = ecRL / 0.75;
  return {
    priceDistributor:      round2(base),
    priceDistributorFixed: round2(distFixed),
    priceDealer:           round2(dealerRL),
    priceDealerFixed:      round2(dealerFixed),
    priceEndCustomer:      round2(ecRL),
    priceEndCustomerFixed: round2(ecFixed),
  };
}

function parsePrice(val: string | undefined): number | null {
  if (!val) return null;
  const cleaned = val.replace(/\$/g, "").replace(/,/g, "").trim();
  const num = parseFloat(cleaned);
  return isNaN(num) || num === 0 ? null : num;
}

async function fetchTab(tabName: string, gid: string): Promise<PricingRow[]> {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${tabName} tab: ${res.status}`);
  const text = await res.text();

  // Simple CSV parser that handles quoted fields
  const lines: string[][] = text.split(/\r?\n/).map((row) => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '"') {
        if (inQuotes && row[i + 1] === '"') { current += '"'; i++; }
        else { inQuotes = !inQuotes; }
      } else if (ch === ',' && !inQuotes) {
        result.push(current); current = "";
      } else {
        current += ch;
      }
    }
    result.push(current);
    return result;
  });

  // First 3 rows are headers (price tier labels, percentages, column names)
  // Data starts at row index 3
  // Column 7 (index 7) is always the base price (Distributor RL / Preço Base)
  const rows: PricingRow[] = [];
  let currentSpecies = "";
  let currentType = ""; // for ACCOYA which has a "Type" column

  const isAccoya = tabName === "ACCOYA";
  const isHardwood = tabName === "HARDWOOD";

  for (let i = 3; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.every((c) => !c.trim())) continue;

    if (isAccoya) {
      // ACCOYA columns: Species, Type, Application, Profile, Nominal Size, Length, (empty), base $/LF, ...
      const species = line[0]?.trim() || currentSpecies;
      if (line[0]?.trim()) currentSpecies = species;
      const type = line[1]?.trim() || currentType;
      if (line[1]?.trim()) currentType = type;
      const application = line[2]?.trim() || "";
      const profile = line[3]?.trim() || "";
      const nominalSize = line[4]?.trim() || "";
      const length = line[5]?.trim() || "";
      const base = parsePrice(line[7]); // col 7 = base price
      const prices = recalcFromBase(base);

      if (profile && nominalSize) {
        rows.push({
          category: tabName,
          species: type ? `${species} - ${type}` : species,
          application,
          profile,
          nominalSize,
          length,
          exposedFace: line[6]?.trim() || "",
          piecesPerPkg: "",
          ...prices,
        });
      }
    } else if (isHardwood) {
      // HARDWOOD columns: Species, Application, Profile, Nominal Size, Length, base $/LF, ...
      const species = line[0]?.trim() || currentSpecies;
      if (line[0]?.trim()) currentSpecies = species;
      const application = line[1]?.trim() || "";
      const profile = line[2]?.trim() || "";
      const nominalSize = line[3]?.trim() || "";
      const length = line[4]?.trim() || "";
      const base = parsePrice(line[5]); // col 5 = base price
      const prices = recalcFromBase(base);

      if (profile && nominalSize && base) {
        rows.push({
          category: tabName,
          species,
          application,
          profile,
          nominalSize,
          length,
          exposedFace: "",
          piecesPerPkg: "",
          ...prices,
        });
      }
    } else {
      // THERMO columns: Species, Application, Profile, Nominal Size, Length, Exposed Face, Pieces per Package, base $/LF, ...
      const species = line[0]?.trim() || currentSpecies;
      if (line[0]?.trim()) currentSpecies = species;
      const application = line[1]?.trim() || "";
      const profile = line[2]?.trim() || "";
      const nominalSize = line[3]?.trim() || "";
      const length = line[4]?.trim() || "";
      const exposedFace = line[5]?.trim() || "";
      const piecesPerPkg = line[6]?.trim() || "";
      const base = parsePrice(line[7]); // col 7 = base price
      const prices = recalcFromBase(base);

      if (profile && nominalSize && base) {
        rows.push({
          category: tabName,
          species,
          application,
          profile,
          nominalSize,
          length,
          exposedFace,
          piecesPerPkg,
          ...prices,
        });
      }
    }
  }

  return rows;
}

export const pricingRouter = router({
  getAll: publicProcedure.query(async () => {
    const results = await Promise.all(
      TABS.map((tab) => fetchTab(tab.name, tab.gid))
    );
    return results.flat();
  }),
});
