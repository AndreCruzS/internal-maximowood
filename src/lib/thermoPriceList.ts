// Thermowood distributor price list update: announced Sep 21, 2026, valid from Dec 21, 2026.
// Until then the THERMO tab is read from the current sheet; from Dec 21 on, from the 2027 sheet.

export const THERMO_2027_SHEET_ID = "1gqc_OjcQCqfgzt7XJ6SUPSZsNER02IFiK7GHQOXppHY";
export const THERMO_2027_SHEET_URL = `https://docs.google.com/spreadsheets/d/${THERMO_2027_SHEET_ID}/edit`;

/** Midnight US Eastern on Dec 21, 2026. */
export const THERMO_2027_EFFECTIVE = new Date("2026-12-21T00:00:00-05:00");

export const thermo2027InEffect = (now: Date = new Date()) => now >= THERMO_2027_EFFECTIVE;
