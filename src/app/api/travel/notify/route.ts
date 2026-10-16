import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { DEPARTMENTS } from "@/lib/intranet";
import { TRAVEL_COLUMNS, firstDate, travelSubject, type TravelRequest } from "@/lib/travel";
import { alreadySent, emailRef, logEmail, renderEmail, sendMail } from "@/server/email";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = {
  submitted: "Submitted", in_review: "In review", options_sent: "Options sent", booked: "Booked", completed: "Completed", cancelled: "Cancelled",
};
const day = (ymd: string | null) => (ymd ? new Date(`${ymd}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : "");

/**
 * Emails about a travel request, once each: "submitted" → Procurement (TRAVEL_PROCUREMENT_EMAIL);
 * "status" → the requester, for the request's current status. Read with the caller's session.
 */
export async function POST(request: NextRequest) {
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { id?: string; event?: "submitted" | "status" };
  if (!body.id || !/^[0-9a-f-]{36}$/i.test(body.id) || (body.event !== "submitted" && body.event !== "status")) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const { data } = await supabase.from("travel_requests").select(TRAVEL_COLUMNS).eq("id", body.id).maybeSingle();
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const r = data as unknown as TravelRequest;
  const admin = getSupabaseAdmin();
  const kind = body.event === "submitted" ? "travel_submitted" : "travel_status";
  const ref = body.event === "submitted" ? r.id : emailRef(r.id, r.status);
  if (admin && (await alreadySent(admin, kind, ref))) return NextResponse.json({ status: "sent", already: true });

  const names = async (ids: (string | null)[]) => {
    const list = ids.filter(Boolean) as string[];
    if (!list.length) return {} as Record<string, { full_name: string; email: string | null }>;
    const { data: ps } = await supabase.from("people").select("id, full_name, email").in("id", list);
    return Object.fromEntries(((ps as { id: string; full_name: string; email: string | null }[] | null) ?? []).map(p => [p.id, p]));
  };
  const who = await names([r.requester_person_id, r.traveler_person_id]);
  const requester = (r.requester_person_id && who[r.requester_person_id]?.full_name) || "";
  const traveler = r.traveler_type === "guest" ? `${r.guest_name} (guest)` : r.traveler_type === "employee" ? who[r.traveler_person_id!]?.full_name ?? "" : requester;
  const destination = r.legs[0]?.destination || r.hotels[0]?.city || "";
  const link = `${request.nextUrl.origin}/travel`;
  const today = new Date().toISOString().slice(0, 10);
  const trip = [
    ...r.legs.map((l, i) => `${i + 1}. ${l.mode === "train" ? "Train" : "Flight"} ${l.origin} → ${l.destination}, ${day(l.date)}${l.time !== "any" ? ` (${l.time})` : ""}`),
    ...r.hotels.map(h => `Hotel in ${h.city}${h.area ? ` (${h.area})` : ""}: ${day(h.check_in)} – ${day(h.check_out)}, ${h.guests} guest(s)`),
    ...r.cars.map(c => `Car: ${c.pickup} ${day(c.pickup_on)} → ${c.dropoff || c.pickup} ${day(c.return_on)} (${c.vehicle})`),
  ].join("\n");

  let to: string | null;
  let subject: string;
  let mail: { text: string; html: string };
  if (body.event === "submitted") {
    if (r.requester_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    to = process.env.TRAVEL_PROCUREMENT_EMAIL || null;
    subject = travelSubject({ urgency: r.urgency, depart_on: r.depart_on ?? firstDate(r), destination, traveler: traveler || requester }, today);
    mail = renderEmail({
      title: "New travel request",
      intro: "A new travel request is waiting for the Centralized Travel Buyer. Review it, send the options and book it in the intranet.",
      rows: [
        ["Traveler", traveler], ["Requested by", requester], ["Department", DEPARTMENTS.find(d => d.id === r.department_id)?.name ?? ""],
        ["Project / client", r.project_client], ["Purpose", r.purpose], ["Urgency", `${r.urgency} of 5`], ["Departs", day(r.depart_on ?? firstDate(r))],
        ["Trip", trip], ["Notes", r.notes], ["Travel Policy", r.policy_version ? `Version ${r.policy_version} accepted` : ""],
      ],
      link, linkLabel: "Open the Procurement queue",
    });
  } else {
    to = (r.requester_person_id && who[r.requester_person_id]?.email) || null;
    subject = `Your travel request: ${STATUS[r.status] ?? r.status}${destination ? ` — ${destination}` : ""}`;
    mail = renderEmail({
      title: `Travel request ${STATUS[r.status]?.toLowerCase() ?? r.status}`,
      intro: r.status === "options_sent" ? "Procurement sent travel options. Open the intranet to review them." : r.status === "booked" ? "Your trip is booked. The booking documents are in the intranet." : "The status of your travel request changed.",
      rows: [["Traveler", traveler], ["Purpose", r.purpose], ["Departs", day(r.depart_on ?? firstDate(r))], ["Status", STATUS[r.status] ?? r.status]],
      link, linkLabel: "Open my travel requests",
    });
  }
  const result = to ? await sendMail({ to, subject, ...mail }) : { status: "skipped" as const, error: body.event === "submitted" ? "TRAVEL_PROCUREMENT_EMAIL isn't set" : "No email for the requester" };
  if (admin) await logEmail(admin, { kind, ref_id: ref, to_email: to ?? "", subject, created_by: user.id, ...result });
  return NextResponse.json(result);
}
