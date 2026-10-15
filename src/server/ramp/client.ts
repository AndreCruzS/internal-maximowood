import type { RampCard, RampFund, RampReimbursement, RampTxn } from "@/lib/expenses";

/**
 * Ramp Developer API (https://docs.ramp.com), server to server with OAuth client
 * credentials. Needs RAMP_CLIENT_ID and RAMP_CLIENT_SECRET; RAMP_API_URL points at
 * the sandbox (https://demo-api.ramp.com) while testing.
 */
export const RAMP_SCOPES = [
  "users:read", "users:write",
  "transactions:read", "receipts:write", "memos:write",
  "cards:read", "funds:read",
  "reimbursements:read", "reimbursements:write",
  "spend_programs:read", "unified_requests:write",
] as const;

const base = () => (process.env.RAMP_API_URL || "https://api.ramp.com").replace(/\/$/, "");
export const rampConnected = () => Boolean(process.env.RAMP_CLIENT_ID && process.env.RAMP_CLIENT_SECRET);

export class RampError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

let token: { value: string; expires: number } | null = null;

async function getToken(force = false) {
  if (!force && token && token.expires > Date.now() + 60_000) return token.value;
  const id = process.env.RAMP_CLIENT_ID;
  const secret = process.env.RAMP_CLIENT_SECRET;
  if (!id || !secret) throw new RampError("Ramp is not connected", 503);
  const res = await fetch(`${base()}/developer/v1/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: RAMP_SCOPES.join(" ") }),
    cache: "no-store",
  });
  if (!res.ok) throw new RampError(`Ramp sign-in failed (${res.status})`, res.status);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: json.access_token, expires: Date.now() + json.expires_in * 1000 };
  return token.value;
}

type Query = Record<string, string | number | boolean | undefined | null>;

async function ramp<T>(path: string, init: RequestInit & { query?: Query } = {}, retried = false): Promise<T> {
  const url = new URL(path.startsWith("http") ? path : `${base()}/developer/v1${path}`);
  for (const [k, v] of Object.entries(init.query ?? {})) if (v != null && v !== "") url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${await getToken()}`, Accept: "application/json", ...init.headers },
    cache: "no-store",
  });
  if (res.status === 401 && !retried) {
    await getToken(true);
    return ramp<T>(path, init, true);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let message = body.slice(0, 300);
    try {
      const j = JSON.parse(body) as { error_v2?: { message?: string }; message?: string };
      message = j.error_v2?.message ?? j.message ?? message;
    } catch {}
    throw new RampError(`Ramp ${res.status}: ${message || res.statusText}`, res.status);
  }
  return (res.status === 204 ? null : await res.json()) as T;
}

/** Every page of a list endpoint (up to `max` items). */
async function all<T>(path: string, query: Query, max = 300): Promise<T[]> {
  const out: T[] = [];
  let next: string | null = path;
  let q: Query | undefined = { page_size: 100, ...query };
  while (next && out.length < max) {
    const page: { data: T[]; page?: { next?: string | null } } = await ramp(next, { query: q });
    out.push(...page.data);
    next = page.page?.next ?? null;
    q = undefined; // `next` is a full URL with the query in it
  }
  return out.slice(0, max);
}

// ── Normalizing ─────────────────────────────────────────────────────────────
type Money = { value?: number; amount?: number; currency?: string; currency_code?: string; minor_unit_conversion_rate?: number } | null | undefined;
/** Ramp amounts come in minor units (cents); some legacy fields are already in dollars. */
export function fromMinor(m: Money, legacyDollars?: number | null): { amount: number | null; currency: string } {
  if (m && (typeof m.value === "number" || typeof m.amount === "number")) {
    const minor = (m.value ?? m.amount) as number;
    return { amount: minor / (m.minor_unit_conversion_rate || 100), currency: m.currency ?? m.currency_code ?? "USD" };
  }
  return { amount: typeof legacyDollars === "number" ? legacyDollars : null, currency: "USD" };
}

type ApiTxn = {
  id: string; amount?: number; entity_amount?: Money; merchant_name?: string; merchant_descriptor?: string;
  user_transaction_time?: string; state?: string; card_id?: string | null; receipts?: string[]; memo?: string | null;
  sk_category_name?: string | null;
  card_holder?: { user_id?: string; first_name?: string; last_name?: string } | null;
};
export function normalizeTxn(t: ApiTxn, last4ByCard: Map<string, string | null> = new Map()): RampTxn {
  const m = fromMinor(t.entity_amount, t.amount);
  return {
    id: t.id,
    amount: m.amount ?? 0,
    currency: m.currency,
    merchant: t.merchant_name || t.merchant_descriptor || "—",
    at: t.user_transaction_time ?? "",
    state: t.state ?? "",
    cardId: t.card_id ?? null,
    cardLast4: t.card_id ? last4ByCard.get(t.card_id) ?? null : null,
    holderUserId: t.card_holder?.user_id ?? null,
    holderName: [t.card_holder?.first_name, t.card_holder?.last_name].filter(Boolean).join(" "),
    receiptCount: t.receipts?.length ?? 0,
    memo: t.memo ?? "",
    category: t.sk_category_name ?? "",
  };
}

// ── Reads ───────────────────────────────────────────────────────────────────
type ApiUser = { id: string; email: string; first_name?: string; last_name?: string; status?: string };

