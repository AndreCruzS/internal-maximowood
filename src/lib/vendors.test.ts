import { describe, expect, it } from "vitest";
import {
  SanctionsIndex, autoMap, importKey, last4, masked, nameScore, nextReviewOn, normalizeName, parseAlt, parseCsv, parseSdn,
  paymentMethodOf, resultOf, reviewOverdue, rowsToImport, sanitizeImportRow, screenNames,
} from "./vendors";

describe("name normalization", () => {
  it("drops legal forms, accents and punctuation", () => {
    expect(normalizeName("Ocean Class Shipping Group, L.L.C.")).toBe("ocean class shipping group");
    expect(normalizeName("Madeireira São João Ltda.")).toBe("madeireira sao joao");
    expect(normalizeName("Vox Group S.A.")).toBe("vox group");
    expect(normalizeName("ACME & Sons GmbH")).toBe("acme sons");
  });
});

describe("nameScore / resultOf", () => {
  it("matches the same company across legal forms, case, accents and word order", () => {
    expect(resultOf(nameScore("Ocean Class Shipping Group LLC", "OCEAN CLASS SHIPPING GROUP"))).toBe("match");
    expect(resultOf(nameScore("Banco Nacional de Cuba S.A.", "BANCO NACIONAL DE CUBA"))).toBe("match");
    expect(resultOf(nameScore("Joao Silva", "SILVA, João"))).toBe("match");
    expect(resultOf(nameScore("Aerocaribbean Airlines Inc", "AEROCARIBBEAN AIRLINES"))).toBe("match");
  });
  it("tolerates a typo in a long word", () => {
    expect(resultOf(nameScore("Aerocaribean Airlines", "AEROCARIBBEAN AIRLINES"))).toBe("match");
  });
  it("flags a partial overlap of distinctive words as a possible match", () => {
    expect(resultOf(nameScore("Ocean Class Shipping", "OCEAN CLASS MARINE TRADING CO"))).toBe("possible_match");
  });
  it("doesn't flag names that only share common business words", () => {
    expect(resultOf(nameScore("Global Trading Group LLC", "GLOBAL TRADING COMPANY LIMITED"))).toBe("clear");
    expect(resultOf(nameScore("Lumber Plus International", "INTERNATIONAL GOLDEN GROUP"))).toBe("clear");
    expect(resultOf(nameScore("Home Depot", "DEPOT TRADING FZE"))).not.toBe("match");
    expect(resultOf(nameScore("Al Noor General Trading", "AL-TIKRITI, Noor Barzan Ibrahim Hasan"))).toBe("clear");
  });
  it("keeps unrelated names clear", () => {
    expect(resultOf(nameScore("Maximo Wood LLC", "BANCO NACIONAL DE CUBA"))).toBe("clear");
  });
});

describe("SanctionsIndex / screenNames", () => {
  const sdn = '36,"AEROCARIBBEAN AIRLINES",-0- ,"CUBA",-0- \n306,"BANCO NACIONAL DE CUBA",-0- ,"CUBA",-0- ,"a.k.a. \'BNC\'."\n777,"OCEAN CLASS SHIPPING GROUP",-0- ,"SDGT",-0- \n888,"SILVA, Joao","individual","SDNTK",-0- \n';
  const alt = '36,12,"aka","AERO-CARIBBEAN",-0- \n306,220,"aka","NATIONAL BANK OF CUBA",-0- \n';
  const primary = parseSdn(sdn, "v1");
  const entries = [...primary, ...parseAlt(alt, "v1", new Map(primary.map(e => [e.ent_num, e])))];
  const index = new SanctionsIndex(entries, "v1");

  it("parses SDN and ALT files", () => {
    expect(primary).toHaveLength(4);
    expect(primary[3]).toMatchObject({ id: "sdn:888", sdn_type: "individual", programs: "SDNTK" });
    expect(entries.find(e => e.id === "alt:220")).toMatchObject({ ent_num: 306, name_type: "aka", programs: "CUBA" });
  });
  it("finds a vendor by legal name or DBA, including aliases", () => {
    const r = screenNames(["Ocean Class Shipping Group LLC", "Vox Group"], index);
    expect(r.result).toBe("match");
    expect(r.hits[0]).toMatchObject({ ent_num: 777, screened_name: "Ocean Class Shipping Group LLC" });
    expect(screenNames(["National Bank of Cuba"], index).hits[0].ent_num).toBe(306);
  });
  it("finds spelling variants through the consonant key", () => {
    const idx = new SanctionsIndex(parseSdn('4697,"HIZBALLAH",-0- ,"FTO",-0- \n', "v"), "v");
    expect(screenNames(["Hezbollah"], idx).result).toBe("match");
  });
  it("is clear for an ordinary vendor", () => {
    expect(screenNames(["Coastal Decks LLC"], index)).toEqual({ result: "clear", score: 0, hits: [] });
  });
});

