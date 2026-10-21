import { describe, expect, it } from "vitest";
import {
  DEFAULT_TEMPLATE,
  hubspotRecordUrl,
  matchOwner,
  parseHubSpotQuoteRequest,
  parseSettings,
  planHubSpotCalls,
  renderTemplate,
  sampleDeals,
  sampleSearch,
  type HubSpotQuoteRequest,
} from "./hubspot";

const now = new Date("2026-10-21T15:00:00.000Z");
const base = (over: Partial<HubSpotQuoteRequest> = {}): HubSpotQuoteRequest => ({
  action: "send",
  target: { contactId: "101", companyId: "202", dealId: "303", newContact: null, newCompany: null, newDealPipelineId: null },
  email: { to: "maria@oak.com", subject: "Maximo quote – Deck", message: "Hi Maria" },
  createTask: true,
  ...over,
});
const ctx = { projectName: "Rooftop deck", amount: 1234.567, now, defaultStages: { "908001413": "1378708567" } };

describe("renderTemplate", () => {
  it("fills the placeholders", () => {
    expect(renderTemplate(DEFAULT_TEMPLATE.subject, { project: "Deck", contact: "Maria", rep: "Anna", company: "Oak" })).toBe("Maximo quote – Deck");
    expect(renderTemplate("Hi {contact}, {company} / {project} — {rep} {unknown}", { project: "P", contact: "", rep: "R", company: "C" })).toBe("Hi there, C / P — R {unknown}");
  });
});

describe("parseHubSpotQuoteRequest", () => {
  const ok = (b: unknown) => parseHubSpotQuoteRequest(b);
  it("accepts a send to an existing deal", () => {
    expect(ok(base()).ok).toBe(true);
  });
  it("requires the email, subject and message for a send, not for save-only", () => {
    expect(ok({ ...base(), email: { to: "nope", subject: "s", message: "m" } })).toMatchObject({ ok: false });
    expect(ok({ ...base(), email: { to: "a@b.co", subject: "", message: "m" } })).toMatchObject({ ok: false });
    expect(ok({ ...base(), email: { to: "a@b.co", subject: "s", message: "  " } })).toMatchObject({ ok: false });
    expect(ok({ ...base(), action: "save_only", email: { to: "", subject: "", message: "" } }).ok).toBe(true);
  });
  it("rejects bad ids, unknown actions and pipelines outside the allowed three", () => {
    expect(ok({ ...base(), action: "delete" })).toMatchObject({ ok: false });
    expect(ok({ ...base(), target: { ...base().target, contactId: "1; drop" } })).toMatchObject({ ok: false });
    expect(ok({ ...base(), target: { ...base().target, dealId: null, newDealPipelineId: "781713842" } })).toMatchObject({ ok: false });
    expect(ok({ ...base(), target: { ...base().target, dealId: null, newDealPipelineId: "771999126" } }).ok).toBe(true);
  });
  it("needs a customer: an existing record or a new one", () => {
    const t = { contactId: null, companyId: null, dealId: null, newContact: null, newCompany: null, newDealPipelineId: "default" };
    expect(ok({ ...base(), target: t })).toMatchObject({ ok: false });
    expect(ok({ ...base(), target: { ...t, newContact: { firstName: "Ana", lastName: "", email: "bad", phone: "" } } })).toMatchObject({ ok: false });
    expect(ok({ ...base(), target: { ...t, newContact: { firstName: "Ana", lastName: "", email: "ana@x.com", phone: "" } } }).ok).toBe(true);
  });
});

describe("matchOwner", () => {
  const owners = [{ id: "11", email: "anna@lumberplus.com", name: "Anna" }, { id: "22", email: "rep@maximowood.com", name: "Rep" }];
  it("matches by email, case-insensitively", () => {
    expect(matchOwner("REP@maximowood.com", owners, {})).toBe("22");
  });
  it("uses the admin override when the login email differs", () => {
    expect(matchOwner("anna.miguel@gmxgroup.com", owners, { "anna.miguel@gmxgroup.com": "11" })).toBe("11");
    expect(matchOwner("anna.miguel@gmxgroup.com", owners, {})).toBeNull();
  });
  it("trusts the override when owners can't be read (missing owners scope)", () => {
    expect(matchOwner("anna.miguel@gmxgroup.com", [], { "anna.miguel@gmxgroup.com": "11" })).toBe("11");
    expect(matchOwner("rep@maximowood.com", [], {})).toBeNull();
  });
});

