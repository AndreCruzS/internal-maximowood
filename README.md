# Maximo Sales Calculator

Internal sales tool for the Maximo Concierge team — end-customer calculator, B2B calculator (Distributor/Dealer), live inventory, price list and PDF quote generation.

Originally built on the Manus platform (Vite + Express + tRPC); migrated to **Next.js for deployment on Vercel with Supabase**, at feature parity with the Manus app.

## Stack

- **Next.js 16** (App Router) + React 19 + TypeScript
- **Tailwind CSS 4** (design tokens in `src/app/globals.css`, Anybody font via `next/font`)
- **jsPDF** for client-side quote PDFs (assets in `public/pdf/`)
- **Supabase** ×2:
  - *External (read-only):* André's `maximo_inventory_view` — live inventory for the Inventory tab and the Quote Modal stock check
  - *Own project:* `users`, `inventory`, `inventorySyncLog` tables (see `supabase/migrations/`), written by the nightly sync
- **Google Sheets** (CSV export) — live price list for the Pricing tab and B2B calculator

## Routes

| Route | Purpose |
|---|---|
| `/` | End-customer Calculator (Thermo / Hardwood / Accoya, add-ons, waste, piece lengths, promo pricing, quote cart) |
| `/b2b` | B2B Calculator (Distributor / Dealer tiers, live sheet prices) |
| `/inventory` | Live inventory by product/branch with per-SKU lengths |
| `/pricing` | Full price list, all 6 tiers + promo scenarios |
| `/login` | Supabase Auth sign-in (email + password) |
| `/api/inventory` | GET — live grouped inventory (legacy `inventory.getAll`) |
| `/api/pricing` | GET — parsed price sheet, all 3 tabs (legacy `pricing.getAll`) |
| `/api/cron/inventory-sync` | Vercel Cron, daily 11:00 UTC (legacy nightly sync) |

## Auth

**Supabase Auth (email + password)** via `@supabase/ssr`; `src/middleware.ts` gates every page and API route on the Supabase session. Users are managed in Supabase Dashboard → Authentication → Users: currently a single shared team account (same everyone-knows-it password as on Manus); individual accounts can be added later with no code change. With Supabase unconfigured the app fails closed (only `/login` is reachable).

## Development

```bash
pnpm install
cp .env.example .env.local   # fill in NEXT_PUBLIC_SUPABASE_*, SUPABASE_INVENTORY_*
pnpm dev
```

`pnpm test` runs vitest (75 tests: product data integrity, B2B matching, inventory grouping, live pricing-sheet integration). `pnpm check` runs the TypeScript compiler. `pnpm build` produces the production build.

Without `SUPABASE_INVENTORY_*` credentials the app still runs — the Inventory tab and the Quote Modal stock check show an error state; everything else works.

## Deploy (Vercel)

1. Create the app's own Supabase project and run `supabase/migrations/*.sql` in the SQL Editor (or `supabase db push`).
2. Import this repo into Vercel and set every variable from `.env.example`.
3. `vercel.json` registers the nightly inventory-sync cron; Vercel calls it with `Authorization: Bearer $CRON_SECRET`.

## Parity notes (vs. the Manus app)

- The Manus platform scaffolding (`server/_core`, Manus OAuth, Forge LLM/storage/maps helpers, TiDB/MySQL, tRPC, wouter) was not carried over — none of it was used by the app's real features.
- The nightly inventory sync is kept for parity and now writes to the app's own Supabase, but **nothing reads those tables**: the Inventory tab reads André's view live (that refactor happened while still on Manus; the legacy cron just was never turned off).
- End-customer prices remain hardcoded in `src/lib/products.ts` (as in the legacy app); B2B/Pricing read the Google Sheet live.
- PDF/brand assets were copied from the Manus CDN into `public/` (`pdf/`, `logos/`), so nothing depends on Manus at runtime.
- Quotes are generated client-side and are not persisted anywhere (legacy behavior).
