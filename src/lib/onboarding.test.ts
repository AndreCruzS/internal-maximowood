import { describe, expect, it } from "vitest";
import { embedUrl, hireProgress, prehireChecklist, trainingPath, type NewHire, type TrainingModule } from "./onboarding";

const m = (p: Partial<TrainingModule>): TrainingModule => ({
  id: p.title ?? "x", scope: "gmx", company_id: null, department_id: null, title: "x", summary: "", content_kind: "text",
  content_url: null, body: "", pass_mark: 80, sort: 0, published: true, is_sample: false, ...p,
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
  it("adds sample modules to every path unless asked not to", () => {
    const mods = [m({ title: "real" }), m({ title: "sample dept", scope: "department", department_id: "finance", is_sample: true, sort: 900 })];
    expect(trainingPath(mods, [], ["marketing"]).map(x => x.title)).toEqual(["real", "sample dept"]);
    expect(trainingPath(mods, [], ["marketing"], false).map(x => x.title)).toEqual(["real"]);
  });
});

const hire = (p: Partial<NewHire>): NewHire => ({
  id: "h", person_id: "p", full_name: "Jo", personal_email: "jo@x.com", title: "Rep", department_id: "commercial", reports_to: "boss",
  company_id: "maximo", start_date: "2026-11-02", needs_email: true, needs_phone: false, phone_area_code: null, access_departments: [],
  notes: "", company_email: null, phone_number: null, accounts: [], it_notes: "", status: "it_setup", it_done_at: null, linked_at: null,
  created_by: null, created_at: "", buddy_id: null, first_day: "", plan: [], checklist: {}, ...p,
});

describe("before you hire", () => {
  it("checks what's filled in and what was ticked by hand; skips the phone when none is needed", () => {
    const list = prehireChecklist(hire({ buddy_id: "b", checklist: { welcome_email: { at: "2026-10-13", by: null } } }));
    const done = Object.fromEntries(list.map(i => [i.key, i.done]));
    expect(done).toEqual({ info: true, buddy: true, first_day: false, plan: false, welcome_email: true, company_email: false, accounts: false, equipment: false, credentials_sent: false });
  });
  it("counts the employee's sign-in, welcome form and passed modules", () => {
    const path = [m({ id: "a" }), m({ id: "b" })];
    const p = hireProgress(hire({ linked_at: "2026-11-02" }), true, path, { a: { module_id: "a", best: 100, passed: true, tries: 1 } });
    expect(p.employee).toEqual([3, 4]);
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
