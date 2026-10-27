/**
 * Rippling → intranet sync: the shapes both sides agree on, the mapping settings and
 * the pure diff (what a sync would change). No I/O here; the client, sample data and
 * the writes live in src/server/rippling/.
 */

/** A Rippling worker, normalized (src/server/rippling/fields.ts reads Rippling's raw fields). */
export type RipplingWorker = {
  id: string;
  fullName: string;
  workEmail: string | null;
  personalEmail: string | null;
  title: string;
  /** Rippling's department name, mapped to an intranet department with the settings. */
  department: string | null;
  /** Rippling worker id of their manager. */
  managerId: string | null;
  startDate: string | null;
  endDate: string | null;
  status: "active" | "hired" | "terminated" | "other";
  /** Work location name, mapped to an intranet office. */
  location: string | null;
  /** Legal entity / company name, mapped to an intranet company. */
  entity: string | null;
  /** W2 employee or contractor (Rippling's employment type); undefined when Rippling doesn't say. */
  employmentType?: "w2" | "contractor" | null;
};

/** Approved / cancelled time off from Rippling. */
export type RipplingLeave = {
  id: string;
  workerId: string;
  startDate: string;
  endDate: string;
  status: "approved" | "pending" | "declined" | "cancelled";
  type: string;
};

export type RipplingSettings = {
  enabled: boolean;
  /** Rippling name → intranet id ("" = not mapped). */
  departments: Record<string, string>;
  companies: Record<string, string>;
  offices: Record<string, string>;
};

export const DEFAULT_RIPPLING_SETTINGS: RipplingSettings = { enabled: false, departments: {}, companies: {}, offices: {} };

const strMap = (v: unknown): Record<string, string> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k, x]) => k.trim() && typeof x === "string").map(([k, x]) => [k, x as string]))
    : {};

export function parseRipplingSettings(value: unknown): RipplingSettings {
  const v = (value ?? {}) as Record<string, unknown>;
  return { enabled: v.enabled === true, departments: strMap(v.departments), companies: strMap(v.companies), offices: strMap(v.offices) };
}

/** The intranet's side, as the sync reads it. */
export type IntranetPerson = {
  id: string;
  full_name: string;
  email: string | null;
  rippling_id: string | null;
  start_date: string | null;
  office: string | null;
  company_id: string | null;
  active: boolean;
  /** The person's main position (lowest sort), if any. */
  position: { id: string; title: string; department_id: string | null; reports_to: string | null } | null;
  /** person id of whoever holds the position they report to. */
  manager_person_id: string | null;
  open_offboarding: boolean;
  /** 0033: other addresses (matched too), employment type and payroll entity. */
  alt_emails?: string[];
  employment_type?: string | null;
  legal_entity?: string;
};

export type FieldChange = { field: "title" | "department" | "manager" | "start_date" | "office" | "company" | "employment_type" | "legal_entity"; from: string | null; to: string | null };

export type SyncPlan = {
  /** In Rippling, not in the intranet: new people (isNewHire → the onboarding / IT flow). */
  creates: { worker: RipplingWorker; departmentId: string | null; companyId: string | null; office: string | null; managerPersonId: string | null; isNewHire: boolean }[];
  /** Matched people whose Rippling fields differ, or who aren't linked yet. */
  updates: { personId: string; name: string; workerId: string; link: boolean; changes: FieldChange[]; values: { title: string; departmentId: string | null; managerPersonId: string | null; startDate: string | null; office: string | null; companyId: string | null; employmentType: string | null; legalEntity: string } }[];
  /** Terminated in Rippling, still active here with no offboarding open. */
  leavers: { personId: string; name: string; lastDay: string }[];
  /** Approved Rippling time off to upsert, and time off to cancel. */
  leave: { upsert: { externalId: string; personId: string; startsOn: string; endsOn: string; kind: string; note: string }[]; cancel: string[] };
  unchanged: number;
  /** Rippling values with no intranet mapping yet (shown in the mapping editor). */
  unmapped: { departments: string[]; companies: string[]; offices: string[] };
  /** Everything Rippling uses, for the mapping editor. */
  seen: { departments: string[]; companies: string[]; offices: string[] };
};

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/** Rippling leave types → the intranet's absence kinds. */
export function leaveKind(type: string): string {
  const t = norm(type);
  if (/sick|illness|medical/.test(t)) return "sick";
  if (/holiday/.test(t)) return "holiday";
  if (/vacation|pto|paid time off|personal/.test(t)) return "vacation";
  return "ooo";
}

/**
 * What a sync would change. Matching: people.rippling_id first, then work email.
 * Never deletes anyone; a new hire is someone starting within `newHireDays` (or still "hired").
 */
