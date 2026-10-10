import { describe, expect, it } from "vitest";
import { embedUrl, trainingPath, type TrainingModule } from "./onboarding";

const m = (p: Partial<TrainingModule>): TrainingModule => ({
  id: p.title ?? "x", scope: "gmx", company_id: null, department_id: null, title: "x", summary: "", content_kind: "text",
  content_url: null, body: "", pass_mark: 80, sort: 0, published: true, ...p,
});

describe("trainingPath", () => {
  it("orders GMX, then the person's brands, then their departments; skips drafts and others", () => {
    const path = trainingPath(
      [
        m({ title: "dept", scope: "department", department_id: "marketing" }),
        m({ title: "other dept", scope: "department", department_id: "finance" }),
        m({ title: "brand", scope: "brand", company_id: "maximo" }),
        m({ title: "other brand", scope: "brand", company_id: "us4pro" }),
        m({ title: "gmx 2", sort: 2 }),
        m({ title: "gmx 1", sort: 1 }),
        m({ title: "draft", published: false }),
      ],
      ["maximo"],
      ["marketing"],
    );
    expect(path.map(x => x.title)).toEqual(["gmx 1", "gmx 2", "brand", "dept"]);
  });
});

describe("embedUrl", () => {
  it("turns share links into embeddable ones", () => {
    expect(embedUrl("slides", "https://docs.google.com/presentation/d/ABC123/edit#slide=id.p")).toBe("https://docs.google.com/presentation/d/ABC123/embed?start=false&loop=false");
    expect(embedUrl("video", "https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
    expect(embedUrl("video", "https://vimeo.com/12345")).toBe("https://player.vimeo.com/video/12345");
    expect(embedUrl("pdf", "https://drive.google.com/file/d/FILE1/view?usp=sharing")).toBe("https://drive.google.com/file/d/FILE1/preview");
    expect(embedUrl("pdf", "/brand-kit/gmx/gmx-group-brand-guide.pdf")).toBe("/brand-kit/gmx/gmx-group-brand-guide.pdf");
    expect(embedUrl("link", "https://example.com")).toBeNull();
  });
});
