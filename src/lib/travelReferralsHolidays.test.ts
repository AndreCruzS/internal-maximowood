import { describe, expect, it } from "vitest";
import { daysUntil, firstDate, isUrgent, newCar, newHotel, newLeg, travelProblem, travelSubject } from "@/lib/travel";
import { resumeProblem, roleLabel } from "@/lib/referrals";
import { calendarFor, holidaysFor, nextHoliday, type OfficeHoliday } from "@/lib/holidays";

const base = { traveler_type: "self" as const, traveler_person_id: null, guest_name: "", guest_email: "", purpose: "Expo", legs: [], hotels: [], cars: [] };

describe("travel", () => {
  it("counts days and flags less than 15 days' notice or urgency 4–5", () => {
    expect(daysUntil("2026-10-30", "2026-10-16")).toBe(14);
    expect(isUrgent({ urgency: 2, depart_on: "2026-10-30" }, "2026-10-16")).toBe(true);
    expect(isUrgent({ urgency: 2, depart_on: "2026-10-31" }, "2026-10-16")).toBe(false);
    expect(isUrgent({ urgency: 4, depart_on: null }, "2026-10-16")).toBe(true);
  });
  it("puts URGENT in Procurement's subject when it is", () => {
    expect(travelSubject({ urgency: 5, depart_on: "2026-12-01", destination: "Miami", traveler: "Ana" }, "2026-10-16")).toBe("URGENT · Travel request: Ana to Miami — departs 2026-12-01");
    expect(travelSubject({ urgency: 2, depart_on: "2026-12-01", destination: "", traveler: "Ana" }, "2026-10-16")).toBe("Travel request: Ana — departs 2026-12-01");
  });
  it("finds the first date of the trip", () => {
    expect(firstDate({ legs: [{ ...newLeg(), date: "2026-11-03" }], hotels: [newHotel("X", "2026-11-02", "2026-11-04")], cars: [] })).toBe("2026-11-02");
    expect(firstDate({ legs: [], hotels: [], cars: [] })).toBeNull();
  });
  it("checks drafts in order", () => {
    expect(travelProblem({ ...base, purpose: " " })).toBe("purpose");
    expect(travelProblem({ ...base, traveler_type: "employee" })).toBe("traveler");
    expect(travelProblem({ ...base, traveler_type: "guest", guest_name: "Bo", guest_email: "nope" })).toBe("guestEmail");
    expect(travelProblem(base)).toBe("services");
    expect(travelProblem({ ...base, legs: [newLeg()] })).toBe("legs");
    const leg = (date: string) => ({ ...newLeg(), origin: "MIA", destination: "CWB", date });
    expect(travelProblem({ ...base, legs: [leg("2026-11-05"), leg("2026-11-01")] })).toBe("legOrder");
    expect(travelProblem({ ...base, hotels: [newHotel("Miami", "2026-11-05", "2026-11-05")] })).toBe("hotels");
    expect(travelProblem({ ...base, cars: [{ ...newCar(), pickup: "MIA", pickup_on: "2026-11-05", return_on: "2026-11-04" }] })).toBe("cars");
    expect(travelProblem({ ...base, legs: [leg("2026-11-01"), leg("2026-11-05")] })).toBeNull();
  });
});

describe("referrals", () => {
  it("accepts PDF and Word up to 5 MB", () => {
    expect(resumeProblem({ name: "cv.pdf", type: "application/pdf", size: 1000 })).toBeNull();
    expect(resumeProblem({ name: "cv.docx", type: "", size: 1000 })).toBeNull();
    expect(resumeProblem({ name: "cv.png", type: "image/png", size: 1000 })).toBe("resumeType");
    expect(resumeProblem({ name: "cv.pdf", type: "application/pdf", size: 6 * 1024 * 1024 })).toBe("resumeSize");
  });
  it("labels roles like the portal", () => {
    expect(roleLabel({ title: "Marketing Designer", company_label: "Lumber Plus", location: "Fort Lauderdale, FL" })).toBe("Marketing Designer — Lumber Plus, Fort Lauderdale, FL");
  });
});

describe("holidays", () => {
  const row = (calendar: OfficeHoliday["calendar"], day: string, name: string): OfficeHoliday => ({ id: day + calendar, calendar, day, name, kind: "closed", opens: null, closes: null, note: "" });
  const rows = [row("gmx-us", "2026-11-26", "Thanksgiving"), row("gmx-us", "2026-12-25", "Christmas"), row("br", "2026-11-02", "Finados"), row("br", "2026-09-08", "Nat"), row("curitiba", "2026-09-08", "Nossa Senhora da Luz")];
  it("picks the calendar from the office", () => {
    expect(calendarFor("aventura")).toBe("gmx-us");
    expect(calendarFor("lumberplus-houston")).toBe("lumberplus-us");
    expect(calendarFor("curitiba")).toBe("curitiba");
    expect(calendarFor("remote", "BR")).toBe("br");
    expect(calendarFor(null)).toBe("gmx-us");
  });
  it("adds national days to Curitiba, letting the city row win", () => {
    expect(holidaysFor("curitiba", rows).map(r => r.name)).toEqual(["Nossa Senhora da Luz", "Finados"]);
  });
  it("finds the next holiday in the office's time zone", () => {
    // 02:00 UTC on Nov 26 is still Nov 25 in New York.
    expect(nextHoliday("gmx-us", rows, new Date("2026-11-26T02:00:00Z"))).toEqual({ holiday: rows[0], days: 1 });
    expect(nextHoliday("gmx-us", rows, new Date("2026-10-16T15:00:00Z"))?.days).toBe(41);
    expect(nextHoliday("gmx-us", rows, new Date("2026-12-26T15:00:00Z"))).toBeNull();
  });
});
