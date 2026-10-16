"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, FileText, Loader2, MessageSquare, Pencil, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";
import { deptName } from "@/lib/i18n/text";
import { fmt } from "@/lib/i18n/locale";
import { plural } from "@/lib/i18n/dictionaries";
import { localYmd } from "@/components/playbooks/Quality";
import { NEXT_STATUSES, TRAVEL_BUCKET, canCancel, firstDate, isUrgent, type TravelEvent, type TravelFile, type TravelRequest, type TravelStatus } from "@/lib/travel";

export const STATUS_STYLE: Record<TravelStatus, string> = {
  submitted: "bg-sky-50 text-sky-800", in_review: "bg-amber-50 text-amber-800", options_sent: "bg-violet-50 text-violet-800",
  booked: "bg-[#e6f6f0] text-[#00704a]", completed: "bg-gray-100 text-gray-700", cancelled: "bg-red-50 text-red-700",
};
const MAX_FILE = 10 * 1024 * 1024;
const FILE_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];

const notify = (id: string, event: "submitted" | "status") =>
  fetch("/api/travel/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, event }) }).catch(() => null);

/** One travel request: summary, itinerary, Procurement's files, history and the actions the viewer may take. */
export default function TravelRequestCard({ r, names, userNames, events, files, procurement, internalNotes, onEdit }: {
  r: TravelRequest;
  names: Record<string, string>;
  userNames: Record<string, string>;
  events: TravelEvent[];
  files: TravelFile[];
  /** Shown in the Procurement queue: status, notes, messages and uploads. */
  procurement?: boolean;
  internalNotes?: string;
  onEdit?: () => void;
}) {
  const { t, tag } = useI18n();
  const x = t.travel;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [change, setChange] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [notes, setNotes] = useState(internalNotes ?? "");
  const date = (ymd: string) => new Date(ymd.length === 10 ? `${ymd}T12:00:00` : ymd).toLocaleDateString(tag, { month: "short", day: "numeric", year: "numeric" });
  const start = r.depart_on ?? firstDate(r);
  const traveler = r.traveler_type === "guest" ? r.guest_name : r.traveler_type === "employee" ? names[r.traveler_person_id ?? ""] ?? "—" : names[r.requester_person_id ?? ""] ?? x.travelerTypes.self;
  const route = r.legs.length ? [r.legs[0].origin, ...r.legs.map(l => l.destination)].join(" → ") : r.hotels[0]?.city ?? r.cars[0]?.pickup ?? "";
  const urgent = isUrgent({ urgency: r.urgency, depart_on: start }, localYmd()) && !["booked", "completed", "cancelled"].includes(r.status);
  const mine = !procurement;

  const run = async (key: string, fn: () => Promise<{ error: { message: string } | null }>, ok: string) => {
    setBusy(key);
    const { error } = await fn();
    setBusy(null);
    if (error) { toast.error(error.message); return false; }
    toast.success(ok);
    router.refresh();
    return true;
  };
  const supabase = () => getSupabase()!;

  const setStatus = async (status: TravelStatus) => {
    if (await run("status", async () => await supabase().from("travel_requests").update({ status }).eq("id", r.id), x.status[status])) notify(r.id, "status");
  };
  const cancel = async () => {
    if (!window.confirm(x.cancelConfirm)) return;
    if (await run("cancel", async () => await supabase().from("travel_requests").update({ status: "cancelled" }).eq("id", r.id), x.cancelled)) notify(r.id, "status");
  };
  const sendChange = async () => {
    if (!change?.trim()) return;
    if (await run("change", async () => await supabase().rpc("travel_change_request", { request: r.id, note: change.trim() }), x.changeSent)) setChange(null);
  };
  const sendMessage = async () => {
    if (!message.trim()) return;
    const uid = (await supabase().auth.getUser()).data.user?.id;
    if (await run("message", async () => await supabase().from("travel_request_events").insert({ request_id: r.id, kind: "message", note: message.trim(), by_user: uid }), x.messageSent)) setMessage("");
  };
  const saveNotes = () => run("notes", async () => await supabase().from("travel_internal").upsert({ request_id: r.id, notes: notes.trim(), updated_at: new Date().toISOString() }), x.notesSaved);
  const upload = async (kind: TravelFile["kind"], file: File | undefined) => {
    if (!file) return;
    if (!FILE_TYPES.includes(file.type) || file.size > MAX_FILE) return toast.error(x.fileTooBig);
    const ext = file.type === "application/pdf" ? "pdf" : file.type.split("/")[1].replace("jpeg", "jpg");
    const path = `${r.id}/${crypto.randomUUID()}.${ext}`;
    setBusy(kind);
    const up = await supabase().storage.from(TRAVEL_BUCKET).upload(path, file, { contentType: file.type });
    if (up.error) { setBusy(null); return toast.error(up.error.message); }
    await run(kind, async () => await supabase().from("travel_request_files").insert({ request_id: r.id, kind, path, name: file.name }), x.uploaded);
  };
  const openFile = async (f: TravelFile) => {
    const { data, error } = await supabase().storage.from(TRAVEL_BUCKET).createSignedUrl(f.path, 120);
    if (error || !data) return toast.error(error?.message ?? "");
    window.open(data.signedUrl, "_blank", "noopener");
  };

  const fileList = (kind: TravelFile["kind"]) => files.filter(f => f.kind === kind);

  return (
    <li className="rounded-xl border border-gray-200 bg-white">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="flex w-full items-start gap-3 p-4 text-left">
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_STYLE[r.status]}`}>{x.status[r.status]}</span>
            {urgent && <span className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white">{x.urgent}</span>}
            {start && <span className="text-xs text-gray-500">{fmt(x.departs, { date: date(start) })}</span>}
          </span>
          <span className="mt-1 block truncate font-bold text-gray-900">{route || r.purpose}</span>
          <span className="block truncate text-xs text-gray-500">
            {procurement ? fmt(x.requestedBy, { name: names[r.requester_person_id ?? ""] ?? "—", date: date(r.created_at) }) : fmt(x.forTraveler, { name: traveler })}
            {procurement && r.traveler_type !== "self" ? ` · ${fmt(x.forTraveler, { name: traveler })}` : ""}
          </span>
        </span>
        {open ? <ChevronUp className="h-4 w-4 shrink-0 text-gray-400" /> : <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />}
      </button>

      {open && (
        <div className="space-y-4 border-t border-gray-100 p-4 text-sm">
          <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-[8rem_minmax(0,1fr)]">
            <dt className="font-bold text-gray-500">{x.purpose}</dt><dd className="whitespace-pre-line text-gray-900">{r.purpose}</dd>
            {r.department_id && <><dt className="font-bold text-gray-500">{x.department}</dt><dd>{deptName(t, r.department_id)}</dd></>}
            {r.project_client && <><dt className="font-bold text-gray-500">{x.projectClient}</dt><dd>{r.project_client}</dd></>}
            <dt className="font-bold text-gray-500">{x.urgency}</dt><dd>{x.urgencies[r.urgency as 1 | 2 | 3 | 4 | 5]}</dd>
            {r.traveler_type === "guest" && r.guest_email && <><dt className="font-bold text-gray-500">{x.guestEmail}</dt><dd>{r.guest_email}</dd></>}
          </dl>
          {(r.legs.length > 0 || r.hotels.length > 0 || r.cars.length > 0) && (
            <ul className="space-y-1 rounded-lg bg-gray-50 p-3 text-gray-800">
              {r.legs.map((l, i) => (
                <li key={`l${i}`}>✈︎ {x.modes[l.mode]} · {l.origin} → {l.destination} · {l.date ? date(l.date) : "—"}{l.time !== "any" ? ` · ${x.times[l.time]}` : ""} · {x.luggages[l.luggage]}{l.seat !== "any" ? ` · ${x.seats[l.seat]}` : ""}{l.cabin !== "any" ? ` · ${x.cabins[l.cabin]}` : ""}</li>
              ))}
              {r.hotels.map((h, i) => <li key={`h${i}`}>🛏 {h.city}{h.area ? ` (${h.area})` : ""} · {h.check_in ? date(h.check_in) : ""} – {h.check_out ? date(h.check_out) : ""} · {h.guests} · {x.starOptions[h.stars]}</li>)}
              {r.cars.map((c, i) => <li key={`c${i}`}>🚗 {c.pickup} → {c.dropoff || c.pickup} · {c.pickup_on ? date(c.pickup_on) : ""} – {c.return_on ? date(c.return_on) : ""} · {x.vehicles[c.vehicle]}</li>)}
            </ul>
          )}
          {r.notes && <p className="whitespace-pre-line text-gray-700">{r.notes}</p>}

          {(["option", "document"] as const).map(kind =>
            fileList(kind).length > 0 || procurement ? (
              <div key={kind}>
                <p className="mb-1 text-xs font-black uppercase tracking-widest text-gray-400">{kind === "option" ? x.options : x.documents}</p>
                <ul className="space-y-1">
                  {fileList(kind).map(f => (
                    <li key={f.id}><button type="button" onClick={() => openFile(f)} className="flex items-center gap-1.5 font-bold text-[#00704a] hover:underline"><FileText className="h-4 w-4" /> {f.name || f.path.split("/").pop()}</button></li>
                  ))}
                </ul>
                {procurement && (
                  <label className="mt-1 inline-flex cursor-pointer items-center gap-1.5 text-xs font-bold text-gray-600 hover:text-[#00704a]">
                    {busy === kind ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} {kind === "option" ? x.uploadOption : x.uploadDocument}
                    <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="sr-only" onChange={e => { upload(kind, e.target.files?.[0]); e.target.value = ""; }} />
                  </label>
                )}
              </div>
            ) : null,
          )}

          {events.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-black uppercase tracking-widest text-gray-400">{x.history}</p>
              <ol className="space-y-1.5 border-l-2 border-gray-100 pl-3">
                {events.map(e => (
                  <li key={e.id} className="text-xs text-gray-600">
                    <span className="text-gray-400">{date(e.at)} · {userNames[e.by_user ?? ""] ?? ""}</span>
                    <span className="block text-gray-800">
                      {e.kind === "status"
                        ? fmt(x.statusChange, { from: x.status[e.from_status as TravelStatus] ?? e.from_status ?? "", to: x.status[e.to_status as TravelStatus] ?? e.to_status ?? "" })
                        : <><b>{e.kind === "change" ? x.changeFrom : x.messageFrom}:</b> <span className="whitespace-pre-line">{e.note}</span></>}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {mine && (
            <div className="flex flex-wrap gap-2">
              {r.status === "submitted" && onEdit && (
                <button type="button" onClick={onEdit} className="flex h-9 items-center gap-1.5 rounded-lg border border-gray-300 px-3 font-bold text-gray-700 hover:border-[#009f67]"><Pencil className="h-4 w-4" /> {x.edit}</button>
              )}
              {r.status !== "submitted" && r.status !== "cancelled" && r.status !== "completed" && change === null && (
                <button type="button" onClick={() => setChange("")} className="flex h-9 items-center gap-1.5 rounded-lg border border-gray-300 px-3 font-bold text-gray-700 hover:border-[#009f67]"><MessageSquare className="h-4 w-4" /> {x.requestChange}</button>
              )}
              {canCancel(r.status) && (
                <button type="button" onClick={cancel} disabled={busy === "cancel"} className="flex h-9 items-center gap-1.5 rounded-lg px-3 font-bold text-red-600 hover:bg-red-50"><X className="h-4 w-4" /> {x.cancelRequest}</button>
              )}
            </div>
          )}
          {mine && change !== null && (
            <div className="space-y-2">
              <textarea value={change} onChange={e => setChange(e.target.value)} maxLength={2000} rows={3} placeholder={x.changePlaceholder} className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-[#009f67]" />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setChange(null)} className="h-9 rounded-lg px-3 font-bold text-gray-600">{t.common.cancel}</button>
                <button type="button" onClick={sendChange} disabled={busy === "change" || !change.trim()} className="h-9 rounded-lg bg-[#009f67] px-4 font-bold text-white disabled:opacity-50">{x.sendChange}</button>
              </div>
            </div>
          )}

          {procurement && (
            <div className="grid gap-3 border-t border-gray-100 pt-3 lg:grid-cols-2">
              <div className="space-y-2">
                <label className="block text-xs font-bold text-gray-500">{x.setStatus}
                  <select value={r.status} onChange={e => setStatus(e.target.value as TravelStatus)} disabled={busy === "status"}
                    className="mt-1 h-9 w-full rounded-lg border border-gray-300 bg-white px-2 text-sm">
                    <option value={r.status}>{x.status[r.status]}</option>
                    {NEXT_STATUSES[r.status].map(s => <option key={s} value={s}>{x.status[s]}</option>)}
                  </select>
                </label>
                <label className="block text-xs font-bold text-gray-500">{x.message}
                  <textarea value={message} onChange={e => setMessage(e.target.value)} maxLength={2000} rows={2} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#009f67]" />
                </label>
                <button type="button" onClick={sendMessage} disabled={!message.trim() || busy === "message"} className="h-9 rounded-lg border border-gray-300 px-3 text-sm font-bold text-gray-700 disabled:opacity-50">{x.sendMessage}</button>
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-bold text-gray-500">{x.internalNotes}
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} maxLength={5000} rows={5} className="mt-1 w-full rounded-lg border border-amber-200 bg-amber-50/40 px-3 py-2 text-sm outline-none focus:border-amber-400" />
                </label>
                <button type="button" onClick={saveNotes} disabled={busy === "notes"} className="h-9 rounded-lg border border-gray-300 px-3 text-sm font-bold text-gray-700">{x.saveNotes}</button>
              </div>
            </div>
          )}
          {procurement && r.policy_version && <p className="text-[11px] text-gray-400">{fmt(x.policyAccepted, { n: r.policy_version, date: r.policy_acked_at ? date(r.policy_acked_at) : "" })}</p>}
          {!procurement && r.status === "submitted" && <p className="text-[11px] text-gray-400">{[r.legs.length && plural(x, "legsCount", r.legs.length), r.hotels.length && plural(x, "hotelsCount", r.hotels.length), r.cars.length && plural(x, "carsCount", r.cars.length)].filter(Boolean).join(" · ")}</p>}
        </div>
      )}
    </li>
  );
}
