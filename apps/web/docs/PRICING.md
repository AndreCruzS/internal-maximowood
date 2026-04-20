# Pricing System

## Overview

All prices in the Maximo Sales Calculator are derived from a single **base price** (Distributor Random Length) using a chain of **true margins** (division, not multiplication). The pricing data is sourced from a Google Sheet that is publicly accessible via a published CSV URL.

> **Important distinction:** A 25% **margin** means `price = cost ÷ 0.75`, which yields a higher price than a 25% **markup** (`price = cost × 1.25`). All formulas in this system use true margins.

---

## Pricing Chain

The six commercial tiers are calculated as follows, starting from the base price:

| Tier | Formula | Margin Applied |
|---|---|---|
| **Distributor RL** | `base` | — (this IS the base price) |
| **Distributor Fixed** | `base ÷ 0.75` | 25% margin on base |
| **Dealer RL** | `base ÷ 0.77` | 23% margin on base |
| **Dealer Fixed** | `base ÷ 0.77 ÷ 0.75` | 25% margin on Dealer RL |
| **End Customer RL** | `base ÷ 0.77 ÷ 0.60` | 40% margin on Dealer RL |
| **End Customer Fixed** | `base ÷ 0.77 ÷ 0.60 ÷ 0.75` | 25% margin on EC RL |

### Verification Example (Ayous 1x6)

```
Base (Dist RL):      $2.69
Dist Fixed:          $2.69 ÷ 0.75  = $3.59
Dealer RL:           $2.69 ÷ 0.77  = $3.49
Dealer Fixed:        $3.49 ÷ 0.75  = $4.66
EC RL:               $3.49 ÷ 0.60  = $5.82
EC Fixed:            $5.82 ÷ 0.75  = $7.76
```

---

## Google Sheet Integration

### Sheet Structure

The pricing data lives in a Google Sheet with three tabs:

| Tab Name | Content |
|---|---|
| `THERMO` | Thermally modified wood products |
| `HARDWOOD` | Hardwood products (Ipe, Cumaru, Garapa, etc.) |
| `ACCOYA` | Accoya products |

Each tab has the following columns (row 1 = headers):

```
A: Species
B: Profile
C: Nominal Size
D: Base Price (Dist RL)
E: Dist Fixed
F: Dealer RL
G: Dealer Fixed
H: EC RL
I: EC Fixed
J: Pieces per Package
```

### Server-Side Parser (`server/pricingRouter.ts`)

The pricing router fetches the Google Sheet CSV and recalculates all tier prices from the base price column (column D), **ignoring** the pre-calculated values in columns E–I. This ensures the app always uses the correct margin formula regardless of what is in the sheet.

```typescript
// server/pricingRouter.ts — core recalculation logic
function recalcFromBase(base: number) {
  const distRL    = base;
  const distFixed = round2(base / 0.75);
  const dealerRL  = round2(base / 0.77);
  const dealerFixed = round2(dealerRL / 0.75);
  const ecRL      = round2(dealerRL / 0.60);
  const ecFixed   = round2(ecRL / 0.75);
  return { distRL, distFixed, dealerRL, dealerFixed, ecRL, ecFixed };
}

// Called for each row parsed from the CSV
const prices = recalcFromBase(parseFloat(row[3])); // column D = base
```

### Google Sheet URL Format

```typescript
const SHEET_ID = "1abc...xyz";  // from the sheet URL
const TAB_NAME = "THERMO";
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(TAB_NAME)}`;
```

The sheet must be published to the web ("File → Share → Publish to web → CSV") for this URL to work without authentication.

---

## Hardcoded Prices in `products.ts`

The end-customer calculator uses **hardcoded prices** in `client/src/lib/products.ts` rather than fetching from the Google Sheet. This was a deliberate design choice for performance — the calculator works offline and loads instantly without waiting for a network request.

These prices were last updated from the **MAXIMO_Price_Sheet_2026(2).xlsx** file in April 2026 using the correct stacked margin formula. They must be manually updated whenever the base prices change.

```typescript
// Example product entry in products.ts
{
  id: "ayous-1x6-vj",
  species: "Maximo Thermo Ayous",
  profile: "V Joint / Square Back",
  nominalSize: "1x6",
  exposedFace: '5.26"',
  priceRL: 5.82,      // base / 0.77 / 0.60
  priceFixed: 7.76,   // base / 0.77 / 0.60 / 0.75
}
```

The B2B Calculator and Pricing tab always use **live prices from the Google Sheet**, so they are always up to date.

---

## Add-On Pricing

Add-ons are flat per-LF surcharges applied after the base price:

| Add-On | Cost per LF |
|---|---|
| Milling | +$0.50 |
| Pre-Finish (Color) | +$0.75 |
| Pre-Finish (Texture) | +$0.50 |

These values are hardcoded in `products.ts` in the `ADD_ONS` constant and are not tier-dependent.

---

## Coating Pricing

Coating products are listed in the `COATINGS` array in `products.ts`. Each coating has:
- A display name
- A price per can
- A coverage rate (sqft per can)

The calculator computes `Math.ceil(totalSqft / coverageRate)` to determine the number of cans needed.
