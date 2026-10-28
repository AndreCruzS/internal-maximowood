import { describe, expect, it } from "vitest";
import { thermo2027InEffect } from "./thermoPriceList";

describe("thermo2027InEffect", () => {
  it("switches at midnight US Eastern on Dec 21, 2026", () => {
    expect(thermo2027InEffect(new Date("2026-12-20T23:59:00-05:00"))).toBe(false);
    expect(thermo2027InEffect(new Date("2026-12-21T00:00:00-05:00"))).toBe(true);
    expect(thermo2027InEffect(new Date("2026-10-28T12:00:00Z"))).toBe(false);
  });
});
