import type { SupabaseClient } from "@supabase/supabase-js";
import { DEPARTMENTS, companyName, type CompanyId } from "@/lib/intranet";
import { diffRippling, parseRipplingSettings, planCounts, type IntranetPerson, type RipplingLeave, type RipplingWorker, type SyncPlan } from "@/lib/rippling";
import { IT_EMAIL, alreadySent, logEmail, renderEmail, sendMail } from "@/server/email";
import { fetchRippling, ripplingConnected } from "@/server/rippling/client";
import { demoRippling } from "@/server/rippling/demo";

export type SyncResult = {
  sample: boolean;
  dryRun: boolean;
  plan: SyncPlan;
  counts: ReturnType<typeof planCounts>;
  warnings: string[];
  errors: string[];
  runId: string | null;
};

const todayYmd = () => new Date().toISOString().slice(0, 10);

/** The intranet side of the diff (read with the service role: every person, positions, open offboardings). */
export async function loadIntranetPeople(admin: SupabaseClient): Promise<IntranetPerson[]> {
  const [people, positions, offboardings] = await Promise.all([
    admin.from("people").select("id, full_name, email, rippling_id, start_date, office, company_id, active"),
    admin.from("positions").select("id, person_id, title, department_id, reports_to, sort").order("sort"),
    admin.from("offboardings").select("person_id").eq("status", "requested"),
  ]);
  if (people.error) throw new Error(`Reading people failed: ${people.error.message}`);
  type Pos = { id: string; person_id: string; title: string; department_id: string | null; reports_to: string | null; sort: number };
  const pos = (positions.data as Pos[] | null) ?? [];
  const main = new Map<string, Pos>();
  for (const p of pos) if (!main.has(p.person_id)) main.set(p.person_id, p);
  const holder = new Map(pos.map(p => [p.id, p.person_id]));
  const leaving = new Set(((offboardings.data as { person_id: string }[] | null) ?? []).map(o => o.person_id));
  type Row = Omit<IntranetPerson, "position" | "manager_person_id" | "open_offboarding">;
  return ((people.data as Row[] | null) ?? []).map(p => {
    const m = main.get(p.id) ?? null;
    return {
      ...p,
      position: m ? { id: m.id, title: m.title, department_id: m.department_id, reports_to: m.reports_to } : null,
      manager_person_id: m?.reports_to ? holder.get(m.reports_to) ?? null : null,
      open_offboarding: leaving.has(p.id),
    };
  });
}

/**
 * Preview (dryRun) or apply a Rippling sync. Without RIPPLING_API_TOKEN it runs on sample
 * data and can only preview. Never deletes people: leavers get an offboarding, as if HR had started it.
 */
export async function runRipplingSync(
  admin: SupabaseClient,
  opts: { dryRun: boolean; trigger: "manual" | "cron"; startedBy: string | null; origin: string },
): Promise<SyncResult> {
  const sample = !ripplingConnected();
  const dryRun = opts.dryRun || sample;
  const today = todayYmd();
  const settingsRow = await admin.from("app_settings").select("value").eq("key", "rippling").maybeSingle();
  const settings = parseRipplingSettings((settingsRow.data as { value: unknown } | null)?.value);

  const run = await admin
    .from("rippling_sync_runs")
    .insert({ dry_run: dryRun, sample, trigger: opts.trigger, started_by: opts.startedBy })
    .select("id")
    .maybeSingle();
  const runId = (run.data as { id: string } | null)?.id ?? null;

  const errors: string[] = [];
  let warnings: string[] = [];
  const people = await loadIntranetPeople(admin);
  let workers: RipplingWorker[];
  let leave: RipplingLeave[];
  if (sample) ({ workers, leave } = demoRippling(people, today));
  else ({ workers, leave, warnings } = await fetchRippling());

  const existing = await admin.from("absences").select("external_id, status").eq("source", "rippling");
  const existingLeave = ((existing.data as { external_id: string | null; status: string }[] | null) ?? [])
    .filter(l => l.external_id)
    .map(l => ({ externalId: l.external_id!, status: l.status }));
  const plan = diffRippling(workers, people, settings, { today, leave, existingLeave });

  if (!dryRun) await applyPlan(admin, plan, people, opts.origin, errors);

  const counts = planCounts(plan);
  if (runId) {
    await admin
      .from("rippling_sync_runs")
      .update({ finished_at: new Date().toISOString(), counts: { ...counts, warnings: warnings.length }, errors: [...warnings, ...errors].slice(0, 50) })
      .eq("id", runId);
  }
  return { sample, dryRun, plan, counts, warnings, errors, runId };
}