describe("CSV", () => {
  it("parses quotes, escaped quotes, line breaks and semicolons", () => {
    expect(parseCsv('a,b\n"x, y","he said ""hi"""\n"multi\nline",z\r\n')).toEqual([["a", "b"], ["x, y", 'he said "hi"'], ["multi\nline", "z"]]);
    expect(parseCsv("Nome;CNPJ\nMadeireira;12.345.678/0001-90")).toEqual([["Nome", "CNPJ"], ["Madeireira", "12.345.678/0001-90"]]);
  });
  it("maps common bank / ERP headers in English and Portuguese", () => {
    const m = autoMap(["Beneficiary Name", "EIN", "Bank", "Account Number", "ABA Routing", "SWIFT", "País", "Forma de pagamento"]);
    expect(m).toMatchObject({ legal_name: 0, tax_id: 1, bank_name: 2, account_number: 3, routing_number: 4, swift_bic: 5, country: 6, payment_method: 7 });
  });
});

describe("import rows never keep full bank numbers", () => {
  const rows = parseCsv("Vendor,Account Number,Routing,Swift,Method,Currency\nCoastal Decks LLC,000123456789,021000021,chasus33,ACH,usd\n,1,2,bad,,\n");
  const out = rowsToImport(rows, autoMap(rows[0]));
  it("reduces account and routing numbers to the last 4", () => {
    expect(out[0].bank).toMatchObject({ account_last4: "6789", routing_last4: "0021", swift_bic: "CHASUS33", payment_method: "ach" });
    expect(JSON.stringify(out)).not.toContain("000123456789");
    expect(JSON.stringify(out)).not.toContain("021000021");
    expect(out[0].currency).toBe("USD");
  });
  it("reports bad rows", () => {
    expect(out[1].errors).toEqual(expect.arrayContaining(["missing_name", "bad_swift"]));
    expect(out[1].line).toBe(3);
  });
  it("sanitizes what a browser sends", () => {
    const r = sanitizeImportRow({ legal_name: "X", bank: { account_last4: "9876543210", routing_last4: "021000021", swift_bic: "nope", payment_method: "bitcoin" } });
    expect(r?.bank).toMatchObject({ account_last4: "3210", routing_last4: "0021", swift_bic: "", payment_method: "" });
    expect(sanitizeImportRow({ legal_name: "  " })).toBeNull();
  });
  it("keys duplicates by tax id, else name + country", () => {
    expect(importKey({ tax_id: "12-3456789", legal_name: "A", country: "US" })).toBe("tax:123456789");
    expect(importKey({ tax_id: "", legal_name: "Coastal Decks, LLC", country: "US" })).toBe(importKey({ tax_id: "", legal_name: "COASTAL DECKS", country: "us" }));
  });
});

describe("small helpers", () => {
  it("masks and keeps last 4", () => {
    expect(last4("0001-2345-6789")).toBe("6789");
    expect(masked("6789")).toBe("•••• 6789");
    expect(masked("")).toBe("");
  });
  it("review in 12 months, end of month safe", () => {
    expect(nextReviewOn("2026-10-22T15:00:00Z")).toBe("2027-10-22");
    expect(nextReviewOn("2024-02-29T00:00:00Z")).toBe("2025-02-28");
    expect(reviewOverdue({ status: "approved", next_review_on: "2026-10-01" }, "2026-10-22")).toBe(true);
    expect(reviewOverdue({ status: "legacy_pending", next_review_on: "2026-10-01" }, "2026-10-22")).toBe(false);
  });
  it("reads payment methods", () => {
    expect(paymentMethodOf("Wire Transfer")).toBe("wire");
    expect(paymentMethodOf("PIX")).toBe("pix");
    expect(paymentMethodOf("Cheque")).toBe("check");
    expect(paymentMethodOf("")).toBe("");
  });
});
