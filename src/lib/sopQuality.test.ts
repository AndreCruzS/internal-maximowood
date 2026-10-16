import { describe, expect, it } from "vitest";
import { playbookQuality } from "@/lib/sopQuality";
import { activeBlocks, ackIsCurrent, videoEmbed } from "@/lib/playbooks";

const base = { owner_person_id: null, review_by: null, summary: "", body: "", steps: [], link_url: null };

describe("playbookQuality", () => {
  it("is 0 for an empty plain playbook and lists what's missing", () => {
    const q = playbookQuality(base, "2026-10-16");
    expect(q.score).toBe(0);
    expect(q.missing).toEqual(["owner", "review", "summary", "purpose", "steps"]);
  });
  it("reaches 100 for a complete simple SOP", () => {
    const q = playbookQuality({ ...base, template: "sop_simple", owner_person_id: "p", review_by: "2027-01-01", summary: "s", body: "b", steps: [{ title: "Do", body: "" }], resources: [{ label: "x", url: "https://x" }] }, "2026-10-16");
    expect(q).toEqual({ score: 100, missing: [] });
  });
  it("counts an overdue review as missing and gives partial credit for sections", () => {
    const q = playbookQuality({ ...base, template: "sop_detailed", owner_person_id: "p", review_by: "2026-01-01", summary: "s", body: "b", steps: [{ title: "Do", body: "" }], sections: { scope: "all", controls: "x" }, roles: [{ role: "PM", people: ["p"], responsibility: "" }], link_url: "https://doc" }, "2026-10-16");
    expect(q.missing).toEqual(["review", "sections"]);
    expect(q.score).toBe(Math.round(((100 - 15 - 6) / 100) * 100));
  });
  it("checks the video instead of steps for a video tutorial", () => {
    const q = playbookQuality({ ...base, template: "video" }, "2026-10-16");
    expect(q.missing).toContain("video");
    expect(q.missing).not.toContain("steps");
  });
});

describe("playbook helpers", () => {
  it("shows template blocks plus any block with content", () => {
    expect(activeBlocks({ template: "sop_simple", sections: { escalation: "Call Ops" } })).toEqual(["escalation", "resources"]);
    expect(activeBlocks({ template: null, video_url: "https://youtu.be/abc" })).toEqual(["video"]);
  });
  it("only counts confirmations for the current required version", () => {
    expect(ackIsCurrent(1, { ack_version: 1 })).toBe(true);
    expect(ackIsCurrent(1, { ack_version: 3 })).toBe(false);
    expect(ackIsCurrent(null, {})).toBe(false);
    expect(ackIsCurrent(1, {})).toBe(true);
  });
  it("embeds known video hosts", () => {
    expect(videoEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(videoEmbed("https://youtu.be/dQw4w9WgXcQ")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(videoEmbed("https://www.loom.com/share/abc123")).toBe("https://www.loom.com/embed/abc123");
    expect(videoEmbed("https://drive.google.com/file/d/XYZ/view")).toBe("https://drive.google.com/file/d/XYZ/preview");
    expect(videoEmbed("https://example.com/video.mp4")).toBeNull();
  });
});
