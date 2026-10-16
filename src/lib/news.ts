import type { NewsItem } from "@/server/intranet";

export const PRIORITIES = ["update", "important", "critical"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const priorityOf = (n: Pick<NewsItem, "priority" | "must_read">): Priority => n.priority ?? (n.must_read ? "critical" : "update");

export const PRIORITY_STYLE: Record<Priority, { badge: string; ring: string; dot: string }> = {
  update: { badge: "bg-gray-100 text-gray-600", ring: "border-gray-200", dot: "bg-gray-400" },
  important: { badge: "bg-amber-100 text-amber-800", ring: "border-amber-300", dot: "bg-amber-500" },
  critical: { badge: "bg-red-100 text-red-700", ring: "border-red-300", dot: "bg-red-500" },
};

export const NEWS_BUCKET = "news";
export const NEWS_IMAGE_PREFIX = "/news-images/";
export const MAX_NEWS_IMAGE_BYTES = 5 * 1024 * 1024;

/** "Company-wide" posts have no department; this is their filter id. */
export const COMPANY_WIDE = "company";

/** Feed order: must-read posts you haven't confirmed first, then newest first. */
export function sortFeed(list: NewsItem[], confirmed: Set<string>): NewsItem[] {
  const pinned = (n: NewsItem) => (priorityOf(n) === "critical" && !confirmed.has(n.id) ? 0 : 1);
  return [...list].sort((a, b) => pinned(a) - pinned(b) || b.published_at.localeCompare(a.published_at));
}

/** "5 min ago", "yesterday", "3 days ago"; past a week, the date. */
export function timeAgo(iso: string, tag: string, now = Date.now()): string {
  const secs = Math.round((new Date(iso).getTime() - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(tag, { numeric: "auto" });
  const abs = Math.abs(secs);
  if (abs < 60) return rtf.format(0, "second");
  if (abs < 3600) return rtf.format(Math.round(secs / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(secs / 3600), "hour");
  if (abs < 7 * 86_400) return rtf.format(Math.round(secs / 86_400), "day");
  const d = new Date(iso);
  return d.toLocaleDateString(tag, { month: "short", day: "numeric", ...(d.getFullYear() !== new Date(now).getFullYear() ? { year: "numeric" } : {}) });
}

/** Posted in the last two days. */
export const isFresh = (iso: string, now = Date.now()) => now - new Date(iso).getTime() < 2 * 86_400_000;
