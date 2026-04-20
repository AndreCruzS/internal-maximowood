# AI Agent Handoff Document

**Purpose:** This document provides a structured, machine-readable description of the Maximo Sales Calculator project for any AI agent that needs to continue development, debug issues, or deploy the application. It is designed to be read as context before making any changes.

---

## Project Identity

| Field | Value |
|---|---|
| Project name | Maximo Sales Calculator |
| Repository | `maximo-sales-calculator` |
| Current platform | Manus (managed hosting) |
| Live URL | `quotecalculator.manus.space` |
| Stack | React 19 + TypeScript + Tailwind CSS 4 + tRPC 11 + Express 4 + Drizzle ORM |
| Database (current) | MySQL/TiDB via Manus platform |
| Database (migration target) | PostgreSQL via Supabase |
| Test runner | Vitest |
| Package manager | pnpm |

---

## Critical Business Rules

An AI agent working on this project MUST understand and preserve these rules:

**Pricing formula:** All prices are derived from a base price using true stacked margins (division, not multiplication). The chain is: `base → ÷0.75 → Dist Fixed`, `base → ÷0.77 → Dealer RL`, `Dealer RL → ÷0.75 → Dealer Fixed`, `Dealer RL → ÷0.60 → EC RL`, `EC RL → ÷0.75 → EC Fixed`. Never use markup (multiplication) for price calculations.

**Piece length formula:** When multiple lengths are selected, pieces are distributed equally: `piecesEach = ceil(totalLF ÷ sumOfLengths)`. This is derived from the `ConversãoCBM-LF.xlsx` spreadsheet.

**Inventory data flow:** The app's local database is a read-only cache of André's external Supabase view. Never write inventory data directly — always sync from the external source.

**Password authentication:** The app uses a simple password gate (`VITE_APP_PASSWORD` env var) as the primary access control. The Manus OAuth layer is present but currently not used for access control — all tRPC procedures use `publicProcedure`.

---

## File Map: What to Edit for Common Tasks

| Task | Files to Edit |
|---|---|
| Add a new product | `client/src/lib/products.ts` → add to `THERMO_PRODUCTS` or `HARDWOOD_PRODUCTS` |
| Change end-customer prices | `client/src/lib/products.ts` → update `priceRL` and `priceFixed` fields |
| Change B2B/Dealer/Dist prices | Update the Google Sheet (prices are recalculated server-side from base) |
| Add a new calculator step | `client/src/pages/Calculator.tsx` + `client/src/pages/B2BCalculator.tsx` |
| Add a new tRPC procedure | `server/routers.ts` (or create a new sub-router and import it there) |
| Change the access password | Update `VITE_APP_PASSWORD` secret in the platform secrets panel |
| Add a new DB table | `drizzle/schema.ts` → add table → run `pnpm db:push` |
| Change the PDF quote layout | `client/src/lib/generateQuotePDF.ts` |
| Change the inventory sync schedule | `server/_core/index.ts` → `startInventorySyncCron()` |
| Add a new navigation tab | `client/src/components/AppLayout.tsx` + `client/src/App.tsx` |

---

## Environment Variables Reference

| Variable | Required | Used In | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | `server/db.ts` | MySQL/PostgreSQL connection string |
| `JWT_SECRET` | Yes | `server/_core/cookies.ts` | Session cookie signing |
| `VITE_APP_ID` | Yes | `client/src/const.ts` | Manus OAuth app ID |
| `OAUTH_SERVER_URL` | Yes | `server/_core/oauth.ts` | Manus OAuth backend URL |
| `VITE_OAUTH_PORTAL_URL` | Yes | `client/src/const.ts` | Manus login portal URL |
| `OWNER_OPEN_ID` | Yes | `server/_core/notification.ts` | Owner's Manus user ID |
| `OWNER_NAME` | No | Display only | Owner's display name |
| `VITE_APP_PASSWORD` | Yes | `client/src/contexts/AuthContext.tsx` | App access password |
| `SUPABASE_INVENTORY_URL` | Yes | `server/inventorySync.ts` | André's Supabase project URL |
| `SUPABASE_INVENTORY_ANON_KEY` | Yes | `server/inventorySync.ts` | André's Supabase anon key |
| `BUILT_IN_FORGE_API_URL` | No | `server/_core/llm.ts` | Manus LLM API (unused) |
| `BUILT_IN_FORGE_API_KEY` | No | `server/_core/llm.ts` | Manus LLM API key (unused) |
| `VITE_APP_TITLE` | No | Browser tab title | App display name |
| `VITE_APP_LOGO` | No | AppLayout header | Logo URL |

