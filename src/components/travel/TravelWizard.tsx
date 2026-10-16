"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";
import { DEPARTMENTS } from "@/lib/intranet";
import { deptName } from "@/lib/i18n/text";
import { fmt } from "@/lib/i18n/locale";
import { localYmd } from "@/components/playbooks/Quality";
import {
  CABIN_AREAS, HOTEL_STARS, LUGGAGE, NOTICE_DAYS, SEATS, TIMES, TRAVEL_MODES, TRAVELER_TYPES, TRIP_TYPES, VEHICLES,
  daysUntil, firstDate, newCar, newHotel, newLeg, travelProblem,
  type TravelCar, type TravelHotel, type TravelLeg, type TravelRequest, type TripType,
} from "@/lib/travel";
import type { TravelData } from "@/server/travel";

const field = "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-[#009f67] focus:ring-2 focus:ring-[#009f67]/20";
const label = "mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500";
const STEPS = ["traveler", "trip", "stay", "review"] as const;

type Draft = Pick<TravelRequest, "traveler_type" | "traveler_person_id" | "guest_name" | "guest_email" | "department_id" | "project_client" | "purpose" | "urgency" | "trip_type" | "legs" | "hotels" | "cars" | "notes">;

const blank = (dept: string | null): Draft => ({
  traveler_type: "self", traveler_person_id: null, guest_name: "", guest_email: "", department_id: dept, project_client: "", purpose: "",
  urgency: 2, trip_type: "round", legs: [newLeg(), newLeg()], hotels: [], cars: [], notes: "",
});

