/**
 * HubSpot + quotes: shared types and pure helpers (client and server).
 *
 * From the quote dialog a rep picks the HubSpot customer and deal, then either
 *   - "send": emails the quote PDF to the customer from the rep's own address and
 *     logs that email (with the PDF) on the contact, company and deal, or
 *   - "save_only": logs the PDF as a note on them, without emailing anyone.
 * Either way the deal's amount becomes the quote total (the stage is never
 * touched) and, if ticked, the rep gets a follow-up task due 48 hours later.
 * Without HUBSPOT_ACCESS_TOKEN everything runs on sample data (demo_ ids).
 */

// ── Pipelines the calculator may create deals in ─────────────────────────────
export const HUBSPOT_PIPELINES = [
  { id: "908001413", label: "Pipeline Maximo" },
  { id: "default", label: "Sales Trunk" },
  { id: "771999126", label: "Builder Express" },
] as const;
export type PipelineId = (typeof HUBSPOT_PIPELINES)[number]["id"];
export const isAllowedPipeline = (id: string): id is PipelineId => HUBSPOT_PIPELINES.some(p => p.id === id);

export type HsContact = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  companyId: string | null;
  companyName: string;
  address: string;
};
export type HsCompany = { id: string; name: string; domain: string; address: string };
export type HsDeal = {
  id: string;
  name: string;
  pipelineId: string;
  pipelineLabel: string;
  stageLabel: string;
  amount: number | null;
};
export type HsPipeline = { id: string; label: string; stages: { id: string; label: string; closed: boolean }[] };
export type HsOwner = { id: string; email: string; name: string };

export type QuoteAction = "send" | "save_only";

/** Who and what the quote is logged against: existing records by id, or new ones to create. */
export type HubSpotTarget = {
  contactId: string | null;
  companyId: string | null;
  dealId: string | null;
  newContact: { firstName: string; lastName: string; email: string; phone: string } | null;
  newCompany: { name: string; address: string } | null;
  newDealPipelineId: string | null;
};

export type HubSpotQuoteRequest = {
  action: QuoteAction;
  target: HubSpotTarget;
  email: { to: string; subject: string; message: string };
  createTask: boolean;
};

export type HubSpotSettings = {
  /** Stage a new deal starts in, per pipeline id (else the pipeline's first open stage). */
  defaultStages: Record<string, string>;
  template: { subject: string; body: string };
  /** App login email (lowercase) → HubSpot owner id, when the emails differ. */
  ownerOverrides: Record<string, string>;
  /** Copied on every quote email, besides the rep. */
  alwaysCc: string[];
};

/** Helen (Maximo) is copied on every quote email unless an admin changes it. */
export const DEFAULT_ALWAYS_CC = ["helen.tiene@maximowood.com"];
const MAX_ALWAYS_CC = 10;

export const DEFAULT_TEMPLATE = {
  subject: "Maximo quote – {project}",
  body: "Hi {contact},\n\nThank you for your interest in Maximo. Please find attached the quote for {project}.\n\nLet me know if you have any questions — happy to help.\n\nBest regards,\n{rep}",
};

export const DEFAULT_SETTINGS: HubSpotSettings = { defaultStages: {}, template: DEFAULT_TEMPLATE, ownerOverrides: {}, alwaysCc: DEFAULT_ALWAYS_CC };

export const TASK_DUE_HOURS = 48;
export const MAX_PDF_BYTES = 10 * 1024 * 1024;
export const MAX_MESSAGE = 20_000;

// ── Templates ─────────────────────────────────────────────────────────────────
export type TemplateVars = { project: string; contact: string; rep: string; company: string };

/** Fills {project}, {contact}, {rep} and {company}; unknown placeholders stay as written. */
export function renderTemplate(template: string, vars: TemplateVars): string {
  return template.replace(/\{(project|contact|rep|company)\}/g, (_, k: keyof TemplateVars) => vars[k]?.trim() || (k === "contact" ? "there" : ""));
}

// ── Validation ────────────────────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;
export const isEmail = (v: unknown): v is string => typeof v === "string" && v.length <= 254 && EMAIL_RE.test(v.trim());
/** HubSpot record ids are numeric; sample ids start with demo_. */
export const isRecordId = (v: unknown): v is string => typeof v === "string" && (/^\d{1,20}$/.test(v) || /^demo_[a-z0-9_]{1,40}$/.test(v));

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const idOrNull = (v: unknown): string | null | undefined => (v == null || v === "" ? null : isRecordId(v) ? v : undefined);

