import { describe, expect, it } from "vitest";
import { anniversaryDay, cleanWish, wishWindow, wishesFor, type Wish } from "./wishes";

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 15, 0, 0);

describe("wishWindow", () => {
  it("opens on the day and stays open for a week", () => {
    expect(wishWindow(10, 22, at(2026, 10, 22))).toEqual({ year: 2026, date: "2026-10-22" });
    expect(wishWindow(10, 22, at(2026, 10, 29))).toEqual({ year: 2026, date: "2026-10-22" });
    expect(wishWindow(10, 22, at(2026, 10, 30))).toBeNull();
  });
  it("is closed before the day", () => {
    expect(wishWindow(10, 23, at(2026, 10, 22))).toBeNull();
  });
  it("works across a month or year change", () => {
    expect(wishWindow(12, 30, at(2027, 1, 3))).toBeNull(); // last year's celebration isn't reopened
    expect(wishWindow(9, 28, at(2026, 10, 2))).toEqual({ year: 2026, date: "2026-09-28" });
  });
  it("celebrates Feb 29 on Feb 28 in other years, and needs a date", () => {
    expect(wishWindow(2, 29, at(2026, 2, 28))).toEqual({ year: 2026, date: "2026-02-28" });
    expect(wishWindow(null, 5, at(2026, 2, 5))).toBeNull();
  });
});

describe("anniversaryDay", () => {
  it("only from the first full year", () => {
    expect(anniversaryDay("2023-10-22", at(2026, 10, 22))).toEqual({ month: 10, day: 22 });
    expect(anniversaryDay("2026-01-10", at(2026, 10, 22))).toBeNull();
    expect(anniversaryDay(null, at(2026, 10, 22))).toBeNull();
  });
});

describe("wishesFor / cleanWish", () => {
  const w = (id: string, to: string, occasion: Wish["occasion"], year: number, created_at: string): Wish =>
    ({ id, to_person_id: to, from_person_id: "x", occasion, occasion_year: year, message: "hi", created_at });
  it("keeps one person's wishes for one occasion and year, oldest first", () => {
    const list = [w("2", "a", "birthday", 2026, "2026-10-22T10:00"), w("1", "a", "birthday", 2026, "2026-10-22T09:00"), w("3", "a", "anniversary", 2026, "2026-10-22T09:00"), w("4", "b", "birthday", 2026, "2026-10-22T09:00"), w("5", "a", "birthday", 2025, "2025-10-22T09:00")];
    expect(wishesFor(list, "a", "birthday", 2026).map(x => x.id)).toEqual(["1", "2"]);
  });
  it("trims and caps messages", () => {
    expect(cleanWish("  Feliz aniversário! 🎉  \n")).toBe("Feliz aniversário! 🎉");
    expect(cleanWish("x".repeat(600))).toHaveLength(500);
  });
});
