/** Department playbooks (SOPs, policies, rules, checklists, guides) — see migration 0010. */
export const PLAYBOOK_KINDS = ["sop", "policy", "rule", "checklist", "guide"] as const;
export type PlaybookKind = (typeof PLAYBOOK_KINDS)[number];
/** `images` are storage paths in the private "playbooks" bucket (see migration 0011). */
export type PlaybookStep = { title: string; body: string; images?: string[] };

export const PLAYBOOK_BUCKET = "playbooks";
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type Playbook = {
  id: string;
  department_id: string;
  company_id: string | null;
  kind: PlaybookKind;
  title: string;
  summary: string;
  category: string;
  body: string;
  steps: PlaybookStep[];
  link_url: string | null;
  owner_person_id: string | null;
  review_by: string | null;
  status: "draft" | "published";
  ack_required: boolean;
  /** "department": only people with access to this department see it (migration 0014). */
  visibility?: "everyone" | "department";
  language: string | null;
  updated_at: string;
};

export const PLAYBOOK_COLUMNS =
  "id, department_id, company_id, kind, title, summary, category, body, steps, link_url, owner_person_id, review_by, status, ack_required, language, updated_at, visibility";

/** Review date passed (YYYY-MM-DD compared with today's local date). */
export const reviewOverdue = (reviewBy: string | null, today: string) => !!reviewBy && reviewBy < today;