export function parseHubSpotQuoteRequest(body: unknown): { ok: true; value: HubSpotQuoteRequest } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const action = b.action === "send" || b.action === "save_only" ? b.action : null;
  if (!action) return { ok: false, error: "Unknown action" };
  const t = (b.target ?? {}) as Record<string, unknown>;
  const contactId = idOrNull(t.contactId);
  const companyId = idOrNull(t.companyId);
  const dealId = idOrNull(t.dealId);
  if (contactId === undefined || companyId === undefined || dealId === undefined) return { ok: false, error: "Invalid HubSpot record id" };

  let newContact: HubSpotTarget["newContact"] = null;
  if (!contactId && t.newContact) {
    const c = t.newContact as Record<string, unknown>;
    newContact = { firstName: str(c.firstName, 100), lastName: str(c.lastName, 100), email: str(c.email, 254).toLowerCase(), phone: str(c.phone, 50) };
    if (!newContact.firstName && !newContact.lastName) return { ok: false, error: "The new contact needs a name" };
    if (newContact.email && !isEmail(newContact.email)) return { ok: false, error: "The new contact's email isn't valid" };
  }
  let newCompany: HubSpotTarget["newCompany"] = null;
  if (!companyId && t.newCompany) {
    const c = t.newCompany as Record<string, unknown>;
    newCompany = { name: str(c.name, 200), address: str(c.address, 300) };
    if (!newCompany.name) newCompany = null;
  }
  if (!contactId && !newContact && !companyId && !newCompany) return { ok: false, error: "Pick the customer in HubSpot, or enter a new one" };

  const newDealPipelineId = dealId ? null : str(t.newDealPipelineId, 30);
  if (!dealId && !isAllowedPipeline(newDealPipelineId ?? "")) return { ok: false, error: "Pick the deal, or the pipeline for a new deal" };

  const e = (b.email ?? {}) as Record<string, unknown>;
  const email = { to: str(e.to, 254).toLowerCase(), subject: str(e.subject, 200), message: typeof e.message === "string" ? e.message.slice(0, MAX_MESSAGE) : "" };
  if (action === "send") {
    if (!isEmail(email.to)) return { ok: false, error: "Enter the customer's email address" };
    if (!email.subject) return { ok: false, error: "The email needs a subject" };
    if (!email.message.trim()) return { ok: false, error: "Write the message to the customer" };
  }
  return {
    ok: true,
    value: {
      action,
      target: { contactId, companyId, dealId, newContact, newCompany, newDealPipelineId: dealId ? null : newDealPipelineId },
      email,
      createTask: b.createTask === true,
    },
  };
}

export function parseSettings(value: unknown): HubSpotSettings {
  const v = (value ?? {}) as Record<string, unknown>;
  const rec = (x: unknown) =>
    Object.fromEntries(Object.entries((x && typeof x === "object" ? x : {}) as Record<string, unknown>).filter(([k, val]) => typeof val === "string" && k.length <= 254 && (val as string).length <= 40)) as Record<string, string>;
  const tpl = (v.template ?? {}) as Record<string, unknown>;
  const overrides = rec(v.ownerOverrides);
  return {
    defaultStages: Object.fromEntries(Object.entries(rec(v.defaultStages)).filter(([k]) => isAllowedPipeline(k))),
    template: {
      subject: str(tpl.subject, 200) || DEFAULT_TEMPLATE.subject,
      body: (typeof tpl.body === "string" && tpl.body.trim() ? tpl.body.slice(0, MAX_MESSAGE) : "") || DEFAULT_TEMPLATE.body,
    },
    ownerOverrides: Object.fromEntries(Object.entries(overrides).filter(([k, id]) => isEmail(k) && /^\d+$/.test(id)).map(([k, id]) => [k.toLowerCase(), id])),
    // Never saved yet → Helen; saved as an empty list → nobody extra.
    alwaysCc: Array.isArray(v.alwaysCc)
      ? [...new Set(v.alwaysCc.filter(isEmail).map(e => e.trim().toLowerCase()))].slice(0, MAX_ALWAYS_CC)
      : DEFAULT_ALWAYS_CC,
  };
}

