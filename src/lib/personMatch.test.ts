import { describe, expect, it } from "vitest";
import { matchPeople } from "./personMatch";

const people = [
  { id: "guto", full_name: "Guto Fugiwara", user_id: null },
  { id: "giovani", full_name: "Giovani Miguel", user_id: null },
  { id: "anna", full_name: "Anna Luiza Miguel", user_id: "u1" },
  { id: "joao", full_name: "João Costa", user_id: null },
  { id: "maria", full_name: "Maria da Silva", user_id: null, email: "maria@gmxgroup.com" },
];
const ids = (r: { id: string }[]) => r.map(p => p.id);

describe("matchPeople", () => {
  it("finds a seeded nickname entry by surname (Joao Augusto Fugiwara → Guto Fugiwara)", () => {
    expect(ids(matchPeople(people, { first: "Joao Augusto", last: "Fugiwara", email: "guto@gmxgroup.us" }))[0]).toBe("guto");
  });

  it("ranks surname + first name above first name alone", () => {
    expect(ids(matchPeople(people, { first: "João", last: "Fugiwara", email: "guto@gmxgroup.us" }))).toEqual(["guto", "joao"]);
  });

  it("matches on the email name or nickname when the surname differs", () => {
    expect(ids(matchPeople(people, { first: "Augusto", last: "F.", email: "guto@x.com" }))).toEqual(["guto"]);
    expect(ids(matchPeople(people, { first: "Augusto", last: "", nickname: "Guto" }))).toEqual(["guto"]);
  });

  it("puts an exact email match first", () => {
    expect(ids(matchPeople(people, { first: "Mary", last: "Smith", email: "Maria@gmxgroup.com" }))).toEqual(["maria"]);
  });

  it("never offers entries already linked to a login, and ignores name particles", () => {
    expect(ids(matchPeople(people, { first: "Anna", last: "Miguel" }))).toEqual(["giovani"]);
    expect(ids(matchPeople(people, { first: "Pedro", last: "da Rocha" }))).toEqual([]);
  });
});
