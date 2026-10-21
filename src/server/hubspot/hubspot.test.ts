import { afterEach, describe, expect, it, vi } from "vitest";
import { planHubSpotCalls, type HubSpotQuoteRequest } from "@/lib/hubspot";
import { HubSpotError, openDeals, searchCustomers } from "./client";
import { executePlan, sampleResult, type HubSpotOps } from "./execute";
import { messageHtml, quoteSender, sendQuoteMail } from "../quoteMail";

// No test talks to HubSpot: the ops are fakes, and fetch is stubbed where the client is used.

const now = new Date("2026-10-21T15:00:00.000Z");
const pdf = { blob: new Blob(["%PDF-1.4"], { type: "application/pdf" }), filename: "Maximo_Quote_Deck.pdf" };
const rep = { email: "rep@maximowood.com", name: "Rep Name" };

function fakeOps(failures: Partial<Record<string, HubSpotError>> = {}) {
  const calls: string[] = [];
  let n = 0;
  const ops: HubSpotOps = {
    createObject: async (object, props) => {
      calls.push(`create ${object} ${JSON.stringify(props)}`);
      if (failures[`create ${object}`]) throw failures[`create ${object}`];
      return `${object}_${++n}`;
    },
    updateDealAmount: async (id, amount) => {
      calls.push(`amount ${id} ${amount}`);
    },
    associate: async (from, _fromId, to) => {
      calls.push(`link ${from}->${to}`);
      if (failures[`link ${to}`]) throw failures[`link ${to}`];
    },
    uploadPdf: async () => {
      calls.push("upload");
      return "file_1";
    },
    firstOpenStage: async () => "first_stage",
  };
  return { ops, calls };
}

const newCustomer = (): HubSpotQuoteRequest => ({
  action: "send",
  target: {
    contactId: null, companyId: null, dealId: null,
    newContact: { firstName: "Ana", lastName: "Lima", email: "ana@x.com", phone: "" },
    newCompany: { name: "Lima Decks", address: "" },
    newDealPipelineId: "default",
  },
  email: { to: "ana@x.com", subject: "Quote", message: "Hi Ana" },
  createTask: true,
});
const plan = (r: HubSpotQuoteRequest) => planHubSpotCalls(r, { projectName: "Deck", amount: 500, now, defaultStages: {} });

describe("executePlan", () => {
  it("existing deal: updates only the amount and logs the email with the PDF on contact, company and deal", async () => {
    const req: HubSpotQuoteRequest = { ...newCustomer(), target: { contactId: "1", companyId: "2", dealId: "3", newContact: null, newCompany: null, newDealPipelineId: null } };
    const { ops, calls } = fakeOps();
    const r = await executePlan(plan(req), { target: req.target, ownerId: "77", pdf, rep, now }, ops);
    expect(r.errors).toEqual([]);
    expect(calls[0]).toBe("amount 3 500");
    expect(calls.some(c => c.startsWith("create deals"))).toBe(false);
    const email = calls.find(c => c.startsWith("create emails"))!;
    expect(email).toContain('"hs_attachment_ids":"file_1"');
    expect(email).toContain('"hubspot_owner_id":"77"');
    expect(calls.filter(c => c.startsWith("link emails"))).toEqual(["link emails->contacts", "link emails->companies", "link emails->deals"]);
  });

  it("new deal without a default stage uses the pipeline's first open stage", async () => {
    const { ops, calls } = fakeOps();
    await executePlan(plan(newCustomer()), { target: newCustomer().target, ownerId: null, pdf, rep, now }, ops);
    const deal = calls.find(c => c.startsWith("create deals"))!;
    expect(deal).toContain('"dealstage":"first_stage"');
    expect(deal).toContain('"amount":"500.00"');
    expect(deal).not.toContain("hubspot_owner_id"); // no owner known → created without one
  });

  it("missing companies scope: skips the company with a warning, everything else still happens", async () => {
    const forbidden = new HubSpotError("HubSpot 403: missing scopes", 403);
    const { ops, calls } = fakeOps({ "create companies": forbidden, "link companies": forbidden });
    const r = await executePlan(plan(newCustomer()), { target: newCustomer().target, ownerId: null, pdf, rep, now }, ops);
    expect(r.errors).toEqual([]);
    expect(r.companyId).toBeNull();
    expect(r.contactId).not.toBeNull();
    expect(r.dealId).not.toBeNull();
    expect(r.engagementId).not.toBeNull();
    expect(r.taskId).not.toBeNull();
    expect(r.warnings[0]).toMatch(/missing scope crm\.objects\.companies\.write/);
    expect(calls.some(c => c.startsWith("create emails"))).toBe(true);
  });

  it("a company link refused for a missing scope is a warning, not an error", async () => {
    const req: HubSpotQuoteRequest = { ...newCustomer(), target: { contactId: "1", companyId: "2", dealId: "3", newContact: null, newCompany: null, newDealPipelineId: null } };
    const { ops } = fakeOps({ "link companies": new HubSpotError("HubSpot 403", 403) });
    const r = await executePlan(plan(req), { target: req.target, ownerId: null, pdf, rep, now }, ops);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual(["HubSpot: missing scope crm.objects.companies.write — not linked to the company"]);
  });

  it("a failed contact creation stops before logging anything", async () => {
    const { ops, calls } = fakeOps({ "create contacts": new HubSpotError("HubSpot 500", 500) });
    const r = await executePlan(plan(newCustomer()), { target: newCustomer().target, ownerId: null, pdf, rep, now }, ops);
    expect(r.errors[0]).toMatch(/create_contact/);
    expect(calls.some(c => c.startsWith("create emails") || c === "upload")).toBe(false);
  });

  it("sample mode makes no calls and returns demo ids", () => {
    const r = sampleResult(plan(newCustomer()), newCustomer().target);
    expect(r).toMatchObject({ contactId: "demo_new_contact", companyId: "demo_new_company", dealId: "demo_new_deal", engagementId: "demo_email", taskId: "demo_task", errors: [] });
  });
});

