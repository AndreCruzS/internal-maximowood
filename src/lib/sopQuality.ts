import { SECTION_KEYS, TEMPLATE_SPEC, reviewOverdue, type Playbook } from "@/lib/playbooks";

/** What the score checks, in the order owners should fix them. */
export type QualityCheck = "owner" | "review" | "summary" | "purpose" | "steps" | "video" | "roles" | "sections" | "resources";

type Input = Pick<Playbook, "owner_person_id" | "review_by" | "summary" | "body" | "steps" | "link_url"> &
  Partial<Pick<Playbook, "template" | "sections" | "roles" | "resources" | "video_url">>;

/**
 * How complete a playbook is, 0–100, plus what's missing (shown to its team only).
 * Only checks that make sense for the template count, so a short policy can still reach 100.
 */
export function playbookQuality(p: Input, today: string): { score: number; missing: QualityCheck[] } {
  const spec = p.template ? TEMPLATE_SPEC[p.template] : null;
  const checks: [QualityCheck, number, number][] = []; // [check, weight, earned 0..1]
  const add = (k: QualityCheck, weight: number, earned: number) => checks.push([k, weight, Math.max(0, Math.min(1, earned))]);

  add("owner", 15, p.owner_person_id ? 1 : 0);
  add("review", 15, p.review_by && !reviewOverdue(p.review_by, today) ? 1 : 0);
  add("summary", 10, p.summary.trim() ? 1 : 0);
  add("purpose", 15, p.body.trim() ? 1 : 0);
  if (p.template === "video") add("video", 20, p.video_url ? 1 : 0);
  else add("steps", 20, p.steps.some(s => s.title.trim() || s.body.trim()) ? 1 : 0);
  if (spec?.blocks.includes("roles")) add("roles", 10, (p.roles ?? []).some(r => r.role.trim() && r.people.length) ? 1 : 0);
  const wanted = SECTION_KEYS.filter(k => spec?.blocks.includes(k));
  if (wanted.length) add("sections", 10, wanted.filter(k => p.sections?.[k]?.trim()).length / wanted.length);
  if (spec?.blocks.includes("resources")) add("resources", 5, (p.resources ?? []).length || p.link_url ? 1 : 0);

  const total = checks.reduce((n, [, w]) => n + w, 0);
  const earned = checks.reduce((n, [, w, e]) => n + w * e, 0);
  return { score: Math.round((earned / total) * 100), missing: checks.filter(([, , e]) => e < 1).map(([k]) => k) };
}

/** Colour band for the score chip. */
export const qualityTone = (score: number) => (score >= 80 ? "good" : score >= 50 ? "ok" : "low");