export async function findUserByEmail(email: string): Promise<ApiUser | null> {
  const page = await ramp<{ data: ApiUser[] }>("/users", { query: { email: email.toLowerCase(), page_size: 2 } });
  return page.data.find(u => u.email.toLowerCase() === email.toLowerCase()) ?? null;
}

export const listUsers = () => all<ApiUser>("/users", {}, 1000);

export async function listCards(userId: string): Promise<RampCard[]> {
  type Physical = { id: string; display_name?: string; last_four?: string; cardholder_id?: string; is_suspended?: boolean; state?: string };
  type Virtual = { id: string; user_id?: string; is_card_suspended?: boolean };
  const [physical, virtual] = await Promise.all([
    all<Physical>("/cards/physical", { user_id: userId }),
    all<Virtual>("/cards/virtual", { user_id: userId }).catch(() => [] as Virtual[]),
  ]);
  return [
    ...physical.map(c => ({ id: c.id, name: c.display_name ?? "", last4: c.last_four ?? null, physical: true, holderUserId: c.cardholder_id ?? userId, suspended: Boolean(c.is_suspended) })),
    ...virtual.map(c => ({ id: c.id, name: "", last4: null, physical: false, holderUserId: c.user_id ?? userId, suspended: Boolean(c.is_card_suspended) })),
  ];
}

export async function listTransactions(userId: string, fromDate: string, cards: RampCard[] = []): Promise<RampTxn[]> {
  const last4 = new Map(cards.map(c => [c.id, c.last4]));
  const rows = await all<ApiTxn>("/transactions", { user_id: userId, from_date: fromDate, order_by_date_desc: true }, 200);
  return rows.map(t => normalizeTxn(t, last4));
}

export async function getTransaction(id: string): Promise<RampTxn> {
  return normalizeTxn(await ramp<ApiTxn>(`/transactions/${encodeURIComponent(id)}`));
}

export async function listFunds(userId: string): Promise<RampFund[]> {
  type ApiFund = {
    id: string; display_name?: string; balance?: { total?: Money; cleared?: Money } | null;
    spending_restrictions?: { limit?: Money; amount?: Money } | null;
  };
  const rows = await all<ApiFund>("/funds", { user_id: userId, is_terminated: false });
  return rows.map(f => {
    const spent = fromMinor(f.balance?.total ?? f.balance?.cleared);
    const limit = fromMinor(f.spending_restrictions?.limit ?? f.spending_restrictions?.amount);
    return { id: f.id, name: f.display_name ?? "", spent: spent.amount ?? 0, limit: limit.amount, currency: spent.currency };
  });
}

export async function listReimbursements(userId: string): Promise<RampReimbursement[]> {
  type ApiReimb = { id: string; entity_amount?: Money; merchant?: string | null; transaction_date?: string | null; state?: string; type?: string };
  const rows = await all<ApiReimb>("/reimbursements", { user_id: userId }, 50);
  return rows.map(r => {
    const m = fromMinor(r.entity_amount);
    return { id: r.id, amount: m.amount, currency: m.currency, merchant: r.merchant ?? "", date: r.transaction_date ?? null, state: r.state ?? "", type: r.type ?? "" };
  });
}

// ── Writes ──────────────────────────────────────────────────────────────────
type Upload = { file: Blob; fileName: string; idempotencyKey: string };

/** Attaches a receipt to a card purchase (or lets Ramp match it to the card holder's purchases). */
export async function uploadReceipt({ userId, transactionId, file, fileName, idempotencyKey }: Upload & { userId: string; transactionId: string | null }) {
  const form = new FormData();
  form.set("idempotency_key", idempotencyKey);
  form.set("user_id", userId);
  if (transactionId) form.set("transaction_id", transactionId);
  form.set("receipt", file, fileName);
  return ramp<{ id: string }>("/receipts", { method: "POST", body: form });
}

/** Out-of-pocket: Ramp reads the receipt and creates the reimbursement for the person. */
export async function reimbursementFromReceipt({ userId, file, fileName, idempotencyKey }: Upload & { userId: string }) {
  const form = new FormData();
  form.set("idempotency_key", idempotencyKey);
  form.set("reimbursee_id", userId);
  form.set("receipt", file, fileName);
  return ramp<{ id: string }>("/reimbursements/submit-receipt", { method: "POST", body: form });
}

export const addMemo = (transactionId: string, memo: string) =>
  ramp(`/memos/${encodeURIComponent(transactionId)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ memo }) });

export const deactivateUser = (userId: string) => ramp(`/users/${encodeURIComponent(userId)}/deactivate`, { method: "PATCH" });

/**
 * A fund request into Ramp's approval flow (procurement "unified requests").
 * Needs RAMP_FUND_PROGRAM_ID: the spend program people request against.
 */
export function createFundRequest(r: { ownerId: string; name: string; currency: string; startDate: string | null; endDate: string | null }) {
  const programId = process.env.RAMP_FUND_PROGRAM_ID;
  if (!programId) throw new RampError("RAMP_FUND_PROGRAM_ID is not set", 503);
  return ramp<{ id: string }>("/unified-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      request_owner_id: r.ownerId,
      spend_program_id: programId,
      name: r.name,
      currency: r.currency,
      ...(r.startDate ? { start_date: r.startDate } : {}),
      ...(r.endDate ? { end_date: r.endDate } : {}),
      submit: true,
    }),
  });
}