describe("HubSpot client with a missing scope (fetch stubbed)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  const respond = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  it("search leaves companies out when companies can't be read", async () => {
    vi.stubEnv("HUBSPOT_ACCESS_TOKEN", "test-token");
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      url.includes("/contacts/search")
        ? respond(200, { results: [{ id: "1", properties: { firstname: "Ana", lastname: "Lima", email: "ana@x.com" } }] })
        : respond(403, { message: "This app hasn't been granted all required scopes" }),
    ));
    const r = await searchCustomers("ana");
    expect(r.contacts.map(c => c.id)).toEqual(["1"]);
    expect(r.companies).toEqual([]);
    expect(r.missingScopes).toEqual(["crm.objects.companies.read"]);
  });

  it("open deals still come from the contact when company associations are forbidden", async () => {
    vi.stubEnv("HUBSPOT_ACCESS_TOKEN", "test-token");
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/objects/contacts/1/associations/deals")) return respond(200, { results: [{ toObjectId: 9 }] });
      if (url.includes("/objects/companies/")) return respond(403, { message: "missing scope" });
      return respond(200, { results: [{ id: "9", properties: { dealname: "Deck", pipeline: "default", dealstage: "s1", amount: "100", hs_is_closed: "false" } }] });
    }));
    const deals = await openDeals("1", "2", [{ id: "default", label: "Sales Trunk", stages: [{ id: "s1", label: "Quoted", closed: false }] }]);
    expect(deals).toEqual([{ id: "9", name: "Deck", pipelineId: "default", pipelineLabel: "Sales Trunk", stageLabel: "Quoted", amount: 100 }]);
  });
});

describe("quote email", () => {
  it("is skipped (not failed) without SMTP", async () => {
    vi.stubEnv("SMTP_USER", "");
    vi.stubEnv("SMTP_PASS", "");
    const r = await sendQuoteMail({ from: rep, to: "a@b.com", cc: [], subject: "s", message: "m", attachment: { filename: "q.pdf", content: Buffer.from("%PDF") } });
    expect(r.status).toBe("skipped");
    vi.unstubAllEnvs();
  });
  it("turns the rep's text into escaped paragraphs", () => {
    expect(messageHtml("Hi <Ana>,\nline two\n\nBye")).toContain("<p style=\"margin:0 0 14px\">Hi &lt;Ana&gt;,<br>line two</p><p");
  });
});

describe("quote sender", () => {
  const rep = { email: "matheus.selleti@maximowood.com", name: "Matheus Selleti" };
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; });
  it("sends from the SMTP account under the rep's name until the relay is on", () => {
    delete process.env.QUOTE_SEND_AS_REP;
    delete process.env.QUOTE_FROM_ADDRESS;
    process.env.SMTP_USER = "no-reply@gmxgroup.com";
    expect(quoteSender(rep)).toEqual({ email: "no-reply@gmxgroup.com", name: "Matheus Selleti – Maximo" });
  });
  it("sends as the rep once QUOTE_SEND_AS_REP=1", () => {
    process.env.QUOTE_SEND_AS_REP = "1";
    expect(quoteSender(rep)).toEqual(rep);
  });
});
