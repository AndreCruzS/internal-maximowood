"use client";

/**
 * Client-side data hooks. The legacy app used tRPC for its two read-only
 * queries; here they are plain GET route handlers + react-query.
 */

import { useQuery } from "@tanstack/react-query";
import type { QuoteInput, SavedQuote } from "@/lib/quotes";

// ── Types mirrored from the API responses ─────────────────────────────────────

export type LengthEntry = {
  lengthFt: number | null;
  pieces: number | null;
  stockLf: number;
};

export type BranchStock = {
  branch: string;
  totalLF: number;
  lengths: LengthEntry[];
};

export type InventoryItem = {
  specie: string;
  category: string;
  model: string;
  profile: string;
  size: string;
  branches: BranchStock[];
  totalLF: number;
  isUnmapped: boolean;
};

export type InventoryResponse = {
  items: InventoryItem[];
  species: string[];
  categories: string[];
  models: string[];
  profiles: string[];
  sizes: string[];
  branches: string[];
  lastUpdated: string | null; // ISO string over JSON
  source: "live";
};

export type PricingRow = {
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
};

// ── Fetch helpers ──────────────────────────────────────────────────────────────

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (res.status === 401 && typeof window !== "undefined") {
    window.location.href = "/login";
  }
  if (!res.ok) throw new Error(`${url} failed with status ${res.status}`);
  return res.json() as Promise<T>;
}

/** Error from a JSON write; carries the response body (e.g. a 409's existingId). */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: Record<string, unknown>,
  ) {
    super(message);
  }
}

export async function sendJson<T>(url: string, method: "POST" | "PATCH" | "DELETE", body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: "include",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401 && typeof window !== "undefined") {
    window.location.href = "/login";
  }
  if (!res.ok) throw new ApiError(json.error || `Request failed (${res.status})`, res.status, json);
  return json as T;
}

// ── Hooks ──────────────────────────────────────────────────────────────────────

export function useInventory(options?: { enabled?: boolean }) {
  return useQuery<InventoryResponse>({
    queryKey: ["inventory"],
    queryFn: () => getJson<InventoryResponse>("/api/inventory"),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: options?.enabled ?? true,
  });
}

export function usePricing() {
  return useQuery<PricingRow[]>({
    queryKey: ["pricing"],
    queryFn: () => getJson<PricingRow[]>("/api/pricing"),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useQuotes() {
  return useQuery<SavedQuote[]>({
    queryKey: ["quotes"],
    queryFn: () => getJson<{ quotes: SavedQuote[] }>("/api/quotes").then(r => r.quotes),
    refetchOnWindowFocus: false,
  });
}

/** One saved quote. gcTime 0 so reopening always loads the latest save. */
export function useQuote(id: string | null) {
  return useQuery<SavedQuote>({
    queryKey: ["quote", id],
    queryFn: () => getJson<{ quote: SavedQuote }>(`/api/quotes/${id}`).then(r => r.quote),
    enabled: !!id,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export const createQuote = (input: QuoteInput) =>
  sendJson<{ quote: SavedQuote }>("/api/quotes", "POST", input).then(r => r.quote);

export const updateQuote = (id: string, input: QuoteInput) =>
  sendJson<{ quote: SavedQuote }>(`/api/quotes/${id}`, "PATCH", input).then(r => r.quote);

export const deleteQuote = (id: string) => sendJson<{ ok: true }>(`/api/quotes/${id}`, "DELETE");
