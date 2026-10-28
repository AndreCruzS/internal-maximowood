import { describe, expect, it } from "vitest";
import { accessDecision, emailsOf, parseAccessImport, parseEmploymentType, planAccessImport, wouldBeRefused } from "./access";

describe("accessDecision", () => {
  const w2 = { active: true, employment_type: "w2" };
  it("lets everyone in while the check is off", () => {
    expect(accessDecision({ enforce: false, isAdmin: false, person: null })).toEqual({ ok: true });
  });
  it("lets admins in without an entry", () => {
    expect(accessDecision({ enforce: true, isAdmin: true, person: null })).toEqual({ ok: true });
  });
  it("lets W2 and the Brazil team in, keeps contractors and the unset out", () => {
    expect(accessDecision({ enforce: true, isAdmin: false, person: w2 }).ok).toBe(true);
    expect(accessDecision({ enforce: true, isAdmin: false, person: { active: true, employment_type: "clt" } }).ok).toBe(true);
    expect(accessDecision({ enforce: true, isAdmin: false, person: { active: true, employment_type: "pj" } }).ok).toBe(true);
    expect(accessDecision({ enforce: true, isAdmin: false, person: { active: true, employment_type: "contractor" } })).toEqual({ ok: false, reason: "not_enabled" });
    expect(accessDecision({ enforce: true, isAdmin: false, person: { active: true, employment_type: null } })).toEqual({ ok: false, reason: "not_enabled" });
  });
  it("lets the whole Brazil team in, whatever their contract", () => {
    expect(accessDecision({ enforce: true, isAdmin: false, person: { active: true, employment_type: null, work_country: "BR" } }).ok).toBe(true);
    expect(accessDecision({ enforce: true, isAdmin: false, person: { active: true, employment_type: "contractor", work_country: "BR" } }).ok).toBe(true);
    expect(accessDecision({ enforce: true, isAdmin: false, person: { active: false, employment_type: null, work_country: "BR" } })).toEqual({ ok: false, reason: "inactive" });
    expect(accessDecision({ enforce: true, isAdmin: false, person: { active: true, employment_type: "contractor", work_country: "US" } })).toEqual({ ok: false, reason: "not_enabled" });
  });
  it("refuses people not in the directory and leavers", () => {
    expect(accessDecision({ enforce: true, isAdmin: false, person: null })).toEqual({ ok: false, reason: "no_person" });
    expect(accessDecision({ enforce: true, isAdmin: false, person: { ...w2, active: false } })).toEqual({ ok: false, reason: "inactive" });
  });
});

describe("parseEmploymentType", () => {
  it("reads the usual spellings", () => {
    expect(parseEmploymentType("W-2")).toBe("w2");
    expect(parseEmploymentType("Employee")).toBe("w2");
    expect(parseEmploymentType("Independent Contractor")).toBe("contractor");
    expect(parseEmploymentType("1099")).toBe("contractor");
    expect(parseEmploymentType("CLT")).toBe("clt");
    expect(parseEmploymentType("pj")).toBe("pj");
    expect(parseEmploymentType("intern?")).toBeNull();
  });
});

describe("parseAccessImport", () => {
  it("reads a spreadsheet paste, skips the header and duplicates, reports bad lines", () => {
    const text = "Email\tType\tName\nAne@LumberPlus.com\tW2\tAne Rambo\tLumber Plus Enterprises\nane@lumberplus.com, w2\nnot-an-email, w2\nbob@gmxgroup.com; intern\n\njoe@us4pro.com,contractor";
    const r = parseAccessImport(text);
    expect(r.rows).toEqual([
      { line: 2, email: "ane@lumberplus.com", type: "w2", name: "Ane Rambo", entity: "Lumber Plus Enterprises" },
      { line: 7, email: "joe@us4pro.com", type: "contractor", name: "", entity: "" },
    ]);
    expect(r.errors.map(e => [e.line, e.problem])).toEqual([[4, "email"], [5, "type"]]);
  });
});

describe("emailsOf", () => {
  it("lists main and other addresses, lower-cased", () => {
    expect(emailsOf({ email: "Ane@LumberPlus.com", alt_emails: ["ane.rambo@gmxgroup.com"] })).toEqual(["ane@lumberplus.com", "ane.rambo@gmxgroup.com"]);
    expect(emailsOf({ email: null })).toEqual([]);
  });
});

describe("planAccessImport", () => {
  const people = [
    { id: "1", full_name: "Ane Rambo", email: "ane@lumberplus.com", alt_emails: ["ane.rambo@gmxgroup.com"], employment_type: null, legal_entity: "" },
    { id: "2", full_name: "Joe", email: "joe@us4pro.com", alt_emails: [], employment_type: "contractor" as const, legal_entity: "" },
  ];
  it("matches other emails, skips what's already right, adds named newcomers", () => {
    const { rows } = parseAccessImport("ane.rambo@gmxgroup.com,w2,,Lumber Plus Enterprises\njoe@us4pro.com,contractor\nnew@lumberplus.com,w2,New Person\nnoname@lumberplus.com,w2");
    expect(planAccessImport(rows, people)).toEqual({
      updates: [{ personId: "1", name: "Ane Rambo", email: "ane.rambo@gmxgroup.com", from: null, to: "w2", entity: "Lumber Plus Enterprises" }],
      creates: [{ email: "new@lumberplus.com", name: "New Person", type: "w2", entity: "" }],
      missingName: ["noname@lumberplus.com"],
      unchanged: 1,
    });
  });
});

describe("wouldBeRefused", () => {
  it("lists accounts without a W2 / Brazil-team entry, never admins", () => {
    const people = [
      { email: "a@gmxgroup.com", alt_emails: [], employment_type: "w2" as const, active: true, user_id: null, work_country: null },
      { email: "c@gmxgroup.com", alt_emails: [], employment_type: "contractor" as const, active: true, user_id: "u3", work_country: "US" as const },
      { email: "b@gmxgroup.com", alt_emails: [], employment_type: null, active: true, user_id: "u5", work_country: "BR" as const },
    ];
    expect(wouldBeRefused([
      { user_id: "u1", email: "A@gmxgroup.com", role: "member" },
      { user_id: "u2", email: "boss@gmxgroup.com", role: "admin" },
      { user_id: "u3", email: "c@gmxgroup.com", role: "member" },
      { user_id: "u4", email: "x@gmxgroup.com", role: "member" },
      { user_id: "u5", email: "b@gmxgroup.com", role: "member" },
    ], people)).toEqual([
      { email: "c@gmxgroup.com", reason: "not_enabled" },
      { email: "x@gmxgroup.com", reason: "no_person" },
    ]);
  });
});
