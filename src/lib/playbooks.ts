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
  // Migration 0019 (missing before it runs):
  template?: PlaybookTemplate | null;
  sections?: Partial<Record<SectionKey, string>>;
  roles?: PlaybookRole[];
  definitions?: PlaybookDefinition[];
  resources?: PlaybookResource[];
  video_url?: string | null;
  version?: number;
  /** Confirmations for an older version than this no longer count ("ask everyone again"). */
  ack_version?: number;
};

/** Templates (migration 0019). `null` = a plain playbook, as before. */
export const PLAYBOOK_TEMPLATES = ["sop_detailed", "sop_simple", "policy", "video"] as const;
export type PlaybookTemplate = (typeof PLAYBOOK_TEMPLATES)[number];
/** Extra text sections, in reading order. The purpose is `body`; the procedure is `steps`. */
export const SECTION_KEYS = ["scope", "prerequisites", "escalation", "controls", "completion"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];
/** A row in "Roles and responsibilities": people are directory ids, so names stay current. */
export type PlaybookRole = { role: string; people: string[]; responsibility: string };
export type PlaybookDefinition = { term: string; definition: string };
export type PlaybookResource = { label: string; url: string };

/** The parts a playbook can have beyond title, summary, purpose and steps. */
export type BlockKey = SectionKey | "roles" | "definitions" | "resources" | "video";

/** What each template starts with. */
export const TEMPLATE_SPEC: Record<PlaybookTemplate, { kind: PlaybookKind; blocks: BlockKey[]; steps: number; ack: boolean }> = {
  sop_detailed: { kind: "sop", blocks: ["scope", "prerequisites", "roles", "escalation", "controls", "completion", "definitions", "resources"], steps: 4, ack: false },
  sop_simple: { kind: "sop", blocks: ["resources"], steps: 4, ack: false },
  policy: { kind: "policy", blocks: [], steps: 4, ack: true },
  video: { kind: "guide", blocks: ["video", "resources"], steps: 0, ack: false },
};

export const PLAYBOOK_COLUMNS =
  "id, department_id, company_id, kind, title, summary, category, body, steps, link_url, owner_person_id, review_by, status, ack_required, language, updated_at, visibility, template, sections, roles, definitions, resources, video_url, version, ack_version";
/** Before migration 0019. */
export const PLAYBOOK_COLUMNS_LEGACY =
  "id, department_id, company_id, kind, title, summary, category, body, steps, link_url, owner_person_id, review_by, status, ack_required, language, updated_at, visibility";

/** Blocks with content, plus the template's own (so empty template sections still show in the editor). */
export function activeBlocks(p: Pick<Playbook, "template" | "sections" | "roles" | "definitions" | "resources" | "video_url">): BlockKey[] {
  const on = new Set<BlockKey>(p.template ? TEMPLATE_SPEC[p.template].blocks : []);
  for (const k of SECTION_KEYS) if (p.sections?.[k]?.trim()) on.add(k);
  if (p.roles?.length) on.add("roles");
  if (p.definitions?.length) on.add("definitions");
  if (p.resources?.length) on.add("resources");
  if (p.video_url) on.add("video");
  return ALL_BLOCKS.filter(b => on.has(b));
}
export const ALL_BLOCKS: BlockKey[] = ["video", "scope", "prerequisites", "roles", "escalation", "controls", "completion", "definitions", "resources"];

/** Does this confirmation still count (made for the version everyone must confirm, or later)? */
export const ackIsCurrent = (ackVersion: number | null | undefined, p: Pick<Playbook, "ack_version">) =>
  ackVersion != null && ackVersion >= (p.ack_version ?? 1);

/** A video link as something we can embed (YouTube, Vimeo, Loom, Google Drive); null otherwise. */
export function videoEmbed(url: string | null | undefined): string | null {
  if (!url) return null;
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  const host = u.hostname.replace(/^www\.|^m\./, "");
  if (host === "youtu.be") return `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}`;
  if (host === "youtube.com") {
    const id = u.searchParams.get("v") ?? u.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]+)/)?.[1];
    return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  if (host === "vimeo.com") { const id = u.pathname.match(/^\/(\d+)/)?.[1]; return id ? `https://player.vimeo.com/video/${id}` : null; }
  if (host === "loom.com") { const id = u.pathname.match(/^\/(?:share|embed)\/([\w-]+)/)?.[1]; return id ? `https://www.loom.com/embed/${id}` : null; }
  if (host === "drive.google.com") { const id = u.pathname.match(/\/file\/d\/([\w-]+)/)?.[1]; return id ? `https://drive.google.com/file/d/${id}/preview` : null; }
  return null;
}

/** Review date passed (YYYY-MM-DD compared with today's local date). */
export const reviewOverdue = (reviewBy: string | null, today: string) => !!reviewBy && reviewBy < today;
