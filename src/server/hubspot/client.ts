import type { HsCompany, HsContact, HsDeal, HsOwner, HsPipeline } from "@/lib/hubspot";
import { COMPANY_PROPS, CONTACT_PROPS, DEAL_PROPS, FILES_FOLDER, HUBSPOT_API, PATHS, SCOPE_PROBES } from "./fields";

/** Server-only HubSpot client (private app token). Null when HUBSPOT_ACCESS_TOKEN isn't set → sample mode. */
export function hubspotToken(): string | null {
  return process.env.HUBSPOT_ACCESS_TOKEN?.trim() || null;
}

export class HubSpotError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** HubSpot answers 403 when the private app lacks the scope for that call. */
export const isMissingScope = (e: unknown) => e instanceof HubSpotError && e.status === 403;

async function call<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const token = hubspotToken();
  if (!token) throw new HubSpotError("HubSpot isn't connected", 503);
  const { json, ...rest } = init;
  const res = await fetch(`${HUBSPOT_API}${path}`, {
    ...rest,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(rest.headers ?? {}),
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    cache: "no-store",
  });
  if (!res.ok) {
    // HubSpot's error body names the problem (missing scope, bad property…); never echo the token.
    const body = (await res.json().catch(() => ({}))) as { message?: string; category?: string };
    throw new HubSpotError(`HubSpot ${res.status}: ${body.message ?? body.category ?? res.statusText}`, res.status);
  }
  return (res.status === 204 ? null : await res.json()) as T;
}

type Obj = { id: string; properties: Record<string, string | null> };
const p = (o: Obj, k: string) => o.properties[k] ?? "";
const joinAddress = (o: Obj) => [p(o, "address"), p(o, "city"), [p(o, "state"), p(o, "zip")].filter(Boolean).join(" ")].filter(Boolean).join(", ");

const toContact = (o: Obj): HsContact => ({
  id: o.id,
  firstName: p(o, "firstname"),
  lastName: p(o, "lastname"),
  email: p(o, "email"),
  phone: p(o, "phone"),
  companyId: p(o, "associatedcompanyid") || null,
  companyName: p(o, "company"),
  address: joinAddress(o),
});
const toCompany = (o: Obj): HsCompany => ({ id: o.id, name: p(o, "name"), domain: p(o, "domain"), address: joinAddress(o) });

/** Contacts and companies matching `q`. Without the companies scope, companies are just left out. */
export async function searchCustomers(q: string): Promise<{ contacts: HsContact[]; companies: HsCompany[]; missingScopes: string[] }> {
  const [contacts, companies] = await Promise.allSettled([
    call<{ results: Obj[] }>(PATHS.search("contacts"), { method: "POST", json: { query: q, limit: 8, properties: CONTACT_PROPS } }),
    call<{ results: Obj[] }>(PATHS.search("companies"), { method: "POST", json: { query: q, limit: 5, properties: COMPANY_PROPS } }),
  ]);
  if (contacts.status === "rejected") throw contacts.reason;
  if (companies.status === "rejected" && !isMissingScope(companies.reason)) throw companies.reason;
  return {
    contacts: contacts.value.results.map(toContact),
    companies: companies.status === "fulfilled" ? companies.value.results.map(toCompany) : [],
    missingScopes: companies.status === "rejected" ? ["crm.objects.companies.read"] : [],
  };
}

export async function getPipelines(): Promise<HsPipeline[]> {
  const r = await call<{ results: { id: string; label: string; stages: { id: string; label: string; displayOrder: number; metadata?: { isClosed?: string } }[] }[] }>(PATHS.pipelines);
  return r.results.map(pl => ({
    id: pl.id,
    label: pl.label,
    stages: [...pl.stages].sort((a, b) => a.displayOrder - b.displayOrder).map(s => ({ id: s.id, label: s.label, closed: s.metadata?.isClosed === "true" })),
  }));
}

