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
};

export const HIRE_COLUMNS =
  "id, person_id, full_name, personal_email, title, department_id, reports_to, company_id, start_date, needs_email, needs_phone, phone_area_code, access_departments, notes, company_email, phone_number, accounts, it_notes, status, it_done_at, linked_at, created_by, created_at";

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
};

export const MODULE_COLUMNS = "id, scope, company_id, department_id, title, summary, content_kind, content_url, body, pass_mark, sort, published";

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

/** A person's path: GMX modules, then their brands', then their departments' — each by `sort`. */
export function trainingPath(modules: TrainingModule[], brands: string[], departments: string[]): TrainingModule[] {
  return modules
    .filter(m => m.published)
    .filter(m => m.scope === "gmx" || (m.scope === "brand" && !!m.company_id && brands.includes(m.company_id)) || (m.scope === "department" && !!m.department_id && departments.includes(m.department_id)))
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
