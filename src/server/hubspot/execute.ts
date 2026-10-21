import type { HubSpotTarget, PlanStep } from "@/lib/hubspot";
import { associateDefault, createObject, getPipelines, isMissingScope, updateDealAmount, uploadPdf } from "./client";
import { WRITE_SCOPE } from "./fields";

/** The HubSpot calls a plan needs; swapped for fakes in tests. */
export type HubSpotOps = {
  createObject: typeof createObject;
  updateDealAmount: (dealId: string, amount: number) => Promise<unknown>;
  associate: typeof associateDefault;
  uploadPdf: typeof uploadPdf;
  /** First open stage of a pipeline, when no default stage is set. */
  firstOpenStage: (pipelineId: string) => Promise<string | null>;
};

export const liveOps: HubSpotOps = {
  createObject,
  updateDealAmount,
  associate: associateDefault,
  uploadPdf,
  firstOpenStage: async pipelineId => (await getPipelines()).find(p => p.id === pipelineId)?.stages.find(s => !s.closed)?.id ?? null,
};

export type ExecuteResult = {
  contactId: string | null;
  companyId: string | null;
  dealId: string | null;
  fileId: string | null;
  engagementId: string | null;
  taskId: string | null;
  errors: string[];
  /** Things skipped because the token lacks a scope (e.g. companies): the rest still ran. */
  warnings: string[];
};

export type ExecuteContext = {
  target: HubSpotTarget;
  ownerId: string | null;
  pdf: { blob: Blob; filename: string };
  rep: { email: string; name: string };
  now: Date;
};

const htmlText = (s: string) => s.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!).replace(/\n/g, "<br>");

/**
 * Runs the plan in order. A failing step is recorded and the steps that depend on
 * it are skipped; the others still run (e.g. the note is still logged if the task fails).
 */
export async function executePlan(steps: PlanStep[], ctx: ExecuteContext, ops: HubSpotOps = liveOps): Promise<ExecuteResult> {
  const r: ExecuteResult = {
    contactId: ctx.target.contactId,
    companyId: ctx.target.companyId,
    dealId: ctx.target.dealId,
    fileId: null,
    engagementId: null,
    taskId: null,
    errors: [],
    warnings: [],
  };
  const owner: Record<string, string> = ctx.ownerId ? { hubspot_owner_id: ctx.ownerId } : {};
  const timestamp = ctx.now.toISOString();
  const fail = (step: string, e: unknown) => r.errors.push(`${step}: ${e instanceof Error ? e.message : String(e)}`);
  const missing = (object: string, what: string) => {
    const msg = `HubSpot: missing scope ${WRITE_SCOPE[object] ?? object} — ${what}`;
    if (!r.warnings.includes(msg)) r.warnings.push(msg);
  };
  // Links to a company are best-effort: without the companies scope they're skipped with a warning.
  const link = async (from: string, fromId: string, to: string, toId: string) => {
    try {
      await ops.associate(from, fromId, to, toId);
    } catch (e) {
      if (to === "companies" && isMissingScope(e)) missing("companies", "not linked to the company");
      else fail(`link ${from} to ${to}`, e);
    }
  };

  // Logged activities go on every record we have.
  const associateAll = async (object: "emails" | "notes" | "tasks", id: string) => {
    for (const [to, toId] of [["contacts", r.contactId], ["companies", r.companyId], ["deals", r.dealId]] as const) {
      if (toId) await link(object, id, to, toId);
    }
  };

  for (const step of steps) {
    try {
      switch (step.kind) {
        case "create_company":
          r.companyId = await ops.createObject("companies", { name: step.name, ...(step.address ? { address: step.address } : {}), ...owner });
          break;
        case "create_contact":
          r.contactId = await ops.createObject("contacts", {
            firstname: step.firstName,
            lastname: step.lastName,
            ...(step.email ? { email: step.email } : {}),
            ...(step.phone ? { phone: step.phone } : {}),
            ...owner,
          });
          break;
        case "associate":
          if (step.from === "contact" && r.contactId && r.companyId) await link("contacts", r.contactId, "companies", r.companyId);
          if (step.from === "deal" && r.dealId) {
            const toId = step.to === "contact" ? r.contactId : r.companyId;
            if (toId) await link("deals", r.dealId, step.to === "contact" ? "contacts" : "companies", toId);
          }
          break;
        case "create_deal": {
          const stage = step.stageId ?? (await ops.firstOpenStage(step.pipelineId));
          r.dealId = await ops.createObject("deals", {
            dealname: step.name,
            pipeline: step.pipelineId,
            ...(stage ? { dealstage: stage } : {}),
            amount: step.amount.toFixed(2),
            ...owner,
          });
          break;
        }
        case "update_deal_amount":
          if (r.dealId) await ops.updateDealAmount(r.dealId, step.amount);
          break;
        case "upload_pdf":
          r.fileId = await ops.uploadPdf(ctx.pdf.blob, ctx.pdf.filename);
          break;
        case "log_email": {
          const [first, ...rest] = ctx.rep.name.split(" ");
          r.engagementId = await ops.createObject("emails", {
            hs_timestamp: timestamp,
            hs_email_direction: "EMAIL",
            hs_email_status: "SENT",
            hs_email_subject: step.subject,
            hs_email_text: step.message,
            hs_email_html: htmlText(step.message),
            hs_email_headers: JSON.stringify({
              from: { email: ctx.rep.email, firstName: first ?? "", lastName: rest.join(" ") },
              to: [{ email: step.to }],
              cc: [{ email: ctx.rep.email }],
            }),
            ...(r.fileId ? { hs_attachment_ids: r.fileId } : {}),
            ...owner,
          });
          await associateAll("emails", r.engagementId);
          break;
        }
        case "log_note":
          r.engagementId = await ops.createObject("notes", {
            hs_timestamp: timestamp,
            hs_note_body: htmlText(`Quote: ${ctx.pdf.filename}${step.message ? `\n\n${step.message}` : ""}`),
            ...(r.fileId ? { hs_attachment_ids: r.fileId } : {}),
            ...owner,
          });
          await associateAll("notes", r.engagementId);
          break;
        case "create_task":
          r.taskId = await ops.createObject("tasks", {
            hs_timestamp: step.dueAt,
            hs_task_subject: step.subject,
            hs_task_status: "NOT_STARTED",
            hs_task_type: "TODO",
            hs_task_priority: "MEDIUM",
            ...owner,
          });
          await associateAll("tasks", r.taskId);
          break;
      }
    } catch (e) {
      // A new company is optional: without the companies scope, go on without it.
      if (step.kind === "create_company" && isMissingScope(e)) {
        missing("companies", "the company wasn't created");
        continue;
      }
      fail(step.kind, e);
      // Nothing to log against without the records the later steps need.
      if (step.kind === "create_contact" || step.kind === "create_company" || step.kind === "create_deal") break;
    }
  }
  return r;
}

/** What a run would have produced in sample mode: ids for everything, no calls. */
export function sampleResult(steps: PlanStep[], target: HubSpotTarget): ExecuteResult {
  const has = (k: PlanStep["kind"]) => steps.some(s => s.kind === k);
  return {
    contactId: target.contactId ?? (has("create_contact") ? "demo_new_contact" : null),
    companyId: target.companyId ?? (has("create_company") ? "demo_new_company" : null),
    dealId: target.dealId ?? (has("create_deal") ? "demo_new_deal" : null),
    fileId: "demo_file",
    engagementId: has("log_email") ? "demo_email" : "demo_note",
    taskId: has("create_task") ? "demo_task" : null,
    errors: [],
    warnings: [],
  };
}
