/**
 * W2-only access (migration 0033). Pure rules shared by sign-in, the app layout and HR's
 * Access page; the lookups live in src/server/access.ts.
 */

export const EMPLOYMENT_TYPES = ["w2", "contractor", "clt", "pj"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

/**
 * Who may sign in once the check is on. W2-only is a US rule: everyone on the Brazil team
 * (work_country BR, 0034) gets in whatever their contract; CLT / PJ also count.
 */
export const ACCESS_TYPES: readonly EmploymentType[] = ["w2", "clt", "pj"];

export type AccessSettings = { enforce: boolean };
export const parseAccessSettings = (value: unknown): AccessSettings => ({ enforce: (value as { enforce?: unknown } | null)?.enforce === true });

export type AccessPerson = { active: boolean; employment_type: string | null; work_country?: string | null };

export type AccessDecision = { ok: true } | { ok: false; reason: "no_person" | "inactive" | "not_enabled" };

export function accessDecision(opts: { enforce: boolean; isAdmin: boolean; person: AccessPerson | null }): AccessDecision {
  if (!opts.enforce || opts.isAdmin) return { ok: true };
  const p = opts.person;
  if (!p) return { ok: false, reason: "no_person" };
  if (!p.active) return { ok: false, reason: "inactive" };
  if (p.work_country === "BR") return { ok: true };
  if (!(ACCESS_TYPES as readonly string[]).includes(p.employment_type ?? "")) return { ok: false, reason: "not_enabled" };
  return { ok: true };
}

export const WORK_COUNTRIES = ["US", "BR"] as const;
export type WorkCountry = (typeof WORK_COUNTRIES)[number];
export const isWorkCountry = (v: unknown): v is WorkCountry => typeof v === "string" && (WORK_COUNTRIES as readonly string[]).includes(v);

export const isEmploymentType = (v: unknown): v is EmploymentType => typeof v === "string" && (EMPLOYMENT_TYPES as readonly string[]).includes(v);

/** "W-2", "Employee", "Contractor", "1099", "CLT", "PJ"… → an employment type. */
export function parseEmploymentType(raw: string): EmploymentType | null {
  const s = raw.trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (!s) return null;
  if (s === "w2" || s === "employee" || s === "fulltime" || s === "parttime" || s === "salaried" || s === "hourly") return "w2";
  if (s === "clt") return "clt";
  if (s === "pj") return "pj";
  if (s.includes("contract") || s === "1099" || s === "freelancer") return "contractor";
  return null;
}

export type ImportRow = { line: number; email: string; type: EmploymentType; name: string; entity: string };
export type ImportParse = { rows: ImportRow[]; errors: { line: number; text: string; problem: "email" | "type" }[] };

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i;

/**
 * HR's pasted list, one person per line: email, type[, full name[, legal entity]].
 * Commas, tabs (a spreadsheet copy) or semicolons separate the columns; a header line is skipped.
 */
export function parseAccessImport(text: string): ImportParse {
  const out: ImportParse = { rows: [], errors: [] };
  const seen = new Set<string>();
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    const cols = raw.split(/\t|;|,/).map(c => c.trim());
    if (!cols.join("")) return;
    const email = cols[0].toLowerCase();
    if (!EMAIL_RE.test(email)) {
      if (i === 0 && /mail/i.test(cols[0])) return; // header
      out.errors.push({ line, text: raw.trim().slice(0, 80), problem: "email" });
      return;
    }
    const type = parseEmploymentType(cols[1] ?? "");
    if (!type) {
      out.errors.push({ line, text: raw.trim().slice(0, 80), problem: "type" });
      return;
    }
    if (seen.has(email)) return;
    seen.add(email);
    out.rows.push({ line, email, type, name: (cols[2] ?? "").slice(0, 120), entity: (cols[3] ?? "").slice(0, 120) });
  });
  return out;
}

/** A person's addresses (main + others), lower-cased. */
export const emailsOf = (p: { email: string | null; alt_emails?: string[] | null }) =>
  [p.email, ...(p.alt_emails ?? [])].filter((e): e is string => !!e).map(e => e.trim().toLowerCase());

/** A directory entry as HR's Access page shows and edits it. */
export type AccessRow = {
  id: string; full_name: string; email: string | null; alt_emails: string[]; employment_type: EmploymentType | null;
  legal_entity: string; holiday_calendar: string | null; work_country: WorkCountry | null; office: string | null; company_id: string | null; active: boolean; user_id: string | null;
};

export type ImportPlan = {
  updates: { personId: string; name: string; email: string; from: EmploymentType | null; to: EmploymentType; entity: string }[];
  creates: { email: string; name: string; type: EmploymentType; entity: string }[];
  /** Not in the directory and no name given, so they can't be added. */
  missingName: string[];
  unchanged: number;
};

/** What a pasted list would change: matched by main or other email; unknown addresses with a name are added. */
export function planAccessImport(rows: ImportRow[], people: Pick<AccessRow, "id" | "full_name" | "email" | "alt_emails" | "employment_type" | "legal_entity">[]): ImportPlan {
  const byEmail = new Map<string, (typeof people)[number]>();
  for (const p of people) for (const e of emailsOf(p)) if (!byEmail.has(e)) byEmail.set(e, p);
  const plan: ImportPlan = { updates: [], creates: [], missingName: [], unchanged: 0 };
  const touched = new Set<string>();
  for (const r of rows) {
    const p = byEmail.get(r.email);
    if (!p) {
      if (r.name) plan.creates.push({ email: r.email, name: r.name, type: r.type, entity: r.entity });
      else plan.missingName.push(r.email);
      continue;
    }
    if (touched.has(p.id)) continue;
    touched.add(p.id);
    const entity = r.entity || p.legal_entity;
    if (p.employment_type === r.type && entity === p.legal_entity) plan.unchanged++;
    else plan.updates.push({ personId: p.id, name: p.full_name, email: r.email, from: p.employment_type, to: r.type, entity });
  }
  return plan;
}

/** Signed-in accounts the check would refuse if it were switched on now. */
export function wouldBeRefused(
  accounts: { user_id: string; email: string; role: string }[],
  people: Pick<AccessRow, "email" | "alt_emails" | "employment_type" | "active" | "user_id" | "work_country">[],
): { email: string; reason: "no_person" | "inactive" | "not_enabled" }[] {
  const byUser = new Map(people.filter(p => p.user_id).map(p => [p.user_id!, p]));
  const byEmail = new Map<string, (typeof people)[number]>();
  for (const p of people) for (const e of emailsOf(p)) if (!byEmail.has(e) || (p.active && !byEmail.get(e)!.active)) byEmail.set(e, p);
  const out: { email: string; reason: "no_person" | "inactive" | "not_enabled" }[] = [];
  for (const a of accounts) {
    const person = byUser.get(a.user_id) ?? byEmail.get(a.email.toLowerCase()) ?? null;
    const d = accessDecision({ enforce: true, isAdmin: a.role === "admin", person });
    if (!d.ok) out.push({ email: a.email, reason: d.reason });
  }
  return out.sort((x, y) => x.email.localeCompare(y.email));
}