/** Who's copied on a quote email: the rep, then the always-CC list (no duplicates, never the customer). */
export function ccFor(repEmail: string, alwaysCc: string[], to = ""): string[] {
  const out: string[] = [];
  for (const e of [repEmail, ...alwaysCc]) {
    const k = e.trim().toLowerCase();
    if (k && k !== to.trim().toLowerCase() && !out.some(x => x.toLowerCase() === k)) out.push(e.trim());
  }
  return out;
}

// ── Owners ────────────────────────────────────────────────────────────────────
/** The rep's HubSpot owner: an admin override for their login email, else the owner with the same email. */
export function matchOwner(loginEmail: string | null | undefined, owners: HsOwner[], overrides: Record<string, string>): string | null {
  const email = (loginEmail ?? "").trim().toLowerCase();
  if (!email) return null;
  const forced = overrides[email];
  if (forced && owners.some(o => o.id === forced)) return forced;
  if (forced && owners.length === 0) return forced;
  return owners.find(o => o.email.toLowerCase() === email)?.id ?? null;
}

// ── The plan: which HubSpot calls a request makes ─────────────────────────────
export type PlanStep =
  | { kind: "create_company"; name: string; address: string }
  | { kind: "create_contact"; firstName: string; lastName: string; email: string; phone: string }
  | { kind: "associate"; from: "contact"; to: "company" }
  | { kind: "create_deal"; name: string; pipelineId: string; stageId: string | null; amount: number }
  | { kind: "update_deal_amount"; amount: number }
  | { kind: "associate"; from: "deal"; to: "contact" | "company" }
  | { kind: "upload_pdf" }
  | { kind: "log_email"; subject: string; message: string; to: string }
  | { kind: "log_note"; message: string }
  | { kind: "create_task"; subject: string; dueAt: string };

export function planHubSpotCalls(
  req: HubSpotQuoteRequest,
  ctx: { projectName: string; amount: number; now: Date; defaultStages: Record<string, string> },
): PlanStep[] {
  const t = req.target;
  const steps: PlanStep[] = [];
  const amount = Math.round(ctx.amount * 100) / 100;
  const hasCompany = !!(t.companyId || t.newCompany);
  const hasContact = !!(t.contactId || t.newContact);
  if (!t.companyId && t.newCompany) steps.push({ kind: "create_company", ...t.newCompany });
  if (!t.contactId && t.newContact) steps.push({ kind: "create_contact", ...t.newContact });
  if (hasContact && hasCompany && (!t.contactId || !t.companyId)) steps.push({ kind: "associate", from: "contact", to: "company" });
  if (t.dealId) {
    // Existing deal: only the amount changes, never the stage.
    steps.push({ kind: "update_deal_amount", amount });
  } else {
    const pipelineId = t.newDealPipelineId!;
    steps.push({ kind: "create_deal", name: ctx.projectName, pipelineId, stageId: ctx.defaultStages[pipelineId] ?? null, amount });
    if (hasContact) steps.push({ kind: "associate", from: "deal", to: "contact" });
    if (hasCompany) steps.push({ kind: "associate", from: "deal", to: "company" });
  }
  steps.push({ kind: "upload_pdf" });
  if (req.action === "send") steps.push({ kind: "log_email", subject: req.email.subject, message: req.email.message, to: req.email.to });
  else steps.push({ kind: "log_note", message: req.email.message.trim() });
  if (req.createTask) {
    steps.push({
      kind: "create_task",
      subject: `Follow up on quote – ${ctx.projectName}`,
      dueAt: new Date(ctx.now.getTime() + TASK_DUE_HOURS * 3_600_000).toISOString(),
    });
  }
  return steps;
}

// ── Links ─────────────────────────────────────────────────────────────────────
const OBJECT_TYPE_ID = { contact: "0-1", company: "0-2", deal: "0-3" } as const;
export function hubspotRecordUrl(portalId: string | null, type: keyof typeof OBJECT_TYPE_ID, id: string | null): string | null {
  if (!portalId || !id || id.startsWith("demo_")) return null;
  return `https://app.hubspot.com/contacts/${portalId}/record/${OBJECT_TYPE_ID[type]}/${id}`;
}

