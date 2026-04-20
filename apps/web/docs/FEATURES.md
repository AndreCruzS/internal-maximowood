# Features

## 1. End-Customer Calculator (`client/src/pages/Calculator.tsx`)

The main calculator guides a sales rep through 7 sequential steps to produce an accurate material estimate for an end customer.

### Step Flow

| Step | Input | Notes |
|---|---|---|
| 1 | Species + Profile + Size | Cascading dropdowns filtered from `THERMO_PRODUCTS` / `HARDWOOD_PRODUCTS` |
| 2 | Length Type (RL or Fixed) | Switches between `priceRL` and `priceFixed` |
| 3 | Piece Lengths | Optional — select one or multiple lengths (ft) for piece count calculation |
| 4 | Quantity (LF or Sqft) | Input mode toggle; sqft↔LF conversion uses `exposedFace` width |
| 5 | Waste Factor | Preset options (5%, 10%, 15%, 20%) or custom percentage |
| 6 | Add-ons | Milling (+$0.50/LF), Pre-Finish color (+$0.75/LF), Pre-Finish texture (+$0.50/LF) |
| 7 | Coating | Select a coating product; calculates cans needed based on coverage rate and sqft |

### Piece Length Calculation (Step 3)

When one or more lengths are selected, the calculator computes:

```typescript
// Equal distribution formula (from ConversãoCBM-LF.xlsx)
const sumLengths = selectedLengths.reduce((a, b) => a + b, 0);
const piecesEach = Math.ceil(wastedLF / sumLengths);
const totalPieces = piecesEach * selectedLengths.length;
const actualLF = piecesEach * sumLengths;
```

This handles both single fixed lengths (e.g. "all 12ft boards") and mixed-length orders (e.g. "equal quantities of 7, 8, 9, and 10ft boards"). The actual LF purchased will be slightly higher than the requested LF due to rounding up.

### Results Display

The results panel shows: raw LF/sqft, wasted LF/sqft, price per LF, material cost, add-on cost breakdown, total cost, coating cans needed, and the piece count breakdown table (when lengths are selected).

### Cart and Quote Generation

Reps can add multiple products to a cart and generate a single PDF quote. The cart persists in component state during the session. The `QuoteModal` component handles the cart display and calls `generateQuotePDF()` to produce the PDF client-side using `jsPDF`.

```typescript
// QuoteModal.tsx — key props
interface QuoteCartItem {
  product: Product;
  lengthType: LengthType;
  requestedLF: number;
  wastedLF: number;
  pricePerLF: number;
  materialCost: number;
  addOnCost: number;
  totalCost: number;
  addOnBreakdown: { label: string; amount: number }[];
  coatingLabel: string;
  coatingCans: number | null;
  pieceLengthResult: PieceLengthResult | null;
}
```

---

## 2. B2B Calculator (`client/src/pages/B2BCalculator.tsx`)

Identical 7-step flow to the end-customer calculator, but with a **Distributor / Dealer toggle** at the top that switches the price tier. Prices are fetched live from the Google Sheet via `trpc.pricing.getAll.useQuery()` and matched to the selected product by species + profile + nominal size.

The toggle changes the price column used:

```typescript
const pricePerLF = tier === "distributor"
  ? matchedRow.priceDistributor ?? 0
  : matchedRow.priceDealer ?? 0;
```

For Fixed length type, `priceDistributorFixed` or `priceDealerFixed` is used instead.

---

## 3. Inventory Browser (`client/src/pages/Inventory.tsx`)

Displays all products in stock across all Maximo branches. Data is fetched from `trpc.inventory.getAll` which returns pre-grouped `InventoryItem[]`.

Each product card shows:
- Species, profile, nominal size
- Total LF across all branches (gold badge)
- Per-branch rows with total LF
- Per-length breakdown inline under each branch (length ft · pieces · LF)

Filtering is available by species, branch, and text search. A "Sync Supabase" button triggers `trpc.inventory.syncNow` to pull fresh data immediately.

---

## 4. Pricing Table (`client/src/pages/Pricing.tsx`)

Fetches all rows from `trpc.pricing.getAll` (which reads 3 Google Sheet tabs: THERMO, HARDWOOD, ACCOYA) and displays them in a searchable, filterable table. Six price tier columns are shown, color-coded by tier. The tier labels clearly indicate the margin percentage applied.

---

## 5. PDF Quote Generation (`client/src/lib/generateQuotePDF.ts`)

Uses `jsPDF` to generate a multi-page PDF quote entirely in the browser. The quote includes:
- Maximo Thermo logo and header
- Customer name and date
- Line items table (product, LF, price/LF, total)
- Add-on breakdown per line item
- Coating requirements
- Grand total
- Optional notes field

The PDF is triggered by the "Download Quote" button in `QuoteModal.tsx` and opens in a new browser tab.

---

## 6. Password Authentication (`client/src/contexts/AuthContext.tsx`)

A lightweight password gate that reads `import.meta.env.VITE_APP_PASSWORD` (set via the `VITE_APP_PASSWORD` environment variable). The authenticated state is stored in `localStorage` so the rep stays logged in across page refreshes.

```typescript
// AuthContext.tsx — core logic
const CORRECT_PASSWORD = import.meta.env.VITE_APP_PASSWORD ?? "Maximo@26";

const login = (password: string): boolean => {
  if (password === CORRECT_PASSWORD) {
    localStorage.setItem("maximo_auth", "true");
    setIsAuthenticated(true);
    return true;
  }
  return false;
};
```

---

## 7. Product Catalog (`client/src/lib/products.ts`)

The product catalog is a hardcoded TypeScript array of `Product` objects. Each product has:

```typescript
interface Product {
  id: string;
  species: string;
  application: string;
  profile: string;
  nominalSize: string;
  lengthRange: string;
  exposedFace: string;   // e.g. '5.26"' — used for sqft↔LF conversion
  priceRL: number;       // End Customer Random Length price ($/LF)
  priceFixed: number;    // End Customer Fixed Length price ($/LF)
}
```

Prices are pre-calculated from the 2026 price sheet using the correct stacked margin formula. The catalog is split into `THERMO_PRODUCTS` and `HARDWOOD_PRODUCTS` arrays, combined into `ALL_PRODUCTS`.

Helper functions exported from `products.ts`:

| Function | Purpose |
|---|---|
| `getSpecies(products)` | Returns unique species list |
| `getNominalSizes(products, species, profile)` | Cascading filter |
| `getProfiles(products, species)` | Cascading filter |
| `findProduct(species, profile, size)` | Exact product lookup |
| `getPrice(product, lengthType)` | Returns RL or Fixed price |
| `parseExposedFaceInches(str)` | Parses `'5.26"'` → `5.26` |
| `lfToSqft(lf, exposedFaceIn)` | LF × (exposedFace/12) |
| `sqftToLf(sqft, exposedFaceIn)` | Inverse of above |
| `applyWaste(lf, wasteId)` | Applies waste percentage |
| `calculateAddOnCost(lf, config)` | Sums all add-on costs |
| `calculateCoatingNeeded(sqft, coatingId)` | Returns cans needed |
