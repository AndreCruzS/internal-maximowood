# Maximo Sales Calculator — Project Overview

**Version:** 1.0.0  
**Last Updated:** April 2026  
**Live URL:** [quotecalculator.manus.space](https://quotecalculator.manus.space)  
**Stack:** React 19 · TypeScript · Tailwind CSS 4 · tRPC 11 · Express 4 · Drizzle ORM · MySQL/TiDB (current) / PostgreSQL/Supabase (migration target)

---

## What This Project Is

The Maximo Sales Calculator is a **password-protected internal sales tool** for the Maximo Thermo Concierge team. It allows sales representatives to:

- Calculate material quantities (linear feet and square footage) for thermally modified wood and hardwood products.
- Apply waste factors, add-ons (milling, pre-finish), and coating requirements to produce accurate project estimates.
- Generate professional PDF quotes to share with end customers.
- View live inventory across all Maximo branches (Boston, Miami, NY, etc.) synced nightly from an external Supabase database.
- Browse live pricing across all six commercial tiers (Distributor RL/Fixed, Dealer RL/Fixed, End Customer RL/Fixed) pulled directly from a Google Sheet.
- Run B2B calculations for Distributor and Dealer partners with the correct stacked margin pricing.

---

## Documentation Index

| Document | Description |
|---|---|
| [README.md](./README.md) | This file — project overview and index |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Full system architecture, data flow, and component map |
| [FEATURES.md](./FEATURES.md) | Detailed feature documentation with code references |
| [PRICING.md](./PRICING.md) | Pricing chain logic, margin formulas, and Google Sheet integration |
| [INVENTORY.md](./INVENTORY.md) | Inventory sync system, Supabase view, and DB schema |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Step-by-step deployment guide for Vercel + Supabase |
| [AI-AGENT-HANDOFF.md](./AI-AGENT-HANDOFF.md) | Structured handoff document for AI agent continuity |

---

## Quick Start (Local Development)

```bash
# 1. Clone and install
git clone <repo-url>
cd maximo-sales-calculator
pnpm install

# 2. Configure environment
cp .env.example .env.local
# Fill in DATABASE_URL, JWT_SECRET, SUPABASE_INVENTORY_URL, etc.

# 3. Push database schema
pnpm db:push

# 4. Start dev server
pnpm dev
# App runs at http://localhost:3000
# Password: Maximo@26
```

---

## Technology Decisions

The project uses a **monorepo structure** with a single `package.json` at the root. The Vite dev server proxies all `/api/*` requests to the Express backend, eliminating CORS issues in development. In production, a reverse proxy (or Vercel rewrites) handles the same routing.

**tRPC** was chosen over REST because it provides end-to-end TypeScript type safety with zero boilerplate — procedures defined in `server/routers.ts` are immediately callable from the frontend with full type inference via `trpc.*.useQuery/useMutation`.

**Drizzle ORM** was chosen for its lightweight footprint, excellent TypeScript inference, and compatibility with both MySQL (current Manus platform) and PostgreSQL (Supabase migration target).
