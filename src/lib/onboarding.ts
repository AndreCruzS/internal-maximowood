/** Onboarding: new hires (leader → IT → employee) and training modules with quizzes — see migration 0014. */

export type HireStatus = "it_setup" | "ready" | "onboarding" | "done" | "cancelled";
export type HireAccount = { name: string; login: string; url: string };

export type NewHire = {
  id: string;
  person_id: string;
  full_name: string;
  personal_email: string;
  title: string;
  department_id: string | null;
  reports_to: string | null;
  company_id: string | null;
  start_date: string | null;
  needs_email: boolean;
  needs_phone: boolean;
  phone_area_code: string | null;
  access_departments: string[];
  notes: string;
  company_email: string | null;
  phone_number: string | null;
  accounts: HireAccount[];
  it_notes: string;
  status: HireStatus;
  it_done_at: string | null;
  linked_at: string | null;
  created_by: string | null;
  created_at: string;
  buddy_id: string | null;
  first_day: string;
  plan: PlanItem[];
  checklist: Record<string, { at: string; by: string | null }>;
};

export const HIRE_COLUMNS =
  "id, person_id, full_name, personal_email, title, department_id, reports_to, company_id, start_date, needs_email, needs_phone, phone_area_code, access_departments, notes, company_email, phone_number, accounts, it_notes, status, it_done_at, linked_at, created_by, created_at, buddy_id, first_day, plan, checklist";

export type TrainingScope = "gmx" | "brand" | "department";
export type ContentKind = "slides" | "pdf" | "video" | "link" | "text" | "resources";
export const CONTENT_KINDS: ContentKind[] = ["slides", "pdf", "video", "link", "text", "resources"];

export type TrainingModule = {
  id: string;
  scope: TrainingScope;
  company_id: string | null;
  department_id: string | null;
  title: string;
  summary: string;
  content_kind: ContentKind;
  content_url: string | null;
  body: string;
  pass_mark: number;
  sort: number;
  published: boolean;
  is_sample: boolean;
};

export const MODULE_COLUMNS = "id, scope, company_id, department_id, title, summary, content_kind, content_url, body, pass_mark, sort, published, is_sample";

export type TrainingQuestion = { id: string; module_id: string; question: string; options: string[]; multiple: boolean; sort: number };

export type QuizResult = {
  score: number;
  passed: boolean;
  right: number;
  total: number;
  results: { question: string; correct: boolean; answer: number[]; explanation: string }[];
};

export type AttemptSummary = { module_id: string; best: number; passed: boolean; tries: number };

/** Index of the first step not passed yet; steps after it are locked. */
export const firstOpenStep = (path: TrainingModule[], attempts: Record<string, AttemptSummary>) => {
  const i = path.findIndex(m => !attempts[m.id]?.passed);
  return i === -1 ? path.length : i;
};

const SCOPE_ORDER: Record<TrainingScope, number> = { gmx: 0, brand: 1, department: 2 };

/**
 * A person's path: GMX modules, then their brands', then their departments' — each by `sort`.
 * Sample modules (only training editors can read them) join every path so editors can try the flow.
 */
export function trainingPath(modules: TrainingModule[], brands: string[], departments: string[], samples = true): TrainingModule[] {
  return modules
    .filter(m => m.published && (samples || !m.is_sample))
    .filter(m => m.is_sample || m.scope === "gmx" || (m.scope === "brand" && !!m.company_id && brands.includes(m.company_id)) || (m.scope === "department" && !!m.department_id && departments.includes(m.department_id)))
    .sort((a, b) => SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope] || a.sort - b.sort || a.title.localeCompare(b.title));
}

/** Embeddable URL for a presentation: Google Slides/Drive → /embed or /preview, YouTube/Vimeo → player; PDFs as-is. */
export function embedUrl(kind: ContentKind, url: string | null): string | null {
  if (!url) return null;
  if (kind === "slides") {
    const m = url.match(/docs\.google\.com\/presentation\/d\/([^/]+)/);
    return m ? `https://docs.google.com/presentation/d/${m[1]}/embed?start=false&loop=false` : url;
  }
  if (kind === "video") {
    const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{6,})/);
    if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
    const vimeo = url.match(/vimeo\.com\/(\d+)/);
    if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
    return url;
  }
  if (kind === "pdf") {
    const drive = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
    return drive ? `https://drive.google.com/file/d/${drive[1]}/preview` : url;
  }
  return null;
}

// ── Before day one: the hiring leader's and IT's checklist (migration 0015) ──

export type PlanPhase = "day" | "week" | "month" | "quarter";
export const PLAN_PHASES: PlanPhase[] = ["day", "week", "month", "quarter"];
export type PlanItem = { phase: PlanPhase; text: string };

export type CheckOwner = "leader" | "it";
export type CheckKey = "info" | "buddy" | "first_day" | "plan" | "welcome_email" | "equipment" | "company_email" | "phone" | "accounts" | "credentials_sent";
export type CheckItem = { key: CheckKey; owner: CheckOwner; manual: boolean; done: boolean; at: string | null };

/** Ticked by hand (stored in new_hires.checklist); the rest follow from what's filled in. */
export const MANUAL_CHECKS: CheckKey[] = ["welcome_email", "equipment", "credentials_sent"];

export function prehireChecklist(h: NewHire): CheckItem[] {
  const auto = (key: CheckKey, owner: CheckOwner, done: boolean): CheckItem => ({ key, owner, manual: false, done, at: null });
  const manual = (key: CheckKey, owner: CheckOwner): CheckItem => ({ key, owner, manual: true, done: !!h.checklist?.[key], at: h.checklist?.[key]?.at ?? null });
  return [
    auto("info", "leader", !!(h.title && h.department_id && h.reports_to && h.start_date && h.personal_email)),
    auto("buddy", "leader", !!h.buddy_id),
    auto("first_day", "leader", !!h.first_day?.trim()),
    auto("plan", "leader", (h.plan ?? []).some(p => p.text.trim())),
    manual("welcome_email", "leader"),
    ...(h.needs_email ? [auto("company_email", "it", !!h.company_email)] : []),
    ...(h.needs_phone ? [auto("phone", "it", !!h.phone_number)] : []),
    auto("accounts", "it", (h.accounts ?? []).length > 0),
    manual("equipment", "it"),
    manual("credentials_sent", "it"),
  ];
}

/** What the new hire does: sign in, the welcome form, then every training step. */
export function employeeSteps(h: Pick<NewHire, "linked_at">, welcomeDone: boolean, path: TrainingModule[], attempts: Record<string, AttemptSummary>) {
  const passed = path.filter(m => attempts[m.id]?.passed).length;
  return { done: (h.linked_at ? 1 : 0) + (welcomeDone ? 1 : 0) + passed, total: 2 + path.length, passed };
}

export type HireProgress = { leader: [number, number]; employee: [number, number] };

export function hireProgress(h: NewHire, welcomeDone: boolean, path: TrainingModule[], attempts: Record<string, AttemptSummary>): HireProgress {
  const list = prehireChecklist(h);
  const e = employeeSteps(h, welcomeDone, path, attempts);
  return { leader: [list.filter(i => i.done).length, list.length], employee: [e.done, e.total] };
}

export const isComplete = (p: HireProgress) => p.leader[0] >= p.leader[1] && p.employee[0] >= p.employee[1];
