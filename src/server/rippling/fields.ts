import type { RipplingLeave, RipplingWorker } from "@/lib/rippling";

/**
 * Everything that depends on Rippling's real field names and endpoints, in one place.
 *
 * UNVERIFIED: built from third-party integration guides, not Rippling's own docs (they
 * weren't reachable when this was written) and not against a real token. Check each
 * name below on the first real sync (the "Preview" shows what was read) and fix it here.
 */

/** API token scopes to ask the Rippling admin for (read only). */
export const RIPPLING_SCOPES = ["workers.read", "users.read", "departments.read", "teams.read", "work-locations.read", "companies.read", "leave_requests.read"] as const;

export const RIPPLING_REST_URL = "https://rest.ripplingapis.com";
/** Leave requests live on the older Platform API, same token. */
export const RIPPLING_PLATFORM_URL = "https://api.rippling.com/platform/api";

export const ENDPOINTS = {
  workers: "/workers",
  departments: "/departments",
  workLocations: "/work-locations",
  leaveRequests: "/leave_requests",
} as const;

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const str = (...vs: unknown[]): string | null => {
  for (const v of vs) if (typeof v === "string" && v.trim()) return v.trim();
  return null;
};
const ymd = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

/** A named lookup ({ id → name }) for departments / locations that workers reference by id. */
export type Lookup = Map<string, string>;
export const lookupFrom = (rows: unknown[]): Lookup =>
  new Map(rows.map(obj).map(r => [str(r.id) ?? "", str(r.name, r.title, obj(r.address).city) ?? ""] as [string, string]).filter(([k, v]) => k && v));

const nameOf = (v: unknown, lookup?: Lookup) => {
  if (typeof v === "string") return lookup?.get(v) ?? v;
  const o = obj(v);
  return str(o.name, o.title) ?? (str(o.id) && lookup?.get(str(o.id)!)) ?? null;
};

/** Rippling employment status → active / hired / terminated. */
export function workerStatus(raw: unknown): RipplingWorker["status"] {
  const s = (str(raw) ?? "").toUpperCase();
  if (/TERMINATED|INACTIVE|OFFBOARD/.test(s)) return "terminated";
  if (/HIRED|PENDING|ACCEPTED|ONBOARD/.test(s)) return "hired";
  if (/ACTIVE/.test(s)) return "active";
  return "other";
}

export function normalizeWorker(raw: unknown, lookups: { departments?: Lookup; locations?: Lookup } = {}): RipplingWorker | null {
  const w = obj(raw);
  const user = obj(w.user);
  const name = obj(user.name ?? w.name);
  const id = str(w.id);
  if (!id) return null;
  const first = str(name.given_name, name.first_name, w.first_name, user.first_name);
  const last = str(name.family_name, name.last_name, w.last_name, user.last_name);
  const fullName = str(name.display_name, name.formatted, w.display_name, [first, last].filter(Boolean).join(" ")) ?? id;
  return {
    id,
    fullName,
    workEmail: str(w.work_email, user.work_email, obj(user.emails).work, w.email)?.toLowerCase() ?? null,
    personalEmail: str(w.personal_email, user.personal_email, obj(user.emails).personal)?.toLowerCase() ?? null,
    title: str(w.title, obj(w.employment).title, w.job_title) ?? "",
    department: nameOf(w.department ?? w.department_id, lookups.departments),
    managerId: str(w.manager_id, obj(w.manager).id, w.manager),
    startDate: ymd(str(w.start_date, obj(w.employment).start_date)),
    endDate: ymd(str(w.end_date, w.termination_date, obj(w.termination).date)),
    status: workerStatus(w.status ?? w.employment_status ?? obj(w.employment).status),
    location: nameOf(w.work_location ?? w.location ?? w.work_location_id, lookups.locations),
    entity: nameOf(w.legal_entity ?? w.company ?? w.entity, undefined),
  };
}

export function leaveStatus(raw: unknown): RipplingLeave["status"] {
  const s = (str(raw) ?? "").toUpperCase();
  if (/APPROVED|TAKEN/.test(s)) return "approved";
  if (/REJECT|DECLIN|DENIED/.test(s)) return "declined";
  if (/CANCEL/.test(s)) return "cancelled";
  return "pending";
}

export function normalizeLeave(raw: unknown): RipplingLeave | null {
  const l = obj(raw);
  const id = str(l.id);
  const workerId = str(l.role, l.worker_id, l.requested_by, obj(l.worker).id, l.employee_id);
  const startDate = ymd(str(l.start_date, l.startDate));
  const endDate = ymd(str(l.end_date, l.endDate)) ?? startDate;
  if (!id || !workerId || !startDate || !endDate) return null;
  return { id, workerId, startDate, endDate, status: leaveStatus(l.status), type: str(l.leave_type_name, obj(l.leave_policy).name, l.leave_type, l.type) ?? "Time off" };
}
