import { describe, expect, it } from "vitest";
import { isFresh, priorityOf, sortFeed, timeAgo } from "./news";
import type { NewsItem } from "@/server/intranet";

const post = (id: string, published_at: string, extra: Partial<NewsItem> = {}): NewsItem => ({
  id, title: id, body: "", image_url: null, link_url: null, company_id: null, department_id: null,
  featured: false, must_read: false, language: null, published_at, author_id: null, ...extra,
});

describe("news feed", () => {
  it("falls back to must_read before the priority column exists", () => {
    expect(priorityOf({ must_read: true })).toBe("critical");
    expect(priorityOf({ must_read: false })).toBe("update");
    expect(priorityOf({ must_read: false, priority: "important" })).toBe("important");
  });

  it("pins unconfirmed must-reads, then newest first", () => {
    const list = [
      post("old", "2026-10-01T10:00:00Z"),
      post("crit-read", "2026-10-02T10:00:00Z", { priority: "critical" }),
      post("new", "2026-10-15T10:00:00Z"),
      post("crit", "2026-10-03T10:00:00Z", { priority: "critical" }),
    ];
    expect(sortFeed(list, new Set(["crit-read"])).map(n => n.id)).toEqual(["crit", "new", "crit-read", "old"]);
  });

  it("says how long ago", () => {
    const now = new Date("2026-10-16T12:00:00Z").getTime();
    expect(timeAgo("2026-10-16T11:55:00Z", "en", now)).toBe("5 minutes ago");
    expect(timeAgo("2026-10-16T09:00:00Z", "en", now)).toBe("3 hours ago");
    expect(timeAgo("2026-10-15T12:00:00Z", "en", now)).toBe("yesterday");
    expect(timeAgo("2026-09-01T12:00:00Z", "en", now)).toBe("Sep 1");
    expect(isFresh("2026-10-15T12:00:00Z", now)).toBe(true);
    expect(isFresh("2026-10-10T12:00:00Z", now)).toBe(false);
  });
});
