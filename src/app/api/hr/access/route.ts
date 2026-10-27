import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { HOLIDAY_CALENDARS } from "@/lib/holidays";
import { accessDecision, emailsOf, isEmploymentType, parseAccessImport, planAccessImport, type AccessRow } from "@/lib/access";
import { ACCESS_ROW_COLUMNS, loadAccessPage } from "@/server/access";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i;

/** HR and admins only; writes go through the service role (people can't set these fields themselves). */
async function hrOnly() {
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: hr } = await supabase.rpc("is_hr_editor");
  if (hr !== true) return { error: NextResponse.json({ error: "Only HR and admins can manage access" }, { status: 403 }) };
  const admin = getSupabaseAdmin();
  if (!admin) return { error: NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured" }, { status: 500 }) };
  return { admin, user };
}

export async function GET() {
  const g = await hrOnly();
  if ("error" in g) return g.error;
  return NextResponse.json(await loadAccessPage(g.admin));
}

/**
 * { enforce } switches the check on or off.
 * { import, apply? } previews (or applies) a pasted list: email, type[, name[, legal entity]].
 */
export async function POST(request: NextRequest) {
  const g = await hrOnly();
  if ("error" in g) return g.error;
  const { admin, user } = g;
  const body = (await request.json().catch(() => ({}))) as { enforce?: unknown; import?: unknown; apply?: unknown };

  if (typeof body.enforce === "boolean") {
    if (body.enforce) {
      // Never let HR lock themselves out by switching it on.
      const [{ data: role }, { data: me }] = await Promise.all([
        admin.from("profiles").select("role").eq("user_id", user.id).maybeSingle(),
        admin.from("people").select("active, employment_type").eq("user_id", user.id).maybeSingle(),
      ]);
      const mine = accessDecision({ enforce: true, isAdmin: (role as { role?: string } | null)?.role === "admin", person: me as { active: boolean; employment_type: string | null } | null });
      if (!mine.ok) return NextResponse.json({ error: "self_locked" }, { status: 400 });
    }
    const { error } = await admin.from("app_settings").upsert({ key: "access", value: { enforce: body.enforce }, updated_at: new Date().toISOString() });
    if (error) return NextResponse.json({ error: error.message }, { status: 502 });
    return NextResponse.json({ ok: true, enforce: body.enforce });
  }

  if (typeof body.import === "string") {
    if (body.import.length > 200_000) return NextResponse.json({ error: "The list is too long" }, { status: 413 });
    const parsed = parseAccessImport(body.import);
    const { data, error } = await admin.from("people").select(ACCESS_ROW_COLUMNS);
    if (error) return NextResponse.json({ error: error.message }, { status: 502 });
    const people = (data as AccessRow[] | null) ?? [];
    const plan = planAccessImport(parsed.rows, people);
    if (body.apply !== true) return NextResponse.json({ plan, errors: parsed.errors });

    const failed: string[] = [];
    for (const u of plan.updates) {
      const { error: e } = await admin.from("people").update({ employment_type: u.to, legal_entity: u.entity }).eq("id", u.personId);
      if (e) failed.push(`${u.email}: ${e.message}`);
    }
    if (plan.creates.length) {
      const { data: domains } = await admin.from("allowed_email_domains").select("domain, company_id");
      const companyOf = new Map(((domains as { domain: string; company_id: string | null }[] | null) ?? []).map(d => [d.domain, d.company_id]));
      for (const c of plan.creates) {
        const company = companyOf.get(c.email.split("@")[1] ?? "") ?? null;
        const { error: e } = await admin.from("people").insert({
          full_name: c.name, email: c.email, employment_type: c.type, legal_entity: c.entity, active: true,
          company_id: company, companies: company ? [company] : [],
        });
        if (e) failed.push(`${c.email}: ${e.message}`);
      }
    }
    return NextResponse.json({ plan, errors: parsed.errors, failed });
  }
  return NextResponse.json({ error: "Nothing to do" }, { status: 400 });
}

/** One person's HR fields: { id, employment_type?, legal_entity?, alt_emails?, holiday_calendar? }. */
export async function PATCH(request: NextRequest) {
  const g = await hrOnly();
  if ("error" in g) return g.error;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = typeof body.id === "string" ? body.id : "";
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Person not found" }, { status: 404 });

  const patch: Record<string, unknown> = {};
  if ("employment_type" in body) {
    if (body.employment_type !== null && !isEmploymentType(body.employment_type)) return NextResponse.json({ error: "Unknown employment type" }, { status: 400 });
    patch.employment_type = body.employment_type;
  }
  if ("legal_entity" in body) patch.legal_entity = String(body.legal_entity ?? "").trim().slice(0, 120);
  if ("holiday_calendar" in body) {
    const c = body.holiday_calendar;
    if (c !== null && !(HOLIDAY_CALENDARS as readonly unknown[]).includes(c)) return NextResponse.json({ error: "Unknown calendar" }, { status: 400 });
    patch.holiday_calendar = c;
  }
  if ("alt_emails" in body) {
    const list = Array.isArray(body.alt_emails) ? body.alt_emails.map(e => String(e).trim().toLowerCase()).filter(Boolean) : [];
    const bad = list.find(e => !EMAIL_RE.test(e));
    if (bad) return NextResponse.json({ error: `Not an email address: ${bad}` }, { status: 400 });
    if (list.length > 5) return NextResponse.json({ error: "At most 5 other emails" }, { status: 400 });
    // An address can belong to one person only.
    const { data: others } = await g.admin.from("people").select("id, full_name, email, alt_emails").neq("id", id);
    const taken = ((others as { id: string; full_name: string; email: string | null; alt_emails: string[] }[] | null) ?? []).find(p => emailsOf(p).some(e => list.includes(e)));
    if (taken) return NextResponse.json({ error: `Already used by ${taken.full_name}` }, { status: 409 });
    patch.alt_emails = [...new Set(list)];
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to change" }, { status: 400 });

  const { data, error } = await g.admin.from("people").update(patch).eq("id", id).select(ACCESS_ROW_COLUMNS).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  if (!data) return NextResponse.json({ error: "Person not found" }, { status: 404 });
  return NextResponse.json({ person: data });
}
