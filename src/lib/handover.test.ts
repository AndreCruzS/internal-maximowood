import { describe, expect, it } from "vitest";
import { handoverFilled, handoverLines } from "./handover";

describe("handover", () => {
  it("splits answers into items and drops bullets and blank lines", () => {
    expect(handoverLines("- Site redesign\n\n• ACME rollout  \n* Price list")).toEqual(["Site redesign", "ACME rollout", "Price list"]);
    expect(handoverLines(undefined)).toEqual([]);
  });
  it("counts as filled once any answer has text", () => {
    expect(handoverFilled(null)).toBe(false);
    expect(handoverFilled({ projects: "  " })).toBe(false);
    expect(handoverFilled({ accounts: "ACME" })).toBe(true);
  });
});