/** The 4-step travel request (Traveler → Trip → Hotel & car → Review), also used to edit a submitted request. */
export default function TravelWizard({ data, editing, onDone }: { data: TravelData; editing: TravelRequest | null; onDone: () => void }) {
  const { t, tag } = useI18n();
  const x = t.travel;
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [d, setD] = useState<Draft>(() => (editing ? { ...editing } : blank(data.me.department)));
  const [noTransport, setNoTransport] = useState(Boolean(editing && !editing.legs.length));
  const [accepted, setAccepted] = useState(Boolean(data.myAck));
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Draft>) => setD(v => ({ ...v, ...patch }));
  const today = localYmd();
  const legs = noTransport ? [] : d.legs;
  const start = firstDate({ legs, hotels: d.hotels, cars: d.cars });
  const days = start ? daysUntil(start, today) : null;
  const date = (ymd: string) => new Date(`${ymd}T12:00:00`).toLocaleDateString(tag, { month: "short", day: "numeric", year: "numeric" });

  const setLeg = (i: number, patch: Partial<TravelLeg>) => set({ legs: d.legs.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const setHotel = (i: number, patch: Partial<TravelHotel>) => set({ hotels: d.hotels.map((h, j) => (j === i ? { ...h, ...patch } : h)) });
  const setCar = (i: number, patch: Partial<TravelCar>) => set({ cars: d.cars.map((c, j) => (j === i ? { ...c, ...patch } : c)) });

  /** Round trip = 2 legs (the way back mirrors the way out); one way = 1; multi-city keeps what's there. */
  const setTrip = (trip_type: TripType) => {
    const out = d.legs[0] ?? newLeg();
    const legs = trip_type === "one_way" ? [out]
      : trip_type === "round" ? [out, { ...(d.legs[1] ?? newLeg()), origin: d.legs[1]?.origin || out.destination, destination: d.legs[1]?.destination || out.origin }]
      : d.legs.length >= 2 ? d.legs : [out, newLeg()];
    set({ trip_type, legs });
  };
  const addLeg = () => set({ trip_type: "multi", legs: [...d.legs, { ...newLeg(), origin: d.legs.at(-1)?.destination ?? "" }] });

  const problem = () => {
    const p = travelProblem({ ...d, legs });
    if (p) return x.problems[p];
    if (data.policy && !accepted) return x.problems.policy;
    return null;
  };
  const stepProblem = (i: number) => {
    const p = travelProblem({ ...d, legs });
    if (i === 0 && (p === "purpose" || p === "traveler" || p === "guestEmail")) return x.problems[p];
    if (i === 1 && (p === "legs" || p === "legOrder")) return x.problems[p];
    if (i === 2 && (p === "services" || p === "hotels" || p === "cars")) return x.problems[p];
    return null;
  };
  const next = () => {
    const p = stepProblem(step);
    if (p) return toast.error(p);
    setStep(s => Math.min(STEPS.length - 1, s + 1));
  };

  const accept = async () => {
    const supabase = getSupabase();
    if (!supabase || !data.policy) return;
    const uid = (await supabase.auth.getUser()).data.user?.id;
    const { error } = await supabase.from("playbook_acks")
      .upsert({ playbook_id: data.policy.id, user_id: uid, version: data.policy.version, acked_at: new Date().toISOString() }, { onConflict: "playbook_id,user_id" });
    if (error) return toast.error(error.message);
    setAccepted(true);
  };

  const submit = async () => {
    const p = problem();
    if (p) return toast.error(p);
    const supabase = getSupabase();
    if (!supabase) return;
    setBusy(true);
    const row = {
      traveler_type: d.traveler_type,
      traveler_person_id: d.traveler_type === "employee" ? d.traveler_person_id : null,
      guest_name: d.traveler_type === "guest" ? d.guest_name.trim() : "",
      guest_email: d.traveler_type === "guest" ? d.guest_email.trim() : "",
      department_id: d.department_id || null,
      project_client: d.project_client.trim(),
      purpose: d.purpose.trim(),
      urgency: d.urgency,
      trip_type: noTransport ? "one_way" : d.trip_type,
      legs: legs.map(l => ({ ...l, origin: l.origin.trim(), destination: l.destination.trim() })),
      hotels: d.hotels.map(h => ({ ...h, city: h.city.trim(), area: h.area.trim() })),
      cars: d.cars.map(c => ({ ...c, pickup: c.pickup.trim(), dropoff: c.dropoff.trim() })),
      depart_on: start,
      notes: d.notes.trim(),
    };
    const res = editing
      ? await supabase.from("travel_requests").update(row).eq("id", editing.id).select("id").single()
      : await supabase.from("travel_requests").insert(row).select("id").single();
    if (res.error) { setBusy(false); return toast.error(res.error.message); }
    if (!editing) await fetch("/api/travel/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: res.data.id, event: "submitted" }) }).catch(() => null);
    setBusy(false);
    toast.success(editing ? x.saved : x.submitted);
    if (!editing) { setD(blank(data.me.department)); setStep(0); setNoTransport(false); }
    onDone();
    router.refresh();
  };

  const people = data.people.filter(p => p.id !== data.me.personId);
  const opt = <T extends string>(values: readonly T[], labels: Record<T, string>) => values.map(v => <option key={v} value={v}>{labels[v]}</option>);

  return (
    <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-6 py-4">
        <div>
          <p className="text-[11px] font-black uppercase tracking-widest text-[#00704a]">{editing ? x.editRequest : x.newRequest}</p>
          <h2 className="text-lg font-black text-gray-900">{x.steps[STEPS[step]]}</h2>
        </div>
        <Link href="/travel-policy" className="flex h-9 items-center gap-1.5 rounded-full border border-gray-300 px-3 text-sm font-bold text-gray-700 hover:border-[#009f67]">
          {x.viewPolicy} <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>

      <ol className="flex items-center gap-2 bg-gray-50 px-6 py-3 text-xs font-bold">
        {STEPS.map((s, i) => (
          <li key={s} className="flex flex-1 items-center gap-2">
            <button type="button" onClick={() => i < step && setStep(i)} disabled={i > step}
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${i <= step ? "bg-[#009f67] text-white" : "border border-gray-300 text-gray-400"}`}>{i + 1}</button>
            <span className={`hidden sm:inline ${i === step ? "text-[#00704a]" : "text-gray-400"}`}>{x.steps[s]}</span>
            {i < STEPS.length - 1 && <span className="h-px flex-1 bg-gray-200" />}
          </li>
        ))}
      </ol>

      <div className="space-y-4 p-6">
        {step === 0 && (
          <>
            <div>
              <label className={label} htmlFor="tr-who">{x.whoTravels}</label>
              <select id="tr-who" value={d.traveler_type} onChange={e => set({ traveler_type: e.target.value as Draft["traveler_type"] })} className={field}>
                {opt(TRAVELER_TYPES, x.travelerTypes)}
              </select>
            </div>
            {d.traveler_type === "employee" && (
              <select value={d.traveler_person_id ?? ""} onChange={e => set({ traveler_person_id: e.target.value || null })} aria-label={x.pickEmployee} className={field}>
                <option value="">{x.pickEmployee}</option>
                {people.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
            )}
            {d.traveler_type === "guest" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <input value={d.guest_name} onChange={e => set({ guest_name: e.target.value })} maxLength={120} placeholder={x.guestName} aria-label={x.guestName} className={field} />
                <input type="email" value={d.guest_email} onChange={e => set({ guest_email: e.target.value })} placeholder={x.guestEmail} aria-label={x.guestEmail} className={field} />
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={label} htmlFor="tr-dept">{x.department}</label>
                <select id="tr-dept" value={d.department_id ?? ""} onChange={e => set({ department_id: e.target.value || null })} className={field}>
                  <option value="">—</option>
                  {DEPARTMENTS.map(dp => <option key={dp.id} value={dp.id}>{deptName(t, dp.id)}</option>)}
                </select>
              </div>
              <div>
                <label className={label} htmlFor="tr-proj">{x.projectClient}</label>
                <input id="tr-proj" value={d.project_client} onChange={e => set({ project_client: e.target.value })} maxLength={200} className={field} />
              </div>
            </div>
            <div>
              <label className={label} htmlFor="tr-purpose">{x.purpose}</label>
              <textarea id="tr-purpose" value={d.purpose} onChange={e => set({ purpose: e.target.value })} maxLength={2000} rows={3} placeholder={x.purposeHint}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#009f67]" />
            </div>
            <div>
              <span className={label}>{x.urgency}</span>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5].map(u => (
                  <button key={u} type="button" onClick={() => set({ urgency: u })} aria-pressed={d.urgency === u}
                    className={`rounded-full border px-3 py-1.5 text-sm font-bold ${d.urgency === u ? (u >= 4 ? "border-amber-500 bg-amber-50 text-amber-800" : "border-[#009f67] bg-[#e6f6f0] text-[#00704a]") : "border-gray-300 text-gray-600"}`}>
                    {x.urgencies[u as 1 | 2 | 3 | 4 | 5]}
                  </button>
                ))}
              </div>
            </div>
            <p className="flex gap-2 rounded-lg bg-sky-50 p-3 text-xs text-sky-900"><ShieldAlert className="h-4 w-4 shrink-0" /> {x.noIds}</p>
          </>
        )}

        {step === 1 && (
          <>
            <label className="flex items-center gap-2 text-sm font-bold text-gray-700">
              <input type="checkbox" checked={noTransport} onChange={e => setNoTransport(e.target.checked)} className="h-4 w-4 accent-[#009f67]" /> {x.noTransport}
            </label>
            {!noTransport && (
              <>
                <div>
                  <span className={label}>{x.tripType}</span>
                  <div className="flex flex-wrap gap-2">
                    {TRIP_TYPES.map(tt => (
                      <button key={tt} type="button" onClick={() => setTrip(tt)} aria-pressed={d.trip_type === tt}
                        className={`rounded-full border px-3 py-1.5 text-sm font-bold ${d.trip_type === tt ? "border-[#009f67] bg-[#e6f6f0] text-[#00704a]" : "border-gray-300 text-gray-600"}`}>{x.tripTypes[tt]}</button>
                    ))}
                  </div>
                </div>
                {d.legs.map((l, i) => (
                  <div key={i} className="space-y-3 rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-black text-gray-900">{fmt(x.leg, { n: i + 1 })}</p>
                      {d.trip_type === "multi" && d.legs.length > 2 && (
                        <button type="button" onClick={() => set({ legs: d.legs.filter((_, j) => j !== i) })} aria-label={x.remove} className="rounded p-1.5 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                      )}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-4">
                      <select value={l.mode} onChange={e => setLeg(i, { mode: e.target.value as TravelLeg["mode"] })} aria-label={x.mode} className={field}>{opt(TRAVEL_MODES, x.modes)}</select>
                      <input value={l.origin} onChange={e => setLeg(i, { origin: e.target.value })} placeholder={`${x.origin} · ${x.cityOrAirport}`} aria-label={x.origin} className={`${field} sm:col-span-3 lg:col-span-1`} />
                      <input value={l.destination} onChange={e => setLeg(i, { destination: e.target.value })} placeholder={`${x.destination} · ${x.cityOrAirport}`} aria-label={x.destination} className={`${field} sm:col-span-2 lg:col-span-1`} />
                      <input type="date" value={l.date} min={today} onChange={e => setLeg(i, { date: e.target.value })} aria-label={x.date} className={field} />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-4">
                      <select value={l.time} onChange={e => setLeg(i, { time: e.target.value as TravelLeg["time"] })} aria-label={x.time} className={field}>{opt(TIMES, x.times)}</select>
                      <select value={l.luggage} onChange={e => setLeg(i, { luggage: e.target.value as TravelLeg["luggage"] })} aria-label={x.luggage} className={field}>{opt(LUGGAGE, x.luggages)}</select>
                      <select value={l.seat} onChange={e => setLeg(i, { seat: e.target.value as TravelLeg["seat"] })} aria-label={x.seat} className={field}>{opt(SEATS, x.seats)}</select>
                      <select value={l.cabin} onChange={e => setLeg(i, { cabin: e.target.value as TravelLeg["cabin"] })} aria-label={x.cabin} className={field}>{opt(CABIN_AREAS, x.cabins)}</select>
                    </div>
                  </div>
                ))}
                <button type="button" onClick={addLeg} className="flex items-center gap-1.5 text-sm font-bold text-[#00704a] hover:underline"><Plus className="h-4 w-4" /> {x.addLeg}</button>
                <p className="-mt-2 text-xs text-gray-400">{x.addLegHint}</p>
              </>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <label className="flex items-center gap-2 text-sm font-bold text-gray-700">
              <input type="checkbox" checked={d.hotels.length > 0} className="h-4 w-4 accent-[#009f67]"
                onChange={e => set({ hotels: e.target.checked ? [newHotel(legs[0]?.destination ?? "", legs[0]?.date ?? "", legs.length > 1 ? legs.at(-1)!.date : "")] : [] })} /> {x.needHotel}
            </label>
            {d.hotels.map((h, i) => (
              <div key={i} className="space-y-3 rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-black text-gray-900">{fmt(x.hotel, { n: i + 1 })}</p>
                  <button type="button" onClick={() => set({ hotels: d.hotels.filter((_, j) => j !== i) })} aria-label={x.remove} className="rounded p-1.5 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input value={h.city} onChange={e => setHotel(i, { city: e.target.value })} placeholder={x.city} aria-label={x.city} className={field} />
                  <input value={h.area} onChange={e => setHotel(i, { area: e.target.value })} placeholder={x.area} aria-label={x.area} className={field} />
                </div>
                <div className="grid gap-3 sm:grid-cols-4">
                  <label className="text-xs text-gray-500">{x.checkIn}<input type="date" value={h.check_in} min={today} onChange={e => setHotel(i, { check_in: e.target.value })} className={field} /></label>
                  <label className="text-xs text-gray-500">{x.checkOut}<input type="date" value={h.check_out} min={h.check_in || today} onChange={e => setHotel(i, { check_out: e.target.value })} className={field} /></label>
                  <label className="text-xs text-gray-500">{x.guests}<input type="number" min={1} max={20} value={h.guests} onChange={e => setHotel(i, { guests: Math.max(1, Number(e.target.value) || 1) })} className={field} /></label>
                  <label className="text-xs text-gray-500">{x.stars}<select value={h.stars} onChange={e => setHotel(i, { stars: e.target.value as TravelHotel["stars"] })} className={field}>{opt(HOTEL_STARS, x.starOptions)}</select></label>
                </div>
              </div>
            ))}
            {d.hotels.length > 0 && <button type="button" onClick={() => set({ hotels: [...d.hotels, newHotel()] })} className="flex items-center gap-1.5 text-sm font-bold text-[#00704a] hover:underline"><Plus className="h-4 w-4" /> {x.addHotel}</button>}

            <label className="flex items-center gap-2 text-sm font-bold text-gray-700">
              <input type="checkbox" checked={d.cars.length > 0} className="h-4 w-4 accent-[#009f67]"
                onChange={e => set({ cars: e.target.checked ? [{ ...newCar(), pickup: legs[0]?.destination ?? "", pickup_on: legs[0]?.date ?? "", return_on: legs.length > 1 ? legs.at(-1)!.date : "" }] : [] })} /> {x.needCar}
            </label>
            {d.cars.map((c, i) => (
              <div key={i} className="space-y-3 rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-black text-gray-900">{fmt(x.car, { n: i + 1 })}</p>
                  <button type="button" onClick={() => set({ cars: d.cars.filter((_, j) => j !== i) })} aria-label={x.remove} className="rounded p-1.5 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input value={c.pickup} onChange={e => setCar(i, { pickup: e.target.value })} placeholder={x.pickup} aria-label={x.pickup} className={field} />
                  <input value={c.dropoff} onChange={e => setCar(i, { dropoff: e.target.value })} placeholder={x.dropoff} aria-label={x.dropoff} className={field} />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="text-xs text-gray-500">{x.pickupOn}<input type="date" value={c.pickup_on} min={today} onChange={e => setCar(i, { pickup_on: e.target.value })} className={field} /></label>
                  <label className="text-xs text-gray-500">{x.returnOn}<input type="date" value={c.return_on} min={c.pickup_on || today} onChange={e => setCar(i, { return_on: e.target.value })} className={field} /></label>
                  <label className="text-xs text-gray-500">{x.vehicle}<select value={c.vehicle} onChange={e => setCar(i, { vehicle: e.target.value as TravelCar["vehicle"] })} className={field}>{opt(VEHICLES, x.vehicles)}</select></label>
                </div>
              </div>
            ))}
            {d.cars.length > 0 && <button type="button" onClick={() => set({ cars: [...d.cars, newCar()] })} className="flex items-center gap-1.5 text-sm font-bold text-[#00704a] hover:underline"><Plus className="h-4 w-4" /> {x.addCar}</button>}

            <div>
              <label className={label} htmlFor="tr-notes">{x.notes}</label>
              <textarea id="tr-notes" value={d.notes} onChange={e => set({ notes: e.target.value })} maxLength={2000} rows={2} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#009f67]" />
            </div>
            <p className="text-xs text-gray-500">{x.policyStandard}</p>
          </>
        )}

        {step === 3 && (
          <>
            {days !== null && days >= 0 && days < NOTICE_DAYS && (
              <p className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {fmt(x.lateWarning, { n: days })}</p>
            )}
            <dl className="divide-y divide-gray-100 rounded-xl border border-gray-200 text-sm">
              {[
                [x.whoTravels, d.traveler_type === "employee" ? data.people.find(p => p.id === d.traveler_person_id)?.full_name ?? "—" : d.traveler_type === "guest" ? d.guest_name : x.travelerTypes.self],
                [x.department, d.department_id ? deptName(t, d.department_id) : "—"],
                [x.projectClient, d.project_client || "—"],
                [x.purpose, d.purpose],
                [x.urgency, x.urgencies[d.urgency as 1 | 2 | 3 | 4 | 5]],
                [x.tripType, noTransport ? x.noTransport : `${x.tripTypes[d.trip_type]} · ${legs.map(l => `${l.origin} → ${l.destination} (${l.date ? date(l.date) : "—"})`).join(" · ")}`],
                [x.needHotel, d.hotels.map(h => `${h.city} ${h.check_in ? date(h.check_in) : ""} – ${h.check_out ? date(h.check_out) : ""}`).join(" · ") || "—"],
                [x.needCar, d.cars.map(c => `${c.pickup} ${c.pickup_on ? date(c.pickup_on) : ""} – ${c.return_on ? date(c.return_on) : ""}`).join(" · ") || "—"],
              ].map(([k, v]) => (
                <div key={k} className="grid gap-1 px-4 py-2.5 sm:grid-cols-[10rem_minmax(0,1fr)]">
                  <dt className="font-bold text-gray-500">{k}</dt>
                  <dd className="whitespace-pre-line text-gray-900">{v}</dd>
                </div>
              ))}
            </dl>

            {data.policy && (
              <div className="rounded-xl border border-gray-200 p-4">
                <p className="text-sm font-black text-gray-900">{x.policyTitle}</p>
                {accepted && data.myAck ? (
                  <p className="mt-2 flex items-center gap-1.5 text-sm font-bold text-[#00704a]"><CheckCircle2 className="h-4 w-4" /> {fmt(x.policyAccepted, { n: data.myAck.version, date: date(data.myAck.acked_at.slice(0, 10)) })}</p>
                ) : accepted ? (
                  <p className="mt-2 flex items-center gap-1.5 text-sm font-bold text-[#00704a]"><CheckCircle2 className="h-4 w-4" /> {fmt(x.policyAccepted, { n: data.policy.version, date: date(today) })}</p>
                ) : (
                  <>
                    {data.ackOutdated && <p className="mt-2 text-sm font-bold text-amber-800">{x.policyChanged}</p>}
                    <ul className="mt-2 space-y-1 text-sm text-gray-700">{x.policyPoints.map(p => <li key={p}>• {p}</li>)}</ul>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <Link href="/travel-policy" target="_blank" className="text-sm font-bold text-[#00704a] hover:underline">{x.readPolicy} ↗</Link>
                      <button type="button" onClick={accept} className="flex h-9 items-center gap-1.5 rounded-lg border-2 border-[#009f67] px-3 text-sm font-bold text-[#00704a] hover:bg-[#f2fbf7]">
                        <CheckCircle2 className="h-4 w-4" /> {x.acceptPolicy}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-gray-100 px-6 py-4">
        {editing && <button type="button" onClick={onDone} className="h-10 rounded-lg px-3 text-sm font-bold text-gray-600 hover:bg-gray-50">{x.cancelEdit}</button>}
        {step > 0 && <button type="button" onClick={() => setStep(s => s - 1)} className="ml-auto h-10 rounded-lg border border-gray-300 px-4 text-sm font-bold text-gray-700">{x.back}</button>}
        {step < STEPS.length - 1 ? (
          <button type="button" onClick={next} className={`${step === 0 ? "ml-auto" : ""} h-10 rounded-lg bg-[#009f67] px-5 text-sm font-bold text-white hover:bg-[#00704a]`}>{x.next}</button>
        ) : (
          <button type="button" onClick={submit} disabled={busy} className="flex h-10 items-center gap-2 rounded-lg bg-[#009f67] px-5 text-sm font-bold text-white hover:bg-[#00704a] disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {editing ? x.saveChanges : x.submit}
          </button>
        )}
      </div>
    </section>
  );
}
