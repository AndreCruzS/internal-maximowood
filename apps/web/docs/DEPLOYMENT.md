# Deployment Guide

## Current Hosting (Manus Platform)

The app is currently deployed on the **Manus platform** at `quotecalculator.manus.space`. The Manus platform handles hosting, SSL, database provisioning (MySQL/TiDB), and secret management automatically. No manual deployment steps are required for the current setup.

To publish a new version on Manus: create a checkpoint in the Manus Management UI, then click the **Publish** button.

---

## Migration to Vercel + Supabase

This section documents the steps to migrate the app to Vercel (frontend + API) and Supabase (PostgreSQL database).

### Prerequisites

- A [Vercel](https://vercel.com) account
- A [Supabase](https://supabase.com) account (for the app's own database — separate from André's inventory Supabase)
- Node.js 20+ and pnpm installed locally

---

### Step 1: Set Up Supabase Database

1. Create a new Supabase project at [supabase.com/dashboard](https://supabase.com/dashboard).
2. Navigate to **SQL Editor** and run the migration file:
   ```
   supabase/migrations/001_initial_schema.sql
   ```
3. Copy the **connection string** from **Settings → Database → Connection string → URI**. Use the `pgbouncer=true` variant for serverless environments.

---

### Step 2: Update the Schema for PostgreSQL

The current `drizzle/schema.ts` uses MySQL-specific imports. Replace it with the PostgreSQL version:

```bash
# In the project root
cp supabase/schema-pg.ts drizzle/schema.ts
cp supabase/drizzle.config-pg.ts drizzle.config.ts
```

Install the PostgreSQL driver:
```bash
pnpm add pg @types/pg
pnpm remove mysql2
```

Update `server/db.ts` to use the PostgreSQL adapter from `supabase/postgres-adapter.ts`.

---

### Step 3: Add Vercel Configuration

Copy the Vercel config files to the project root:

```bash
cp vercel-config/vercel.json ./vercel.json
cp -r vercel-config/api ./api
```

The `vercel.json` configures:
- Build command: `pnpm build`
- Output directory: `dist`
- URL rewrites: `/api/*` → serverless function, everything else → `index.html`
- Cron job: daily inventory sync at 11:00 UTC

---

### Step 4: Deploy to Vercel

```bash
# Install Vercel CLI
pnpm add -g vercel

# Login
vercel login

# Deploy (first time — creates the project)
vercel

# Follow the prompts:
# - Link to existing project? No
# - Project name: maximo-sales-calculator
# - Directory: ./
# - Override build settings? No
```

---

### Step 5: Set Environment Variables in Vercel

In the Vercel Dashboard → Project → Settings → Environment Variables, add all variables from `.env.example`:

| Variable | Where to get it |
|---|---|
| `DATABASE_URL` | Supabase → Settings → Database → Connection string (pgbouncer) |
| `JWT_SECRET` | Generate with `openssl rand -base64 32` |
| `VITE_APP_ID` | Manus platform project settings |
| `OAUTH_SERVER_URL` | `https://api.manus.im` |
| `VITE_OAUTH_PORTAL_URL` | `https://manus.im` |
| `OWNER_OPEN_ID` | Manus platform user profile |
| `OWNER_NAME` | Your name |
| `VITE_APP_PASSWORD` | `Maximo@26` (or new password) |
| `SUPABASE_INVENTORY_URL` | André's Supabase project URL |
| `SUPABASE_INVENTORY_ANON_KEY` | André's Supabase anon key |
| `CRON_SECRET` | Generate with `openssl rand -base64 32` |
| `VITE_APP_TITLE` | `Maximo Sales Calculator` |

---

### Step 6: Run Database Migrations

```bash
# Set DATABASE_URL in your local .env.local
pnpm db:push
```

---

### Step 7: Verify Deployment

After deploying, verify the following:
- The login page loads at `https://[project].vercel.app`
- The password `Maximo@26` grants access
- The Inventory tab shows products (trigger a manual sync if empty)
- The Pricing tab loads prices from the Google Sheet
- A calculation can be completed and a PDF quote generated

---

## Important Differences: Manus vs Vercel

| Feature | Manus Platform | Vercel + Supabase |
|---|---|---|
| Database | MySQL/TiDB (managed) | PostgreSQL/Supabase (self-managed) |
| Cron jobs | `setTimeout` in Express process | Vercel Cron Jobs (see `vercel.json`) |
| Auth | Manus OAuth (built-in) | Manus OAuth (requires `VITE_APP_ID` etc.) |
| File storage | Manus S3 (built-in) | Supabase Storage or AWS S3 |
| Secrets | Manus Secrets panel | Vercel Environment Variables |
| SSL | Automatic | Automatic |
| Custom domain | Manus Domains panel | Vercel Domains panel |

---

## Updating the App Password

The access password is controlled by the `VITE_APP_PASSWORD` environment variable. To change it:

**On Manus:** Use the Secrets panel in the Management UI.  
**On Vercel:** Go to Project → Settings → Environment Variables → edit `VITE_APP_PASSWORD`, then redeploy.
