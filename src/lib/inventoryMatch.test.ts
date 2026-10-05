import { describe, expect, it } from "vitest";
import { findInventoryMatch, type InventoryItem } from "@/lib/inventoryMatch";

const inv = (specie: string, model: string, size: string, totalLF = 1000, profile = "-"): InventoryItem => ({
  specie,
  category: "Thermo",
  model,
  profile,
  size,
  branches: [{ branch: "Global Miami", totalLF, lengths: [] }],
  totalLF,
  isUnmapped: false,
});

describe("findInventoryMatch", () => {
  // Shaped like the live view: profile lives in `model`, `profile` is "-".
  const items = [
    inv("Maximo Thermo Ash", "VJoint - Nickel Gap", "1x6"),
    inv("Maximo Thermo Ayous", "VJoint - Nickel Gap", "1x4"),
    inv("Maximo Thermo Ayous", "VJoint - Nickel Gap", "1x6", 32868),
    inv("Maximo Thermo Ayous", "S4S E4E", "1x6"),
  ];

  it("matches calculator Ayous V JOINT / NICKEL GAP 1 x 6 to the inventory row", () => {
    const m = findInventoryMatch(items, "AYOUS", "V JOINT / NICKEL GAP", "1 x 6");
    expect(m?.specie).toBe("Maximo Thermo Ayous");
    expect(m?.size).toBe("1x6");
    expect(m?.totalLF).toBe(32868);
  });

  it("also matches when the profile is in the profile field instead of model", () => {
    const m = findInventoryMatch([inv("Maximo Thermo Ayous", "-", "1x6", 500, "VJoint - Nickel Gap")], "AYOUS", "V JOINT / NICKEL GAP", "1 x 6");
    expect(m?.totalLF).toBe(500);
  });

  it("returns null when the size isn't stocked", () => {
    expect(findInventoryMatch(items, "AYOUS", "V JOINT / NICKEL GAP", "1 x 8")).toBeNull();
  });
});