describe("planHubSpotCalls", () => {
  const kinds = (r: HubSpotQuoteRequest) => planHubSpotCalls(r, ctx).map(s => s.kind);
  it("existing deal: only the amount changes (never the stage), then the email and the task", () => {
    const plan = planHubSpotCalls(base(), ctx);
    expect(plan.map(s => s.kind)).toEqual(["update_deal_amount", "upload_pdf", "log_email", "create_task"]);
    expect(plan[0]).toEqual({ kind: "update_deal_amount", amount: 1234.57 });
    expect(JSON.stringify(plan)).not.toMatch(/stage/i);
  });
  it("save-only logs a note instead of an email", () => {
    expect(kinds(base({ action: "save_only", createTask: false }))).toEqual(["update_deal_amount", "upload_pdf", "log_note"]);
  });
  it("the follow-up task is due 48 hours later, only when ticked", () => {
    const task = planHubSpotCalls(base(), ctx).find(s => s.kind === "create_task");
    expect(task).toMatchObject({ subject: "Follow up on quote – Rooftop deck", dueAt: "2026-10-23T15:00:00.000Z" });
    expect(kinds(base({ createTask: false }))).not.toContain("create_task");
  });
  it("new customer + new deal: creates and links them, with the pipeline's default stage", () => {
    const plan = planHubSpotCalls(
      base({
        target: {
          contactId: null, companyId: null, dealId: null,
          newContact: { firstName: "Ana", lastName: "Lima", email: "ana@x.com", phone: "" },
          newCompany: { name: "Lima Decks", address: "1 Main St" },
          newDealPipelineId: "908001413",
        },
      }),
      ctx,
    );
    expect(plan.map(s => s.kind)).toEqual(["create_company", "create_contact", "associate", "create_deal", "associate", "associate", "upload_pdf", "log_email", "create_task"]);
    expect(plan.find(s => s.kind === "create_deal")).toMatchObject({ name: "Rooftop deck", pipelineId: "908001413", stageId: "1378708567", amount: 1234.57 });
  });
  it("new deal in a pipeline without a default stage leaves the stage to HubSpot's first open stage", () => {
    const plan = planHubSpotCalls(base({ target: { ...base().target, dealId: null, newDealPipelineId: "default" } }), ctx);
    expect(plan.find(s => s.kind === "create_deal")).toMatchObject({ stageId: null });
    expect(plan.map(s => s.kind)).not.toContain("update_deal_amount");
  });
});

describe("settings, links and sample data", () => {
  it("parseSettings keeps valid values only", () => {
    const s = parseSettings({ defaultStages: { "908001413": "1", "781713842": "2" }, ownerOverrides: { "A@B.com": "11", bad: "x" }, template: { subject: "", body: "Hi" } });
    expect(s.defaultStages).toEqual({ "908001413": "1" });
    expect(s.ownerOverrides).toEqual({ "a@b.com": "11" });
    expect(s.template).toEqual({ subject: DEFAULT_TEMPLATE.subject, body: "Hi" });
  });
  it("links to HubSpot records, never for sample ids", () => {
    expect(hubspotRecordUrl("9068325", "deal", "66502710708")).toBe("https://app.hubspot.com/contacts/9068325/record/0-3/66502710708");
    expect(hubspotRecordUrl("9068325", "deal", "demo_dl_oak_deck")).toBeNull();
    expect(hubspotRecordUrl(null, "deal", "1")).toBeNull();
  });
  it("sample search and deals are deterministic", () => {
    expect(sampleSearch("oak").contacts.map(c => c.id)).toEqual(["demo_ct_maria"]);
    expect(sampleSearch("o").contacts).toEqual([]);
    expect(sampleDeals("demo_ct_maria", null).map(d => d.id)).toEqual(["demo_dl_oak_deck"]);
  });
});