export function diffRippling(
  workers: RipplingWorker[],
  people: IntranetPerson[],
  settings: RipplingSettings,
  opts: { today: string; newHireDays?: number; leave?: RipplingLeave[]; existingLeave?: { externalId: string; status: string }[] },
): SyncPlan {
  const newHireDays = opts.newHireDays ?? 30;
  const byRippling = new Map(people.filter(p => p.rippling_id).map(p => [p.rippling_id!, p]));
  const byEmail = new Map<string, IntranetPerson>();
  for (const p of people) for (const e of [p.email, ...(p.alt_emails ?? [])]) if (e && !byEmail.has(norm(e))) byEmail.set(norm(e), p);
  const used = new Set<string>();
  const matchOf = new Map<string, IntranetPerson>();
  for (const w of workers) {
    const p = byRippling.get(w.id) ?? (w.workEmail ? byEmail.get(norm(w.workEmail)) : undefined);
    if (p && !used.has(p.id)) {
      used.add(p.id);
      matchOf.set(w.id, p);
    }
  }
  const managerPerson = (w: RipplingWorker) => (w.managerId ? matchOf.get(w.managerId)?.id ?? null : null);
  const map = (m: Record<string, string>, key: string | null) => (key && m[key] ? m[key] : null);

  const seen = { departments: new Set<string>(), companies: new Set<string>(), offices: new Set<string>() };
  const unmapped = { departments: new Set<string>(), companies: new Set<string>(), offices: new Set<string>() };
  const note = (kind: keyof typeof seen, key: string | null, m: Record<string, string>) => {
    if (!key) return;
    seen[kind].add(key);
    if (!m[key]) unmapped[kind].add(key);
  };

  const plan: SyncPlan = { creates: [], updates: [], leavers: [], leave: { upsert: [], cancel: [] }, unchanged: 0, unmapped: { departments: [], companies: [], offices: [] }, seen: { departments: [], companies: [], offices: [] } };
  const startCutoff = new Date(`${opts.today}T12:00:00Z`);
  startCutoff.setUTCDate(startCutoff.getUTCDate() - newHireDays);
  const cutoff = startCutoff.toISOString().slice(0, 10);

  for (const w of workers) {
    note("departments", w.department, settings.departments);
    note("companies", w.entity, settings.companies);
    note("offices", w.location, settings.offices);
    const departmentId = map(settings.departments, w.department);
    const companyId = map(settings.companies, w.entity);
    const office = map(settings.offices, w.location);
    const p = matchOf.get(w.id);

    if (w.status === "terminated") {
      if (p && p.active && !p.open_offboarding) plan.leavers.push({ personId: p.id, name: p.full_name, lastDay: w.endDate ?? opts.today });
      continue;
    }
    if (w.status === "other") continue;
    if (!p) {
      const isNewHire = w.status === "hired" || (!!w.startDate && w.startDate >= cutoff);
      plan.creates.push({ worker: w, departmentId, companyId, office, managerPersonId: managerPerson(w), isNewHire });
      continue;
    }
    // Only overwrite with what Rippling actually provides (and is mapped): never blank a field out.
    const values = {
      title: w.title || p.position?.title || "",
      departmentId: departmentId ?? p.position?.department_id ?? null,
      // A manager Rippling names but the intranet doesn't know yet keeps the current one.
      managerPersonId: managerPerson(w) ?? p.manager_person_id,
      startDate: w.startDate ?? p.start_date,
      office: office ?? p.office,
      companyId: companyId ?? p.company_id,
      // Contractors stay out of the intranet (W2-only access): Rippling's word wins over HR's list.
      employmentType: w.employmentType ?? p.employment_type ?? null,
      legalEntity: (w.entity ?? p.legal_entity ?? "").slice(0, 120),
    };
    const changes: FieldChange[] = [];
    const push = (field: FieldChange["field"], from: string | null | undefined, to: string | null) => {
      if ((from ?? null) !== to) changes.push({ field, from: from ?? null, to });
    };
    push("title", p.position?.title, values.title || null);
    push("department", p.position?.department_id, values.departmentId);
    push("manager", p.manager_person_id, values.managerPersonId);
    push("start_date", p.start_date, values.startDate);
    push("office", p.office, values.office);
    push("company", p.company_id, values.companyId);
    push("employment_type", p.employment_type, values.employmentType);
    if (p.legal_entity !== undefined) push("legal_entity", p.legal_entity || null, values.legalEntity || null);
    const link = p.rippling_id !== w.id;
    if (changes.length || link) plan.updates.push({ personId: p.id, name: p.full_name, workerId: w.id, link, changes, values });
    else plan.unchanged++;
  }

  // Time off: approved Rippling leave for people we know; cancel what Rippling no longer approves.
  const existing = new Map((opts.existingLeave ?? []).map(l => [l.externalId, l.status]));
  for (const l of opts.leave ?? []) {
    const p = matchOf.get(l.workerId);
    if (!p) continue;
    if (l.status === "approved") {
      plan.leave.upsert.push({ externalId: l.id, personId: p.id, startsOn: l.startDate, endsOn: l.endDate < l.startDate ? l.startDate : l.endDate, kind: leaveKind(l.type), note: l.type });
    } else if ((l.status === "cancelled" || l.status === "declined") && existing.get(l.id) === "approved") {
      plan.leave.cancel.push(l.id);
    }
  }

  const sorted = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b));
  plan.seen = { departments: sorted(seen.departments), companies: sorted(seen.companies), offices: sorted(seen.offices) };
  plan.unmapped = { departments: sorted(unmapped.departments), companies: sorted(unmapped.companies), offices: sorted(unmapped.offices) };
  return plan;
}

export const planCounts = (p: SyncPlan) => ({
  creates: p.creates.length,
  newHires: p.creates.filter(c => c.isNewHire).length,
  updates: p.updates.length,
  leavers: p.leavers.length,
  leave: p.leave.upsert.length,
  leaveCancelled: p.leave.cancel.length,
  unchanged: p.unchanged,
});
