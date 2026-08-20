
const SHEET_ID = "1nOe8Ss2ao7LkieFfWuuNa47ALMIhbSbbvkb3hs3aTxU";

/**
 * Tab GIDs in the new pricing sheet (Copy of MAXIMO_Price_Sheet_2026).
 * All three tabs share the same GIDs as the original sheet.
 *
 * Column layout:
 *   THERMO:   Species(0), Application(1), Profile(2), Nominal Size(3), Length(4),
 *             Exposed Face(5), Pieces/Pkg(6), Dist RL(7), Dist Fixed(8),
 *             Dealer RL(9), Dealer Fixed(10), EC RL(11), EC Fixed(12)
 *
 *   HARDWOOD: Species(0), Application(1), Profile(2), Nominal Size(3), Length(4),
 *             Dist RL(5), Dist Fixed(6), Dealer RL(7), Dealer Fixed(8),
 *             EC RL(9), EC Fixed(10)
 *
 *   ACCOYA:   Species(0), Type(1), Application(2), Profile(3), Nominal Size(4),
 *             Length(5), Exposed Face(6), Dist RL(7), Dist Fixed(8),
 *             Dealer RL(9), Dealer Fixed(10), EC RL(11), EC Fixed(12)
 *
 * All price columns are read directly from the sheet (no recalculation).
 * The sheet already contains all 6 tier prices.
 */
const TABS = [
  { name: "THERMO",   gid: "0" },
  { name: "HARDWOOD", gid: "2087042726" },
  { name: "ACCOYA",   gid: "1127570088" },
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

  // Simple CSV parser that handles quoted fields with embedded newlines
  const lines: string[][] = [];
  let current = "";
  let inQuotes = false;
  let currentRow: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      currentRow.push(current); current = "";
    } else if ((ch === '\n' || (ch === '\r' && text[i + 1] !== '\n')) && !inQuotes) {
      currentRow.push(current); current = "";
      lines.push(currentRow); currentRow = [];
    } else if (ch === '\r' && !inQuotes) {
      // skip \r before \n
    } else {
      current += ch;
    }
  }
  if (current || currentRow.length > 0) {
    currentRow.push(current);
    lines.push(currentRow);
  }

  // First 3 rows are headers; data starts at row index 3
  const rows: PricingRow[] = [];
  let currentSpecies = "";
  let currentType = "";

  const isAccoya = tabName === "ACCOYA";
  const isHardwood = tabName === "HARDWOOD";

  for (let i = 3; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.every((c) => !c.trim())) continue;

    if (isAccoya) {
      // ACCOYA: Species(0), Type(1), Application(2), Profile(3), NominalSize(4),
      //         Length(5), ExposedFace(6), DistRL(7), DistFixed(8),
      //         DealerRL(9), DealerFixed(10), EC_RL(11), EC_Fixed(12)
      const species = line[0]?.trim() || currentSpecies;
      if (line[0]?.trim()) currentSpecies = species;
      const type = line[1]?.trim() || currentType;
      if (line[1]?.trim()) currentType = type;
      const application = line[2]?.trim() || "";
      const profile = line[3]?.trim() || "";
      const nominalSize = line[4]?.trim() || "";
      const length = line[5]?.trim() || "";
      const exposedFace = line[6]?.trim() || "";

      const priceDistributor      = parsePrice(line[7]);
      const priceDistributorFixed = parsePrice(line[8]);
      const priceDealer           = parsePrice(line[9]);
      const priceDealerFixed      = parsePrice(line[10]);
      const priceEndCustomer      = parsePrice(line[11]);
      const priceEndCustomerFixed = parsePrice(line[12]);

      if (profile && nominalSize) {
        rows.push({
          category: "ACCOYA",
          species: type ? `${species} - ${type}` : species,
          application,
          profile,
          nominalSize,
          length,
          exposedFace,
          piecesPerPkg: "",
          priceDistributor,
          priceDistributorFixed,
          priceDealer,
          priceDealerFixed,
          priceEndCustomer,
          priceEndCustomerFixed,
        });
      }
    } else if (isHardwood) {
      // HARDWOOD: Species(0), Application(1), Profile(2), NominalSize(3), Length(4),
      //           DistRL(5), DistFixed(6), DealerRL(7), DealerFixed(8),
      //           EC_RL(9), EC_Fixed(10)
      const species = line[0]?.trim() || currentSpecies;
      if (line[0]?.trim()) currentSpecies = species;
      const application = line[1]?.trim() || "";
      const profile = line[2]?.trim() || "";
      const nominalSize = line[3]?.trim() || "";
      const length = line[4]?.trim() || "";

      const priceDistributor      = parsePrice(line[5]);
      const priceDistributorFixed = parsePrice(line[6]);
      const priceDealer           = parsePrice(line[7]);
      const priceDealerFixed      = parsePrice(line[8]);
      const priceEndCustomer      = parsePrice(line[9]);
      const priceEndCustomerFixed = parsePrice(line[10]);

      if (profile && nominalSize && priceDistributor) {
        rows.push({
          category: "HARDWOOD",
          species,
          application,
          profile,
          nominalSize,
          length,
          exposedFace: "",
          piecesPerPkg: "",
          priceDistributor,
          priceDistributorFixed,
          priceDealer,
          priceDealerFixed,
          priceEndCustomer,
          priceEndCustomerFixed,
        });
      }
    } else {
      // THERMO: Species(0), Application(1), Profile(2), NominalSize(3), Length(4),
      //         ExposedFace(5), Pieces/Pkg(6), DistRL(7), DistFixed(8),
      //         DealerRL(9), DealerFixed(10), EC_RL(11), EC_Fixed(12)
      const species = line[0]?.trim() || currentSpecies;
      if (line[0]?.trim()) currentSpecies = species;
      const application = line[1]?.trim() || "";
      const profile = line[2]?.trim() || "";
      const nominalSize = line[3]?.trim() || "";
      const length = line[4]?.trim() || "";
      const exposedFace = line[5]?.trim() || "";
      const piecesPerPkg = line[6]?.trim() || "";

      const priceDistributor      = parsePrice(line[7]);
      const priceDistributorFixed = parsePrice(line[8]);
      const priceDealer           = parsePrice(line[9]);
      const priceDealerFixed      = parsePrice(line[10]);
      const priceEndCustomer      = parsePrice(line[11]);
      const priceEndCustomerFixed = parsePrice(line[12]);

      // Skip add-on rows (Milling, Pre-Finish, etc.) that appear after an empty species block
      if (profile && nominalSize && priceDistributor) {
        rows.push({
          category: "THERMO",
          species,
          application,
          profile,
          nominalSize,
          length,
          exposedFace,
          piecesPerPkg,
          priceDistributor,
          priceDistributorFixed,
          priceDealer,
          priceDealerFixed,
          priceEndCustomer,
          priceEndCustomerFixed,
        });
      }
    }
  }

  return rows;
}

export async function fetchAllPricing(): Promise<PricingRow[]> {
  const results = await Promise.all(TABS.map((tab) => fetchTab(tab.name, tab.gid)));
  return results.flat();
}
