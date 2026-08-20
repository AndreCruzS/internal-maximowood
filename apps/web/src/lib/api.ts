"use client";

/**
 * Client-side data hooks. The legacy app used tRPC for its two read-only
 * queries; here they are plain GET route handlers + react-query.
 */

import { useQuery } from "@tanstack/react-query";

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
