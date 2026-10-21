/**
 * Every HubSpot endpoint, property and scope the integration relies on, in one
 * place. Written from HubSpot's public API docs (CRM v3/v4, Files v3). Checked
 * against the real token so far: pipelines, contacts and deals answer; companies
 * and owners need crm.objects.companies.* / crm.objects.owners.read (the code
 * degrades without them). Writes (emails, notes, tasks, files, associations) are
 * not verified yet.
 */

export const HUBSPOT_API = process.env.HUBSPOT_API_URL || "https://api.hubapi.com";

/** Private-app scopes to tick in HubSpot → Private apps. */
export const REQUIRED_SCOPES = [
  "crm.objects.contacts.read",
  "crm.objects.contacts.write",
  "crm.objects.companies.read",
  "crm.objects.companies.write",
  "crm.objects.deals.read",
  "crm.objects.deals.write",
  "crm.objects.owners.read",
  "files.read",
  "files.write",
  "sales-email-read",
] as const;

/** Read-only probes for the admin status panel: which parts of the token work. */
export const SCOPE_PROBES = [
  { area: "contacts", scope: "crm.objects.contacts.read", method: "POST", path: "/crm/v3/objects/contacts/search", body: { limit: 1 } },
  { area: "companies", scope: "crm.objects.companies.read", method: "POST", path: "/crm/v3/objects/companies/search", body: { limit: 1 } },
  { area: "deals", scope: "crm.objects.deals.read", method: "POST", path: "/crm/v3/objects/deals/search", body: { limit: 1 } },
  { area: "owners", scope: "crm.objects.owners.read", method: "GET", path: "/crm/v3/owners?limit=1" },
  { area: "pipelines", scope: "crm.objects.deals.read", method: "GET", path: "/crm/v3/pipelines/deals" },
  { area: "files", scope: "files.read", method: "GET", path: "/files/v3/files/search?limit=1" },
] as const;

/** The scope a write to `object` needs, for "missing scope" warnings. */
export const WRITE_SCOPE: Record<string, string> = {
  companies: "crm.objects.companies.write",
  contacts: "crm.objects.contacts.write",
  deals: "crm.objects.deals.write",
  owners: "crm.objects.owners.read",
  files: "files.write",
};

export const PATHS = {
  account: "/account-info/v3/details",
  owners: "/crm/v3/owners?limit=500",
  pipelines: "/crm/v3/pipelines/deals",
  search: (object: "contacts" | "companies" | "deals") => `/crm/v3/objects/${object}/search`,
  create: (object: "contacts" | "companies" | "deals" | "emails" | "notes" | "tasks") => `/crm/v3/objects/${object}`,
  update: (object: "deals", id: string) => `/crm/v3/objects/${object}/${id}`,
  batchRead: (object: "deals" | "companies") => `/crm/v3/objects/${object}/batch/read`,
  associations: (from: string, id: string, to: string) => `/crm/v4/objects/${from}/${id}/associations/${to}`,
  /** Associate with HubSpot's default association label (no type ids needed). */
  associateDefault: (from: string, fromId: string, to: string, toId: string) => `/crm/v4/objects/${from}/${fromId}/associations/default/${to}/${toId}`,
  upload: "/files/v3/files",
} as const;

export const CONTACT_PROPS = ["firstname", "lastname", "email", "phone", "company", "address", "city", "state", "zip", "associatedcompanyid"];
export const COMPANY_PROPS = ["name", "domain", "address", "city", "state", "zip"];
export const DEAL_PROPS = ["dealname", "pipeline", "dealstage", "amount", "hs_is_closed"];

/** Folder for uploaded quote PDFs in HubSpot Files (private). */
export const FILES_FOLDER = "/Quotes (calculator)";
