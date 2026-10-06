import type { QuoteCartItem } from "@/components/QuoteModal";
import { quoteItemsTotal, type QuoteInput, type SavedQuote } from "@/lib/quotes";

export const MAX_QUOTE_ITEMS = 200;

export type QuoteRow = {
  id: string;
  user_id: string;
  project_name: string;
  calculator: string;
  company: string | null;
  contact: string | null;
  address: string | null;
  prepared_by: string | null;
  notes: string | null;
  tax: number | string | null;
  shipping: number | string | null;
  lead_time_weeks: number | null;
  items: unknown;
  total: number | string;
  created_at: string;
  updated_at: string;
};

export const QUOTE_COLUMNS =
  "id, user_id, project_name, calculator, company, contact, address, prepared_by, notes, tax, shipping, lead_time_weeks, items, total, created_at, updated_at";

// PostgREST returns numeric columns as strings.
const num = (v: number | string | null): number | null => (v == null ? null : Number(v));

export function rowToQuote(row: QuoteRow): SavedQuote {
  return {
    id: row.id,
    ownerId: row.user_id,
    projectName: row.project_name,
    calculator: row.calculator === "b2b" ? "b2b" : "retail",
    company: row.company ?? "",
    contact: row.contact ?? "",
    address: row.address ?? "",
    preparedBy: row.prepared_by ?? "",
    notes: row.notes ?? "",
    tax: num(row.tax),
    shipping: num(row.shipping),
    leadTimeWeeks: num(row.lead_time_weeks),
    items: Array.isArray(row.items) ? (row.items as QuoteCartItem[]) : [],
    total: num(row.total) ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function quoteToRow(q: QuoteInput) {
  return {
    project_name: q.projectName,
    calculator: q.calculator,
    company: q.company || null,
    contact: q.contact || null,
    address: q.address || null,
    prepared_by: q.preparedBy || null,
    notes: q.notes || null,
    tax: q.tax,
    shipping: q.shipping,
    lead_time_weeks: q.leadTimeWeeks,
    items: q.items,
    total: Math.round(quoteItemsTotal(q.items) * 100) / 100,
  };
}

const str = (v: unknown, max = 2000): string =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export const MAX_LEAD_TIME_WEEKS = 52;

function optionalWeeks(v: unknown): number | null | undefined {
  if (v == null || v === "") return null;
  const n = typeof v === "string" ? Number(v) : v;
  if (!finite(n) || !Number.isInteger(n) || n < 1 || n > MAX_LEAD_TIME_WEEKS) return undefined;
  return n;
}

function optionalMoney(v: unknown): number | null | undefined {
  if (v == null || v === "") return null;
  const n = typeof v === "string" ? Number(v) : v;
  if (!finite(n) || n < 0) return undefined;
  return Math.round(n * 100) / 100;
}

function parseItem(v: unknown): QuoteCartItem | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (!finite(o.sqft) || !finite(o.lf) || !finite(o.pricePerLF) || !finite(o.total) || !finite(o.neededLF)) {
    return null;
  }
  let addOns: QuoteCartItem["addOns"];
  if (o.addOns != null) {
    if (!Array.isArray(o.addOns)) return null;
    addOns = [];
    for (const ao of o.addOns) {
      const a = ao as Record<string, unknown> | null;
      if (!a || typeof a.label !== "string" || !finite(a.amount)) return null;
      addOns.push({ label: a.label.slice(0, 500), amount: a.amount });
    }
  }
  return {
    species: str(o.species, 200),
    profile: str(o.profile, 200),
    nominalSize: str(o.nominalSize, 100),
    sqft: o.sqft,
    lf: o.lf,
    pricePerLF: o.pricePerLF,
    total: o.total,
    lengthType: o.lengthType === "Fixed" ? "Fixed" : o.lengthType === "RL" ? "RL" : undefined,
    addOns,
    speciesKey: str(o.speciesKey, 200),
    profileKey: str(o.profileKey, 200),
    sizeKey: str(o.sizeKey, 100),
    neededLF: o.neededLF,
    // Waste detail for the PDF; optional so older quotes still parse.
    projectLF: finite(o.projectLF) ? o.projectLF : undefined,
    projectSqft: finite(o.projectSqft) ? o.projectSqft : undefined,
    wastePercent: typeof o.wastePercent === "string" ? str(o.wastePercent, 50) : undefined,
  };
}

/** Validate an untrusted request body into a QuoteInput. */
export function parseQuoteInput(body: unknown): { ok: true; quote: QuoteInput } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid quote" };
  const b = body as Record<string, unknown>;

  const projectName = str(b.projectName, 200);
  if (!projectName) return { ok: false, error: "Project name is required to save a quote" };

  if (!Array.isArray(b.items) || b.items.length === 0) {
    return { ok: false, error: "A quote needs at least one item" };
  }
  if (b.items.length > MAX_QUOTE_ITEMS) {
    return { ok: false, error: `A quote can have at most ${MAX_QUOTE_ITEMS} items` };
  }
  const items: QuoteCartItem[] = [];
  for (const raw of b.items) {
    const item = parseItem(raw);
    if (!item) return { ok: false, error: "One of the quote items is invalid" };
    items.push(item);
  }

  const tax = optionalMoney(b.tax);
  const shipping = optionalMoney(b.shipping);
  if (tax === undefined) return { ok: false, error: "Tax must be a positive number" };
  if (shipping === undefined) return { ok: false, error: "Shipping must be a positive number" };
  const leadTimeWeeks = optionalWeeks(b.leadTimeWeeks);
  if (leadTimeWeeks === undefined) return { ok: false, error: `Lead time must be 1 to ${MAX_LEAD_TIME_WEEKS} weeks` };

  return {
    ok: true,
    quote: {
      projectName,
      calculator: b.calculator === "b2b" ? "b2b" : "retail",
      company: str(b.company, 300),
      contact: str(b.contact, 300),
      address: str(b.address, 500),
      preparedBy: str(b.preparedBy, 300),
      notes: str(b.notes, 10000),
      tax,
      shipping,
      leadTimeWeeks,
      items,
    },
  };
}

/** Postgres unique_violation — the user already has a quote with this project name. */
export const isDuplicateProjectName = (error: { code?: string } | null) => error?.code === "23505";
