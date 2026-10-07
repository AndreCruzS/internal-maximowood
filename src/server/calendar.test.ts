import { afterEach, describe, expect, it, vi } from "vitest";
import { getCalendarEvents, parseIcs } from "@/server/calendar";

const ics = (...events: string[]) => ["BEGIN:VCALENDAR", ...events, "END:VCALENDAR"].join("\r\n");
const ev = (lines: string[]) => ["BEGIN:VEVENT", ...lines, "END:VEVENT"].join("\r\n");

const US = ics(
  ev(["DTSTART;VALUE=DATE:20261126", "DTEND;VALUE=DATE:20261127", "UID:thanks@google.com", "DESCRIPTION:Public holiday", "SUMMARY:Thanksgiving Day"]),
  ev(["DTSTART;VALUE=DATE:20261101", "DTEND;VALUE=DATE:20261102", "UID:dst@google.com", "DESCRIPTION:Observance\\nTo hide observances\\, go to", " Settings", "SUMMARY:Daylight Saving Time ends"]),
);
const BR = ics(ev(["DTSTART;VALUE=DATE:20261102", "DTEND;VALUE=DATE:20261103", "UID:finados@google.com", "DESCRIPTION:Public holiday", "SUMMARY:All Souls' Day"]));
const COMPANY = ics(
  ev(["DTSTART:20261104T130000Z", "DTEND:20261104T140000Z", "UID:standup", "RRULE:FREQ=WEEKLY;BYDAY=WE;COUNT=3", "SUMMARY:Weekly sales meeting", "LOCATION:Room 1"]),
  ev(["DTSTART:20261110T150000Z", "UID:gone", "STATUS:CANCELLED", "SUMMARY:Cancelled thing"]),
);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("calendar", () => {
  it("unfolds lines and reads properties", () => {
    const [e] = parseIcs(US);
    expect(e.SUMMARY[0].value).toBe("Thanksgiving Day");
    expect(e.DTSTART[0].params.VALUE).toBe("DATE");
  });

  it("keeps national public holidays, drops observances, and expands the company calendar", async () => {
    vi.stubEnv("COMPANY_CALENDAR_ICS_URL", "https://example.com/company.ics");
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(url.includes("usa") ? US : url.includes("brazilian") ? BR : COMPANY)));
    const { events, companyConnected, failed } = await getCalendarEvents(new Date("2026-11-01T00:00:00Z"), new Date("2026-12-01T00:00:00Z"));
    expect(companyConnected).toBe(true);
    expect(failed).toEqual([]);
    expect(events.map(e => [e.source, e.title, e.start])).toEqual([
      ["br", "All Souls' Day", "2026-11-02"],
      ["company", "Weekly sales meeting", "2026-11-04T13:00:00.000Z"],
      ["company", "Weekly sales meeting", "2026-11-11T13:00:00.000Z"],
      ["company", "Weekly sales meeting", "2026-11-18T13:00:00.000Z"],
      ["us", "Thanksgiving Day", "2026-11-26"],
    ]);
    expect(events[1]).toMatchObject({ allDay: false, location: "Room 1", end: "2026-11-04T14:00:00.000Z" });
  });

  it("reports a failing feed instead of failing the page", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url.includes("usa") ? new Response("nope", { status: 500 }) : new Response(BR))));
    const { events, failed, companyConnected } = await getCalendarEvents(new Date("2026-11-01T00:00:00Z"), new Date("2026-12-01T00:00:00Z"));
    expect(failed).toEqual(["us"]);
    expect(companyConnected).toBe(false);
    expect(events.map(e => e.title)).toEqual(["All Souls' Day"]);
  });
});