export async function getOwners(): Promise<HsOwner[]> {
  const r = await call<{ results: { id: string; email: string; firstName?: string; lastName?: string }[] }>(PATHS.owners);
  return r.results.map(o => ({ id: String(o.id), email: o.email ?? "", name: `${o.firstName ?? ""} ${o.lastName ?? ""}`.trim() }));
}

export async function getPortalId(): Promise<string | null> {
  const r = await call<{ portalId?: number }>(PATHS.account).catch(() => null);
  return r?.portalId ? String(r.portalId) : null;
}

/** Open deals of a contact and/or company (any allowed pipeline), labelled with their pipeline and stage. */
export async function openDeals(contactId: string | null, companyId: string | null, pipelines: HsPipeline[]): Promise<HsDeal[]> {
  const ids = new Set<string>();
  for (const [type, id] of [["contacts", contactId], ["companies", companyId]] as const) {
    if (!id) continue;
    try {
      const r = await call<{ results: { toObjectId: number | string }[] }>(PATHS.associations(type, id, "deals"));
      r.results.forEach(x => ids.add(String(x.toObjectId)));
    } catch (e) {
      // Without the companies scope, a company's deals can't be listed: the contact's still are.
      if (!(type === "companies" && isMissingScope(e))) throw e;
    }
  }
  if (!ids.size) return [];
  const r = await call<{ results: Obj[] }>(PATHS.batchRead("deals"), {
    method: "POST",
    json: { inputs: [...ids].slice(0, 100).map(id => ({ id })), properties: DEAL_PROPS },
  });
  return r.results
    .filter(d => p(d, "hs_is_closed") !== "true")
    .map(d => {
      const pl = pipelines.find(x => x.id === p(d, "pipeline"));
      return {
        id: d.id,
        name: p(d, "dealname"),
        pipelineId: p(d, "pipeline"),
        pipelineLabel: pl?.label ?? p(d, "pipeline"),
        stageLabel: pl?.stages.find(s => s.id === p(d, "dealstage"))?.label ?? p(d, "dealstage"),
        amount: p(d, "amount") ? Number(p(d, "amount")) : null,
      };
    });
}

export const createObject = (object: "contacts" | "companies" | "deals" | "emails" | "notes" | "tasks", properties: Record<string, string>) =>
  call<{ id: string }>(PATHS.create(object), { method: "POST", json: { properties } }).then(r => String(r.id));

export const updateDealAmount = (dealId: string, amount: number) =>
  call<{ id: string }>(PATHS.update("deals", dealId), { method: "PATCH", json: { properties: { amount: amount.toFixed(2) } } });

export const associateDefault = (from: string, fromId: string, to: string, toId: string) =>
  call<unknown>(PATHS.associateDefault(from, fromId, to, toId), { method: "PUT" });

/** Uploads the quote PDF to HubSpot Files, private (only signed-in HubSpot users can open it). */
export async function uploadPdf(pdf: Blob, filename: string): Promise<string> {
  const form = new FormData();
  form.append("file", pdf, filename);
  form.append("folderPath", FILES_FOLDER);
  form.append("options", JSON.stringify({ access: "PRIVATE", overwrite: false }));
  const r = await call<{ id: string }>(PATHS.upload, { method: "POST", body: form });
  return String(r.id);
}

export type ScopeProbe = { area: string; scope: string; ok: boolean; status: number | null };

/** Read-only checks of what the token can reach, for the admin panel. */
export async function probeScopes(): Promise<ScopeProbe[]> {
  return Promise.all(
    SCOPE_PROBES.map(async p => {
      try {
        await call<unknown>(p.path, { method: p.method, ...("body" in p ? { json: p.body } : {}) });
        return { area: p.area, scope: p.scope, ok: true, status: 200 };
      } catch (e) {
        return { area: p.area, scope: p.scope, ok: false, status: e instanceof HubSpotError ? e.status : null };
      }
    }),
  );
}
