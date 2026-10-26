import { describe, expect, it } from "vitest";
import type { SavedQuote } from "@/lib/quotes";
import { checklistFromQuote, emptyChecklist, fieldText, missingFields, parseChecklistData, priceLines, SECTIONS } from "./checklist";

const item = (over: Partial<SavedQuote["items"][number]> = {}): SavedQuote["items"][number] => ({
  species: "Thermo Ayous", profile: "V-Joint / Nickel Gap", nominalSize: "1x6", sqft: 500, lf: 1090.5, pricePerLF: 4,
  total: 4362, lengthType: "RL", speciesKey: "ayous", profileKey: "vj", sizeKey: "1x6", neededLF: 1090.5,
  addOns: [
    { label: "Milling ($1.10/LF)", amount: 1199.55 },
    { label: "Pre-Finish Color: Mocha · Regular ($2.20/LF)", amount: 2399.1 },
    { label: "Pre-Finish Texture: Wire brushed ($0.50/LF)", amount: 545.25 },
    { label: "🏷️ Promo: x", amount: 0 },
  ],
  ...over,
});

const quote = (over: Partial<SavedQuote> = {}): SavedQuote => ({
  id: "q1", ownerId: "u1", projectName: "Main St deck", calculator: "retail", company: "Acme Builders", contact: "Jane Roe",
  address: "1 Main St, Miami FL", preparedBy: "Ana", notes: "", tax: 100, shipping: 50, leadTimeWeeks: 6,
  items: [item(), item({ profile: "Flat", lengthType: "Fixed", addOns: [] })], total: 10000, createdAt: "", updatedAt: "", hubspot: null,
  ...over,
});

describe("checklistFromQuote", () => {
  it("fills one profile block per quote line, and the header", () => {
    const d = checklistFromQuote(quote(), "Ana Silva", "2026-10-26");
    expect(d.header).toEqual({ client: "Acme Builders", date: "2026-10-26", totalAmount: "10,150.00" });
    expect(d.profiles).toHaveLength(2);
    const [p1, p2] = d.profiles;
    expect(p1.fields).toMatchObject({
      species: "Thermo Ayous", profile: "V-Joint / Nickel Gap", size: "1x6 nominal", sqft: "500.00", lf: "1,090.50",
      colorCode: "Mocha", coating: "", texture: "Wire brushed", lengthType: "Random", priceEnd: "7.80", distMaterial: "",
    });
    expect(p2.fields).toMatchObject({ lengthType: "Specified", coating: "Unfinished", colorCode: "", priceEnd: "4.00" });
    expect(d.sections.delivery).toMatchObject({ deliveryAddress: "1 Main St, Miami FL", paintingLeadTime: "Up to 6 weeks" });
    expect(d.sections.handoff.salesOwner).toBe("Ana Silva");
    expect(d.sections.order.endCustomer).toBe("Acme Builders — Main St deck");
  });
  it("B2B quotes fill the distributor price, itemized", () => {
    const d = checklistFromQuote(quote({ calculator: "b2b" }), "Ana", "2026-10-26");
    expect(d.profiles[0].fields).toMatchObject({ priceEnd: "", distMaterial: "4.00", distMilling: "1.10", distFinishing: "2.70" });
    expect(d.sections.order.dealer).toBe("Acme Builders — Jane Roe");
    expect(priceLines(d).dist[0]).toBe("V-Joint / Nickel Gap: material $4.00 + milling $1.10 + finishing $2.70 /LF");
  });
});

describe("fieldText / missingFields", () => {
  it("reads yes/no with its note", () => {
    const f = SECTIONS[0].fields.find(x => x.key === "poMatches")!;
    expect(fieldText(f, { poMatches: "no", poMatchesNote: "Fluted not billed" })).toBe("No — Fluted not billed");
    expect(fieldText(f, {})).toBe("");
  });
  it("lists required fields that are still empty", () => {
    const missing = missingFields(emptyChecklist());
    expect(missing).toContain("Client");
    expect(missing).toContain("Profile 1 · Linear footage");
    expect(missing).toContain("05 · Logistics owner");
    const d = checklistFromQuote(quote(), "Ana", "2026-10-26");
    expect(missingFields(d)).not.toContain("Client");
  });
});

describe("parseChecklistData", () => {
  it("keeps known shape only and rejects non-image photos", () => {
    const r = parseChecklistData({ header: { client: "A", "bad key!": "x", n: 5 }, profiles: [{ id: "abc", fields: { lf: "10" }, lengths: [{ feet: "12", qty: "40" }], photo: null }], sections: { order: { po: "123" } } });
    expect(r.ok && r.data.header).toEqual({ client: "A" });
    expect(r.ok && r.data.profiles[0].lengths).toEqual([{ feet: "12", qty: "40" }]);
    expect(r.ok && r.data.sections.delivery).toEqual({});
    expect(parseChecklistData({ profiles: [{ photo: "javascript:alert(1)" }] }).ok).toBe(false);
    expect(parseChecklistData({ profiles: [{ photo: "data:image/png;base64,AAAA" }] }).ok).toBe(true);
  });
});
