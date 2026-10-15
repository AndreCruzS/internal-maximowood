import { describe, expect, it } from "vitest";
import { askIndex, matchesTopic, splitSessions, youTubeThumb, type KnowledgeItem } from "./knowledge";

const item = (id: string, event_at: string | null, kind: KnowledgeItem["kind"] = "session"): KnowledgeItem =>
  ({ id, kind, title: id, summary: "", url: null, event_at, presenter_id: null, department_id: null, created_by: null, created_at: "" });

describe("knowledge", () => {
  it("splits sessions into upcoming (soonest first) and past (latest first)", () => {
    const now = new Date("2026-10-14T12:00:00Z");
    const { upcoming, past } = splitSessions([
      item("later", "2026-10-30T15:00:00Z"), item("soon", "2026-10-15T15:00:00Z"),
      item("now", "2026-10-14T11:00:00Z"), item("old", "2026-09-01T15:00:00Z"), item("older", "2026-08-01T15:00:00Z"),
      item("pill", null, "pill"),
    ], now);
    expect(upcoming.map(i => i.id)).toEqual(["now", "soon", "later"]);
    expect(past.map(i => i.id)).toEqual(["old", "older"]);
  });
  it("groups 'Ask me about' topics across people, ignoring case and accents", () => {
    const idx = askIndex([
      { id: "a", full_name: "A", photo_url: null, skills: ["Excel", "Decking"] },
      { id: "b", full_name: "B", photo_url: null, skills: ["excel ", "Logística"] },
      { id: "c", full_name: "C", photo_url: null, skills: null },
    ]);
    expect(idx[0]).toMatchObject({ topic: "Excel" });
    expect(idx[0].people.map(p => p.id)).toEqual(["a", "b"]);
    expect(idx).toHaveLength(3);
    expect(matchesTopic("Logística", "logis")).toBe(true);
  });
  it("finds YouTube thumbnails", () => {
    expect(youTubeThumb("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1")).toBe("https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
    expect(youTubeThumb("https://youtu.be/dQw4w9WgXcQ")).toContain("dQw4w9WgXcQ");
    expect(youTubeThumb("https://drive.google.com/file/d/x")).toBeNull();
  });
});
