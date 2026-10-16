/** Refer a candidate (migration 0021): anyone refers; Recruiting reviews. */
export const REFERRAL_STATUSES = ["submitted", "in_review", "interviewing", "hired", "not_selected"] as const;
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];
export const EMPLOYMENT_TYPES = ["w2", "1099", "clt", "pj", "other"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export type OpenRole = { id: string; title: string; company_label: string; location: string; employment_type: EmploymentType; status: "open" | "closed"; sort: number };
export type Referral = {
  id: string;
  referrer_id: string;
  referrer_person_id: string | null;
  candidate_name: string;
  candidate_email: string;
  role_id: string | null;
  resume_path: string | null;
  resume_name: string;
  note: string;
  status: ReferralStatus;
  hired_on: string | null;
  bonus_eligible_on: string | null;
  bonus_paid: boolean;
  created_at: string;
};
export const ROLE_COLUMNS = "id, title, company_label, location, employment_type, status, sort";
export const REFERRAL_COLUMNS = "id, referrer_id, referrer_person_id, candidate_name, candidate_email, role_id, resume_path, resume_name, note, status, hired_on, bonus_eligible_on, bonus_paid, created_at";

export const REFERRALS_BUCKET = "referrals";
export const MAX_RESUME_BYTES = 5 * 1024 * 1024;
export const RESUME_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

/** Why a resume can't be uploaded (null = fine). Browsers sometimes leave the type empty, so the extension counts too. */
export function resumeProblem(f: { name: string; type: string; size: number }): "resumeType" | "resumeSize" | null {
  const ext = f.name.toLowerCase().split(".").pop() ?? "";
  if (!RESUME_TYPES[f.type] && !["pdf", "doc", "docx"].includes(ext)) return "resumeType";
  if (f.size > MAX_RESUME_BYTES) return "resumeSize";
  return null;
}
export const resumeExt = (f: { name: string; type: string }) => RESUME_TYPES[f.type] ?? (f.name.toLowerCase().split(".").pop() || "pdf");
export const roleLabel = (r: Pick<OpenRole, "title" | "company_label" | "location">) => [r.title, [r.company_label, r.location].filter(Boolean).join(", ")].filter(Boolean).join(" — ");
