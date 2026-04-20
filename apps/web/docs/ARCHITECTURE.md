# Architecture

## System Overview

The application is a **full-stack TypeScript monorepo** with a React SPA frontend and an Express API backend, communicating exclusively through tRPC. Both frontend and backend are compiled from the same repository and deployed as a single unit.

```
Browser (React SPA)
  │
  │  /api/trpc/*  (tRPC HTTP batch)
  ▼
Express Server (Node.js)
  ├── tRPC Router
  │     ├── auth.*          (login/logout/me)
  │     ├── inventory.*     (getAll, syncNow, getSyncLog)
  │     └── pricing.*       (getAll)
  │
  ├── MySQL/TiDB Database   ← Drizzle ORM
  │     ├── users
  │     ├── inventory
  │     └── inventory_sync_log
  │
  ├── External: Supabase    ← maximo_inventory_view (André's DB)
  └── External: Google Sheets ← Pricing data (3 tabs)
```

## Directory Structure

```
maximo-sales-calculator/
├── client/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Calculator.tsx      # End-customer calculator (7 steps)
│   │   │   ├── B2BCalculator.tsx   # B2B calculator (Distributor/Dealer)
│   │   │   ├── Inventory.tsx       # Live inventory browser
│   │   │   ├── Pricing.tsx         # Live pricing table (6 tiers)
│   │   │   └── Login.tsx           # Password gate
│   │   ├── components/
│   │   │   ├── AppLayout.tsx       # Top nav with 4 tabs
│   │   │   ├── QuoteModal.tsx      # Cart + PDF quote generator
│   │   │   └── ui/                 # shadcn/ui component library
│   │   ├── lib/
│   │   │   ├── products.ts         # Product catalog + pricing functions
│   │   │   └── generateQuotePDF.ts # jsPDF quote generation
│   │   ├── contexts/
│   │   │   └── AuthContext.tsx     # Password auth state
│   │   └── lib/trpc.ts             # tRPC client binding
│   └── index.html
│
├── server/
│   ├── _core/
│   │   ├── index.ts        # Express app entry point + cron scheduler
│   │   ├── trpc.ts         # tRPC context, publicProcedure, protectedProcedure
│   │   ├── context.ts      # Request context (user from JWT cookie)
│   │   ├── oauth.ts        # Manus OAuth callback handler
│   │   ├── env.ts          # Typed environment variable access
│   │   └── llm.ts          # Built-in LLM helper (unused currently)
│   ├── routers.ts          # Root tRPC router (assembles sub-routers)
│   ├── inventoryRouter.ts  # Inventory tRPC procedures
│   ├── pricingRouter.ts    # Pricing tRPC procedures (Google Sheet parser)
│   ├── inventorySync.ts    # Supabase → local DB sync logic + cron
│   └── db.ts               # Drizzle ORM database connection
│
├── drizzle/
│   └── schema.ts           # Database table definitions (MySQL)
│
├── shared/
│   ├── const.ts            # Shared constants (error messages, etc.)
│   └── types.ts            # Shared TypeScript types
│
├── vitest.config.ts
├── vite.config.ts
├── drizzle.config.ts
└── package.json
```

## Request Lifecycle

A typical calculator request flows as follows. The user fills in the 7-step form in `Calculator.tsx`. All calculations happen **client-side** in `products.ts` — no backend call is needed for the core calculation. When the user clicks "Generate Quote", the `QuoteModal` opens and calls `trpc.inventory.getAll.useQuery()` to fetch stock availability from the local database, which was synced from Supabase. The PDF is generated entirely client-side using `jsPDF`.

The only backend calls in the normal flow are the inventory query and the optional manual sync trigger. Pricing data is fetched from Google Sheets via `trpc.pricing.getAll.useQuery()` on the Pricing and B2B Calculator pages.

## Authentication Architecture

The app uses a **two-layer authentication model**. The outer layer is a simple password gate (`AuthContext.tsx`) that reads `VITE_APP_PASSWORD` from the environment and stores the authenticated state in `localStorage`. This prevents unauthorized access to the tool without requiring individual user accounts.

The inner layer is **Manus OAuth** (JWT cookie), which is used for the `protectedProcedure` tRPC procedures. Currently, all procedures use `publicProcedure` since the password gate is sufficient for this internal tool. The OAuth infrastructure is in place for future role-based features.

## Data Flow: Inventory Sync

```
André's Supabase DB
  └── maximo_inventory_view
        (branch_name, species, nominal_size, profile, length, pieces, stock_lf)
              │
              │  HTTPS REST API (Supabase anon key)
              ▼
  server/inventorySync.ts
    fetchSupabaseInventory()
              │
              │  DELETE all rows + INSERT batches of 200
              ▼
  Local MySQL/TiDB DB
    inventory table
              │
              │  Drizzle ORM query
              ▼
  inventoryRouter.getAll()
    (groups rows by product → branch → length)
              │
              │  tRPC HTTP
              ▼
  Inventory.tsx
    (renders product cards with per-branch, per-length breakdown)
```

The sync runs automatically every day at 11:00 UTC via a `setTimeout`-based scheduler in `server/_core/index.ts`. A manual sync can be triggered from the Inventory tab UI.
