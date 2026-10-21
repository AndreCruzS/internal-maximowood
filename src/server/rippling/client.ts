import type { RipplingLeave, RipplingWorker } from "@/lib/rippling";
import { ENDPOINTS, RIPPLING_PLATFORM_URL, RIPPLING_REST_URL, lookupFrom, normalizeLeave, normalizeWorker } from "@/server/rippling/fields";

/**
 * Rippling API (read only), with an API token created by a Rippling admin
 * (Tools → Developer → API Tokens). RIPPLING_API_TOKEN; RIPPLING_API_URL overrides
 * the REST base URL. The token expires after 30 days unused — the nightly sync keeps it alive.
 */
export const ripplingConnected = () => Boolean(process.env.RIPPLING_API_TOKEN);

export class RipplingError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function get<T>(url: URL): Promise<T> {
  const token = process.env.RIPPLING_API_TOKEN;
  if (!token) throw new RipplingError("Rippling is not connected", 503);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store" });
  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 300);
    throw new RipplingError(`Rippling ${res.status}${res.status === 403 ? " (a scope or permission is missing on the token)" : ""}: ${body || res.statusText}`, res.status);
  }
  return (await res.json()) as T;
}

/** Every page of a REST list (cursor pagination: next_link), up to `max` rows. */
async function list(path: string, max = 5000): Promise<unknown[]> {
  const base = (process.env.RIPPLING_API_URL || RIPPLING_REST_URL).replace(/\/$/, "");
  let url: URL | null = new URL(`${base}${path}`);
  url.searchParams.set("limit", "100");
  const out: unknown[] = [];
  while (url && out.length < max) {
    const page: { results?: unknown[]; data?: unknown[]; next_link?: string | null; next?: string | null } | unknown[] = await get(url);
    const rows = Array.isArray(page) ? page : page.results ?? page.data ?? [];
    out.push(...rows);
    const next: string | null = Array.isArray(page) ? null : page.next_link ?? page.next ?? null;
    url = next ? new URL(next, base) : null;
  }
  return out;
}

/** Platform API list (offset pagination). */
async function platformList(path: string, max = 5000): Promise<unknown[]> {
  const out: unknown[] = [];
  for (let offset = 0; out.length < max; offset += 100) {
    const url = new URL(`${RIPPLING_PLATFORM_URL}${path}`);
    url.searchParams.set("limit", "100");
    url.searchParams.set("offset", String(offset));
    const page = await get<unknown[] | { results?: unknown[] }>(url);
    const rows = Array.isArray(page) ? page : page.results ?? [];
    out.push(...rows);
    if (rows.length < 100) break;
  }
  return out;
}

export async function fetchRippling(): Promise<{ workers: RipplingWorker[]; leave: RipplingLeave[]; warnings: string[] }> {
  const warnings: string[] = [];
  const optional = async (what: string, run: () => Promise<unknown[]>) => {
    try {
      return await run();
    } catch (e) {
      warnings.push(`${what}: ${e instanceof Error ? e.message : String(e)}`);
      return [];
    }
  };
  const [rawWorkers, departments, locations, rawLeave] = await Promise.all([
    list(ENDPOINTS.workers),
    optional("Departments", () => list(ENDPOINTS.departments)),
    optional("Work locations", () => list(ENDPOINTS.workLocations)),
    optional("Leave requests", () => platformList(ENDPOINTS.leaveRequests)),
  ]);
  const lookups = { departments: lookupFrom(departments), locations: lookupFrom(locations) };
  const workers = rawWorkers.map(w => normalizeWorker(w, lookups)).filter((w): w is RipplingWorker => !!w);
  const leave = rawLeave.map(normalizeLeave).filter((l): l is RipplingLeave => !!l);
  if (rawWorkers.length && !workers.length) warnings.push("Workers came back but none could be read — check the field names in src/server/rippling/fields.ts.");
  return { workers, leave, warnings };
}
