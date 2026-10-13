import { describe, expect, it } from "vitest";
import { coverOf, normalizeLinkedIn } from "./profile";

describe("profile", () => {
  it("normalizes LinkedIn links and refuses others", () => {
    expect(normalizeLinkedIn("linkedin.com/in/anna")).toBe("https://linkedin.com/in/anna");
    expect(normalizeLinkedIn("http://www.linkedin.com/in/anna")).toBe("https://www.linkedin.com/in/anna");
    expect(normalizeLinkedIn("https://evil.com/linkedin.com/")).toBeNull();
    expect(normalizeLinkedIn("  ")).toBeNull();
  });
  it("falls back to the forest cover", () => {
    expect(coverOf("nope")).toBe(coverOf("forest"));
  });
});
