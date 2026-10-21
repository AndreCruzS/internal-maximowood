/**
 * Time off with manager approval (migration 0024) and the HR & Pay links into Rippling.
 * Pure helpers shared by the page, the home "Who's out" panel and the email route.
 */

export const TIME_OFF_STATUSES = ["pending", "approved", "declined", "cancelled"] as const;
export type TimeOffStatus = (typeof TIME_OFF_STATUSES)[number];

export type TimeOffRow = {
  id: string;
  person_id: string;
  starts_on: string;
  ends_on: string;
  kind: string;
  note: string;
  covered_by: string[] | null;
  status: TimeOffStatus;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string;
  source: "intranet" | "rippling";
  created_at: string;
};

export const TIME_OFF_COLUMNS = "id, person_id, starts_on, ends_on, kind, note, covered_by, status, decided_by, decided_at, decision_note, source, created_at";

/** Rows from before migration 0024 have no status: they were all approved. */
export const isApproved = (a: { status?: string | null }) => (a.status ?? "approved") === "approved";

/** Weekdays (Mon–Fri) from starts_on to ends_on, both included. Dates are YYYY-MM-DD. */
export function workdays(startsOn: string, endsOn: string): number {
  const start = new Date(`${startsOn}T12:00:00Z`);
  const end = new Date(`${endsOn}T12:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  let n = 0;
  for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) n++;
  }
  return n;
}

/** Can the person still cancel it? Pending, or approved and not over yet. */
export const canCancel = (a: Pick<TimeOffRow, "status" | "ends_on" | "source">, today: string) =>
  a.source !== "rippling" && (a.status === "pending" || (a.status === "approved" && a.ends_on >= today));

// ── HR & Pay links (app_settings 'hr_pay') ────────────────────────────────────
export const HR_LINK_IDS = ["paystubs", "tax", "benefits", "timeoff", "profile", "documents"] as const;
export type HrLinkId = (typeof HR_LINK_IDS)[number];
export type HrLink = { id: HrLinkId; url: string };
export type HrPaySettings = { links: HrLink[]; note: string };

export const RIPPLING_HOME = "https://app.rippling.com/";

const isHttps = (url: unknown): url is string => {
  if (typeof url !== "string") return false;
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
};

/** The stored setting, cleaned: every known link once, in order, https only (else Rippling's home page). */
export function parseHrPay(value: unknown): HrPaySettings {
  const v = (value ?? {}) as { links?: unknown; note?: unknown };
  const stored = new Map<string, string>();
  if (Array.isArray(v.links)) {
    for (const l of v.links as { id?: unknown; url?: unknown }[]) {
      if (typeof l?.id === "string" && isHttps(l.url) && !stored.has(l.id)) stored.set(l.id, l.url.trim());
    }
  }
  return {
    links: HR_LINK_IDS.map(id => ({ id, url: stored.get(id) ?? RIPPLING_HOME })),
    note: typeof v.note === "string" ? v.note.slice(0, 1000) : "",
  };
}

/** Validates an edit before saving: returns the ids whose URL isn't a valid https link. */
export const invalidLinks = (links: { id: string; url: string }[]) => links.filter(l => !isHttps(l.url.trim())).map(l => l.id);
