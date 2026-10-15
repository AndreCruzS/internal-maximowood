import { describe, expect, it } from "vitest";
import { coverOf, normalizeLinkedIn } from "./profile";

describe("profile", () => {
  it("normalizes LinkedIn links and refuses others", () => {
    expect(normalizeLinkedIn("linkedin.com/in/anna")).toBe("https://linkedin.com/in/anna");
    expect(normalizeLinkedIn("http://www.linkedin.com/in/anna")).toBe("https://www.linkedin.com/in/anna");
    expect(normalizeLinkedIn("https://evil.com/linkedin.com/")).toBeNull();
    expect(normalizeLinkedIn("  ")).toBeNull();
  });
  it("paints the brands cover in the person's brand colors", () => {
    expect(coverOf("forest", ["maximo"])).toBe(coverOf("forest"));
    expect(coverOf("brands", [])).toBe(coverOf("forest"));
    expect(coverOf("brands", ["maximo"])).toBe("linear-gradient(135deg, #8a6a00 0%, #f6ca21 100%)");
    // Several brands blend in the usual brand order, whatever order they were given in.
    expect(coverOf("brands", ["us4pro", "gmx", "maximo"])).toBe("linear-gradient(110deg, #009f67 0%, #f6ca21 50%, #2573f2 100%)");
    expect(coverOf(null, ["gmx", "gmx"])).toBe("linear-gradient(135deg, #00704a 0%, #009f67 100%)");
  });
});
