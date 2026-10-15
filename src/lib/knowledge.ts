/** The Knowledge page (migration 0017: knowledge_items, knowledge_requests). */
export const KNOWLEDGE_KINDS = ["pill", "session", "video", "study", "insight"] as const;
export type KnowledgeKind = (typeof KNOWLEDGE_KINDS)[number];

export type KnowledgeItem = {
  id: string;
  kind: KnowledgeKind;
  title: string;
  summary: string;
  url: string | null;
  event_at: string | null;
  presenter_id: string | null;
  department_id: string | null;
  created_by: string | null;
  created_at: string;
};
export const KNOWLEDGE_COLUMNS = "id, kind, title, summary, url, event_at, presenter_id, department_id, created_by, created_at";

export const REQUEST_STATUSES = ["open", "planned", "done", "declined"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export type KnowledgeRequest = { id: string; topic: string; details: string; status: RequestStatus; requested_by: string | null; created_at: string };
export const REQUEST_COLUMNS = "id, topic, details, status, requested_by, created_at";

/** Live sessions (PKs) still ahead, soonest first, and the past ones, latest first. */
export function splitSessions(items: KnowledgeItem[], now = new Date()) {
  const sessions = items.filter(i => i.kind === "session" && i.event_at);
  // A session stays "upcoming" for the two hours after it starts.
  const cut = now.getTime() - 2 * 3_600_000;
  const at = (i: KnowledgeItem) => new Date(i.event_at!).getTime();
  return {
    upcoming: sessions.filter(i => at(i) >= cut).sort((a, b) => at(a) - at(b)),
    past: sessions.filter(i => at(i) < cut).sort((a, b) => at(b) - at(a)),
  };
}

export type Expert = { id: string; full_name: string; photo_url: string | null; skills: string[] | null };

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** "Who to ask": every topic from people's "Ask me about", with who listed it, most people first. */
export function askIndex(people: Expert[]) {
  const topics = new Map<string, { topic: string; people: Expert[] }>();
  for (const p of people) {
    for (const raw of p.skills ?? []) {
      const key = fold(raw);
      if (!key) continue;
      const entry = topics.get(key) ?? { topic: raw.trim(), people: [] };
      if (!entry.people.some(x => x.id === p.id)) entry.people.push(p);
      topics.set(key, entry);
    }
  }
  return [...topics.values()].sort((a, b) => b.people.length - a.people.length || a.topic.localeCompare(b.topic));
}

export const matchesTopic = (topic: string, q: string) => fold(topic).includes(fold(q));

/** YouTube thumbnail for video cards; null for other links. */
export function youTubeThumb(url: string | null) {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/i);
  return m ? `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg` : null;
}