---

## Known Limitations and Technical Debt

**Hardcoded prices in `products.ts`:** The end-customer calculator uses hardcoded prices that must be manually updated when the price sheet changes. A future improvement would be to fetch these from the Google Sheet at build time or from a cached server endpoint.

**No user accounts:** The app uses a single shared password for all reps. There is no per-user tracking of who generated which quote. The Manus OAuth infrastructure is in place to add this if needed.

**No quote persistence:** Generated quotes exist only in the browser session. They are not saved to the database. A quote history feature would require a new `quotes` table and a save mutation.

**Inventory sync is destructive:** The sync deletes all rows and re-inserts. This means there is a brief window where inventory data is unavailable. A future improvement would use upsert logic keyed on `(branchName, species, nominalSize, profile, lengthFt)`.

**Google Sheet dependency:** The Pricing tab and B2B Calculator depend on the Google Sheet being publicly accessible. If the sheet is unpublished or the URL changes, these features will silently return empty data.

---

## Test Coverage

Tests are in `server/*.test.ts` and run with `pnpm test` (Vitest). Current test count: 75 passing.

| Test File | What It Tests |
|---|---|
| `server/products.test.ts` | Product catalog completeness, price calculations, LF↔sqft conversions |
| `server/b2bCalculator.test.ts` | Multi-length piece count formula, B2B price matching |
| `server/inventorySync.test.ts` | Sync data mapping, new `lengthFt`/`pieces` columns |
| `server/auth.logout.test.ts` | Auth logout procedure (template reference) |

---

## Development Workflow

```bash
pnpm dev          # Start dev server (Express + Vite HMR)
pnpm test         # Run all Vitest tests
pnpm check        # TypeScript type check (0 errors expected)
pnpm db:push      # Generate + apply Drizzle migrations
pnpm build        # Production build → dist/
```

The dev server runs on a dynamic port (not hardcoded). The Vite frontend proxies `/api/*` to the Express backend automatically via `vite.config.ts`.

---

## External Dependencies Summary

| Service | Purpose | Credentials Needed |
|---|---|---|
| Manus Platform | Hosting, DB, OAuth, secrets | Built-in (no manual config) |
| André's Supabase | Inventory source of truth | `SUPABASE_INVENTORY_URL` + `SUPABASE_INVENTORY_ANON_KEY` |
| Google Sheets | Live pricing data | None (public CSV URL) |
| jsPDF | Client-side PDF generation | None (npm package) |

---

## Suggested Next Features (Backlog)

The following features were suggested during development but not yet implemented:

1. **Piece count in PDF quote** — add a "X pcs of Y ft" line per product in the generated PDF.
2. **Packages helper** — show `ceil(totalPieces ÷ piecesPerPkg)` in the results panel (the `piecesPerPkg` column is already in the Google Sheet).
3. **Quote history** — save each generated quote to a `quotes` table with product, LF, price, and rep name.
4. **Inventory availability in Calculator** — after selecting a product in Step 1, show a small "X LF in stock" badge from the inventory data.
5. **Role-based access** — use the existing `role` column in the `users` table to show/hide the B2B Calculator tab from non-rep users.
6. **Automatic price sync** — fetch end-customer prices from the Google Sheet at startup instead of using hardcoded values in `products.ts`.