async function applyPlan(admin: SupabaseClient, plan: SyncPlan, people: IntranetPerson[], origin: string, errors: string[]) {
  const now = new Date().toISOString();
  const fail = (what: string, e: { message: string } | null) => {
    if (e) errors.push(`${what}: ${e.message}`);
    return !!e;
  };
  const mainPosition = new Map(people.map(p => [p.id, p.position?.id ?? null]));
  const positionOf = (personId: string | null) => (personId ? mainPosition.get(personId) ?? null : null);

  // 1. Matched people: link + Rippling-owned fields.
  for (const u of plan.updates) {
    const v = u.values;
    if (fail(`Update ${u.name}`, (await admin.from("people").update({ rippling_id: u.workerId, rippling_synced_at: now, start_date: v.startDate, office: v.office, company_id: v.companyId }).eq("id", u.personId)).error)) continue;
    const pos = positionOf(u.personId);
    const row = { title: v.title || "Employee", department_id: v.departmentId, reports_to: positionOf(v.managerPersonId) };
    if (pos) fail(`Position of ${u.name}`, (await admin.from("positions").update(row).eq("id", pos)).error);
    else {
      const ins = await admin.from("positions").insert({ ...row, person_id: u.personId, sort: 1000 }).select("id").maybeSingle();
      if (!fail(`Position of ${u.name}`, ins.error)) mainPosition.set(u.personId, (ins.data as { id: string }).id);
    }
  }

  // 2. New people (and the onboarding / IT flow for new hires).
  for (const c of plan.creates) {
    const w = c.worker;
    const p = await admin
      .from("people")
      .insert({
        full_name: w.fullName, email: w.workEmail, company_id: c.companyId, companies: c.companyId ? [c.companyId] : [],
        start_date: w.startDate, office: c.office, rippling_id: w.id, rippling_synced_at: now, active: true,
      })
      .select("id")
      .maybeSingle();
    if (fail(`Add ${w.fullName}`, p.error)) continue;
    const personId = (p.data as { id: string }).id;
    const pos = await admin
      .from("positions")
      .insert({ person_id: personId, title: w.title || "Employee", department_id: c.departmentId, reports_to: positionOf(c.managerPersonId), sort: 1000 })
      .select("id")
      .maybeSingle();
    if (!fail(`Position of ${w.fullName}`, pos.error)) mainPosition.set(personId, (pos.data as { id: string }).id);
    if (!c.isNewHire) continue;
    const personalEmail = w.personalEmail ?? w.workEmail;
    if (!personalEmail) {
      errors.push(`New hire ${w.fullName}: no email in Rippling, so IT wasn't asked to set them up`);
      continue;
    }
    const hire = await admin
      .from("new_hires")
      .insert({
        person_id: personId, full_name: w.fullName, personal_email: personalEmail, title: w.title, department_id: c.departmentId,
        reports_to: c.managerPersonId, company_id: c.companyId, start_date: w.startDate,
        // The work email from Rippling links their first sign-in to this entry (link_new_hire).
        company_email: w.workEmail, needs_email: !w.workEmail, notes: "Added from Rippling.",
      })
      .select("id")
      .maybeSingle();
    if (fail(`Onboarding for ${w.fullName}`, hire.error)) continue;
    await emailIt(admin, "new_hire", (hire.data as { id: string }).id, `New hire: ${w.fullName}${w.startDate ? ` — starts ${w.startDate}` : ""}`, {
      title: `New hire: ${w.fullName}`,
      intro: "Rippling has a new hire. Please set up their accounts, send the credentials to their personal email and mark them ready in the intranet.",
      rows: [
        ["Name", w.fullName], ["Position", w.title], ["Department", dept(c.departmentId)], ["Brand", brand(c.companyId)],
        ["Start date", w.startDate ?? ""], ["Personal email", personalEmail], ["Work email (from Rippling)", w.workEmail ?? "To create"],
      ],
      link: `${origin}/onboarding/hires/${(hire.data as { id: string }).id}`,
    }, errors);
  }

  // 3. Leavers: start the offboarding (IT turns accounts off and archives them).
  for (const l of plan.leavers) {
    const o = await admin.from("offboardings").insert({ person_id: l.personId, last_day: l.lastDay, notes: "Terminated in Rippling." }).select("id").maybeSingle();
    if (fail(`Offboarding for ${l.name}`, o.error)) continue;
    await emailIt(admin, "offboarding", (o.data as { id: string }).id, `Offboard: ${l.name} — last day ${l.lastDay}`, {
      title: `Offboard: ${l.name}`,
      intro: "This person was terminated in Rippling. Please turn off their accounts and access, then mark the offboarding done in the intranet.",
      rows: [["Name", l.name], ["Last day", l.lastDay]],
      link: `${origin}/onboarding?tab=offboarding`,
    }, errors);
  }

  // 4. Time off from Rippling.
  if (plan.leave.upsert.length) {
    const rows = plan.leave.upsert.map(l => ({
      external_id: l.externalId, person_id: l.personId, starts_on: l.startsOn, ends_on: l.endsOn, kind: l.kind, note: l.note, status: "approved", source: "rippling",
    }));
    fail("Time off", (await admin.from("absences").upsert(rows, { onConflict: "external_id" })).error);
  }
  if (plan.leave.cancel.length) {
    fail("Cancelled time off", (await admin.from("absences").update({ status: "cancelled" }).in("external_id", plan.leave.cancel)).error);
  }
}

const dept = (id: string | null) => (id ? DEPARTMENTS.find(d => d.id === id)?.name ?? id : "");
const brand = (id: string | null) => (id ? companyName(id as CompanyId) : "");

async function emailIt(
  admin: SupabaseClient,
  kind: "new_hire" | "offboarding",
  refId: string,
  subject: string,
  body: { title: string; intro: string; rows: [string, string][]; link: string },
  errors: string[],
) {
  if (await alreadySent(admin, kind, refId)) return;
  const mail = renderEmail({ ...body, linkLabel: "Open in the intranet" });
  const result = await sendMail({ to: IT_EMAIL, subject, ...mail });
  await logEmail(admin, { kind, ref_id: refId, to_email: IT_EMAIL, subject, created_by: null, ...result });
  if (result.status === "failed") errors.push(`Email to IT (${subject}): ${result.error ?? "failed"}`);
}