export const contactName = (c: Pick<HsContact, "firstName" | "lastName" | "email">) => `${c.firstName} ${c.lastName}`.trim() || c.email;

// ── Sample data (no token) ────────────────────────────────────────────────────
export const SAMPLE_COMPANIES: HsCompany[] = [
  { id: "demo_co_oak", name: "Oak & Steel Builders (sample)", domain: "oaksteel.example", address: "410 NE 2nd Ave, Miami, FL 33132" },
  { id: "demo_co_coastal", name: "Coastal Decks (sample)", domain: "coastaldecks.example", address: "88 Harbor Rd, Tampa, FL 33602" },
];
export const SAMPLE_CONTACTS: HsContact[] = [
  { id: "demo_ct_maria", firstName: "Maria", lastName: "Sample", email: "maria@oaksteel.example", phone: "(305) 555-0100", companyId: "demo_co_oak", companyName: "Oak & Steel Builders (sample)", address: "410 NE 2nd Ave, Miami, FL 33132" },
  { id: "demo_ct_james", firstName: "James", lastName: "Example", email: "james@coastaldecks.example", phone: "(813) 555-0144", companyId: "demo_co_coastal", companyName: "Coastal Decks (sample)", address: "88 Harbor Rd, Tampa, FL 33602" },
];
export const SAMPLE_DEALS: (HsDeal & { contactId: string; companyId: string })[] = [
  { id: "demo_dl_oak_deck", name: "Oak & Steel – Rooftop deck", pipelineId: "908001413", pipelineLabel: "Pipeline Maximo", stageLabel: "Request for quote", amount: null, contactId: "demo_ct_maria", companyId: "demo_co_oak" },
  { id: "demo_dl_coastal", name: "Coastal Decks – Marina boardwalk", pipelineId: "default", pipelineLabel: "Sales Trunk", stageLabel: "Quoted", amount: 12000, contactId: "demo_ct_james", companyId: "demo_co_coastal" },
];

export function sampleSearch(q: string): { contacts: HsContact[]; companies: HsCompany[] } {
  const s = q.trim().toLowerCase();
  if (s.length < 2) return { contacts: [], companies: [] };
  return {
    contacts: SAMPLE_CONTACTS.filter(c => `${c.firstName} ${c.lastName} ${c.email} ${c.companyName}`.toLowerCase().includes(s)),
    companies: SAMPLE_COMPANIES.filter(c => `${c.name} ${c.domain}`.toLowerCase().includes(s)),
  };
}

export const sampleDeals = (contactId: string | null, companyId: string | null): HsDeal[] =>
  SAMPLE_DEALS.filter(d => (contactId && d.contactId === contactId) || (companyId && d.companyId === companyId)).map(d => ({
    id: d.id, name: d.name, pipelineId: d.pipelineId, pipelineLabel: d.pipelineLabel, stageLabel: d.stageLabel, amount: d.amount,
  }));

// ── API shapes ────────────────────────────────────────────────────────────────
export type HubSpotConfig = {
  mode: "live" | "sample";
  /** Email can actually be sent (SMTP set up). */
  emailReady: boolean;
  pipelines: { id: string; label: string }[];
  template: { subject: string; body: string };
  rep: { email: string; name: string };
  /** Copied on every quote email besides the rep (admin setting). */
  alwaysCc: string[];
  portalId: string | null;
};

export type QuoteSendRecord = {
  id: string;
  action: QuoteAction;
  toEmail: string | null;
  cc: string[];
  subject: string | null;
  emailStatus: "sent" | "failed" | "skipped" | "sample" | "not_sent";
  hubspotStatus: "done" | "partial" | "failed" | "sample";
  dealId: string | null;
  errors: string[];
  createdAt: string;
};

export type HubSpotQuoteResponse = {
  mode: "live" | "sample";
  emailStatus: QuoteSendRecord["emailStatus"];
  hubspotStatus: QuoteSendRecord["hubspotStatus"];
  errors: string[];
  /** Parts skipped because the HubSpot token lacks a scope; the rest went through. */
  warnings: string[];
  dealUrl: string | null;
  contactId: string | null;
  companyId: string | null;
  dealId: string | null;
};
