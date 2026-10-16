/** Travel requests (migration 0021): employees ask, Procurement (the Centralized Travel Buyer) books. */
export const TRAVEL_STATUSES = ["submitted", "in_review", "options_sent", "booked", "completed", "cancelled"] as const;
export type TravelStatus = (typeof TRAVEL_STATUSES)[number];
export const TRAVELER_TYPES = ["self", "employee", "guest"] as const;
export type TravelerType = (typeof TRAVELER_TYPES)[number];
export const TRIP_TYPES = ["round", "one_way", "multi"] as const;
export type TripType = (typeof TRIP_TYPES)[number];
export const TRAVEL_MODES = ["flight", "train"] as const;
export const LUGGAGE = ["none", "carry_on", "checked_1", "checked_2"] as const;
export const SEATS = ["any", "aisle", "window"] as const;
export const CABIN_AREAS = ["any", "front", "middle", "back"] as const;
export const TIMES = ["any", "morning", "afternoon", "evening"] as const;
export const HOTEL_STARS = ["any", "3", "4"] as const;
export const VEHICLES = ["intermediate", "compact", "full_size", "suv", "van"] as const;

export type TravelLeg = { mode: (typeof TRAVEL_MODES)[number]; origin: string; destination: string; date: string; time: (typeof TIMES)[number]; luggage: (typeof LUGGAGE)[number]; seat: (typeof SEATS)[number]; cabin: (typeof CABIN_AREAS)[number] };
export type TravelHotel = { city: string; area: string; check_in: string; check_out: string; guests: number; stars: (typeof HOTEL_STARS)[number] };
export type TravelCar = { pickup: string; dropoff: string; pickup_on: string; return_on: string; vehicle: (typeof VEHICLES)[number] };

export type TravelRequest = {
  id: string;
  requester_id: string;
  requester_person_id: string | null;
  traveler_type: TravelerType;
  traveler_person_id: string | null;
  guest_name: string;
  guest_email: string;
  department_id: string | null;
  project_client: string;
  purpose: string;
  urgency: number;
  trip_type: TripType;
  legs: TravelLeg[];
  hotels: TravelHotel[];
  cars: TravelCar[];
  depart_on: string | null;
  notes: string;
  policy_version: number | null;
  policy_acked_at: string | null;
  status: TravelStatus;
  buyer_person_id: string | null;
  created_at: string;
  updated_at: string;
};
export const TRAVEL_COLUMNS =
  "id, requester_id, requester_person_id, traveler_type, traveler_person_id, guest_name, guest_email, department_id, project_client, purpose, urgency, trip_type, legs, hotels, cars, depart_on, notes, policy_version, policy_acked_at, status, buyer_person_id, created_at, updated_at";

export type TravelEvent = { id: string; request_id: string; kind: "status" | "change" | "message"; from_status: string | null; to_status: string | null; note: string; by_user: string | null; at: string };
export type TravelFile = { id: string; request_id: string; kind: "option" | "document"; path: string; name: string; created_at: string };

export const TRAVEL_BUCKET = "travel";
/** Submit at least this many days before departure (Travel Policy §2). */
export const NOTICE_DAYS = 15;

export const newLeg = (): TravelLeg => ({ mode: "flight", origin: "", destination: "", date: "", time: "any", luggage: "carry_on", seat: "any", cabin: "any" });
export const newHotel = (city = "", check_in = "", check_out = ""): TravelHotel => ({ city, area: "", check_in, check_out, guests: 1, stars: "any" });
export const newCar = (): TravelCar => ({ pickup: "", dropoff: "", pickup_on: "", return_on: "", vehicle: "intermediate" });

/** Earliest date in the trip (first leg, stay or car), YYYY-MM-DD. */
export function firstDate(r: Pick<TravelRequest, "legs" | "hotels" | "cars">): string | null {
  const dates = [...r.legs.map(l => l.date), ...r.hotels.map(h => h.check_in), ...r.cars.map(c => c.pickup_on)].filter(Boolean).sort();
  return dates[0] ?? null;
}

/** Whole days from `today` to `ymd` (both YYYY-MM-DD). */
export const daysUntil = (ymd: string, today: string) =>
  Math.round((Date.parse(`${ymd}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);

/** Less than the policy's notice, or flagged 4–5: Procurement should see it first. */
export const isUrgent = (r: { urgency: number; depart_on: string | null }, today: string) =>
  r.urgency >= 4 || (r.depart_on != null && daysUntil(r.depart_on, today) < NOTICE_DAYS);

/** What's wrong with a draft, in the order the wizard asks (null = ready). */
export type TravelProblem = "purpose" | "traveler" | "guestEmail" | "services" | "legs" | "legOrder" | "hotels" | "cars";
export function travelProblem(r: Pick<TravelRequest, "traveler_type" | "traveler_person_id" | "guest_name" | "guest_email" | "purpose" | "legs" | "hotels" | "cars">): TravelProblem | null {
  if (!r.purpose.trim()) return "purpose";
  if (r.traveler_type === "employee" && !r.traveler_person_id) return "traveler";
  if (r.traveler_type === "guest" && !r.guest_name.trim()) return "traveler";
  if (r.traveler_type === "guest" && r.guest_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.guest_email)) return "guestEmail";
  if (!r.legs.length && !r.hotels.length && !r.cars.length) return "services";
  if (r.legs.some(l => !l.origin.trim() || !l.destination.trim() || !l.date)) return "legs";
  if (r.legs.some((l, i) => i > 0 && l.date < r.legs[i - 1].date)) return "legOrder";
  if (r.hotels.some(h => !h.city.trim() || !h.check_in || !h.check_out || h.check_out <= h.check_in)) return "hotels";
  if (r.cars.some(c => !c.pickup.trim() || !c.pickup_on || !c.return_on || c.return_on < c.pickup_on)) return "cars";
  return null;
}

/** Email subject to Procurement. */
export function travelSubject(r: { urgency: number; depart_on: string | null; destination: string; traveler: string }, today: string) {
  const where = r.destination ? ` to ${r.destination}` : "";
  const when = r.depart_on ? ` — departs ${r.depart_on}` : "";
  return `${isUrgent(r, today) ? "URGENT · " : ""}Travel request: ${r.traveler}${where}${when}`;
}

/** Statuses Procurement can move a request to from here. */
export const NEXT_STATUSES: Record<TravelStatus, TravelStatus[]> = {
  submitted: ["in_review", "options_sent", "booked", "cancelled"],
  in_review: ["options_sent", "booked", "cancelled"],
  options_sent: ["in_review", "booked", "cancelled"],
  booked: ["completed", "cancelled"],
  completed: [],
  cancelled: ["submitted"],
};
/** The traveler may cancel until it's booked. */
export const canCancel = (s: TravelStatus) => s === "submitted" || s === "in_review" || s === "options_sent";
