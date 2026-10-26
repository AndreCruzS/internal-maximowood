"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Check, Copy, Download, ImagePlus, Loader2, Plus, Send, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  HEADER_FIELDS, MAX_LENGTHS, MAX_PROFILES, PROFILE_FIELDS, PROFILE_PRICE_FIELDS, SECTIONS,
  emptyProfile, missingFields, type Checklist, type ChecklistData, type ChecklistProfile, type Field,
} from "@/lib/checklist";
import { downloadChecklistPDF } from "@/lib/generateChecklistPDF";

const GREEN = "#009f67";
type Person = { name: string; email: string | null; logistics: boolean };

const inputCls = "w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 outline-none focus:border-[#009f67] focus:ring-2 focus:ring-[#009f67]/20";
const nowLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

/** Shrinks a photo / drawing to at most 1400px (JPEG), so a checklist stays small. */
async function shrinkImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const s = Math.min(1, 1400 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * s);
    c.height = Math.round(img.height * s);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function FieldInput({ f, values, onChange }: {
  f: Field; values: Record<string, string>; onChange: (key: string, v: string) => void;
}) {
  const v = values[f.key] ?? "";
  const noteKey = `${f.key}Note`;
  const note = f.note ? (
    <input value={values[noteKey] ?? ""} onChange={e => onChange(noteKey, e.target.value)} placeholder={f.note} className={`${inputCls} mt-1.5`} />
  ) : null;
  const pills = (opts: { value: string; label: string }[]) => (
    <div className="flex flex-wrap gap-1.5">
      {opts.map(o => (
        <button key={o.value} type="button" onClick={() => onChange(f.key, v === o.value ? "" : o.value)}
          className={`rounded-full border px-3 py-1 text-xs font-bold transition-colors ${v === o.value ? "border-[#009f67] bg-[#009f67] text-white" : "border-gray-300 bg-white text-gray-600 hover:border-gray-400"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
  let input: React.ReactNode;
  switch (f.kind) {
    case "yesno": input = pills([{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]); break;
    case "choice": input = pills((f.options ?? []).map(o => ({ value: o, label: o }))); break;
    case "textarea": input = <textarea rows={2} value={v} onChange={e => onChange(f.key, e.target.value)} placeholder={f.hint} className={inputCls} />; break;
    case "date": input = <input type="date" value={v} onChange={e => onChange(f.key, e.target.value)} className={`${inputCls} max-w-[12rem]`} />; break;
    case "datetime": input = <input type="datetime-local" value={v} onChange={e => onChange(f.key, e.target.value)} className={`${inputCls} max-w-[15rem]`} />; break;
    case "money": input = (
      <div className="relative max-w-[12rem]">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
        <input inputMode="decimal" value={v} onChange={e => onChange(f.key, e.target.value)} className={`${inputCls} pl-6`} />
      </div>
    ); break;
    case "person": input = <input list="checklist-people" value={v} onChange={e => onChange(f.key, e.target.value)} placeholder={f.hint} className={inputCls} />; break;
    default: input = <input value={v} onChange={e => onChange(f.key, e.target.value)} placeholder={f.hint} className={inputCls} />;
  }
  return (
    <label className="grid gap-1 border-b border-gray-100 py-2.5 sm:grid-cols-[14rem_1fr] sm:gap-4">
      <span className="text-xs font-bold uppercase tracking-wide text-gray-600">
        {f.label}{f.required && <span className="text-red-500"> *</span>}
        {f.hint && (f.kind === "yesno" || f.kind === "choice" || f.kind === "date") && <span className="mt-0.5 block font-normal normal-case tracking-normal text-gray-400">{f.hint}</span>}
      </span>
      <span className="block min-w-0">{input}{note}</span>
    </label>
  );
}

function SectionCard({ number, title, children, right }: { number: string; title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center justify-between gap-3 bg-[#1a1a1a] px-4 py-2.5">
        <h2 className="text-sm font-black uppercase tracking-wide text-white"><span className="mr-2 text-[#f6ca21]">{number}</span>{title}</h2>
        {right}
      </div>
      <div className="px-4 pb-2">{children}</div>
    </section>
  );
}

function ProfileBlock({ p, index, count, onChange, onRemove, onDuplicate }: {
  p: ChecklistProfile; index: number; count: number;
  onChange: (p: ChecklistProfile) => void; onRemove: () => void; onDuplicate: () => void;
}) {
  const set = (key: string, v: string) => onChange({ ...p, fields: { ...p.fields, [key]: v } });
  const fileRef = useRef<HTMLInputElement>(null);
  const lengths = p.lengths.length ? p.lengths : [{ feet: "", qty: "" }];
  const setLength = (i: number, key: "feet" | "qty", v: string) =>
    onChange({ ...p, lengths: lengths.map((l, k) => (k === i ? { ...l, [key]: v.replace(/[^\d.]/g, "").slice(0, 8) } : l)) });
  const totalBoards = lengths.reduce((s, l) => s + (Number(l.qty) || 0), 0);
  const lengthLF = lengths.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.feet) || 0), 0);
  const lf = Number((p.fields.lf ?? "").replace(/,/g, "")) || 0;
  const iconBtn = "inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-bold text-white/80 hover:bg-white/10 hover:text-white";

  return (
    <SectionCard
      number="01"
      title={`Product specifications${count > 1 ? ` — profile ${index + 1} of ${count}` : ""}`}
      right={
        <div className="flex items-center gap-1">
          <button type="button" onClick={onDuplicate} className={iconBtn} title="Duplicate this profile"><Copy className="h-3.5 w-3.5" /> Duplicate</button>
          {count > 1 && <button type="button" onClick={onRemove} className={iconBtn} title="Remove this profile"><Trash2 className="h-3.5 w-3.5" /></button>}
        </div>
      }
    >
      {PROFILE_FIELDS.map(f => <FieldInput key={f.key} f={f} values={p.fields} onChange={set} />)}

      <div className="border-b border-gray-100 py-3">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-xs font-bold uppercase tracking-wide text-gray-600">Feet length (distribution)</span>
          {lengthLF > 0 && (
            <span className={`text-xs font-semibold ${lf && Math.abs(lengthLF - lf) > 0.01 ? "text-amber-600" : "text-gray-500"}`}>
              {totalBoards} boards · {lengthLF.toLocaleString("en-US")} LF{lf ? ` of ${lf.toLocaleString("en-US")} LF` : ""}
              {lf && Math.abs(lengthLF - lf) > 0.01 ? " — doesn't match the linear footage" : ""}
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="text-sm">
            <tbody>
              {(["feet", "qty"] as const).map(key => (
                <tr key={key}>
                  <th className="whitespace-nowrap bg-gray-50 px-3 py-1.5 text-left text-xs font-bold uppercase text-gray-500">{key === "feet" ? "Boards (ft)" : "Quantity"}</th>
                  {lengths.map((l, i) => (
                    <td key={i} className="p-0.5">
                      <input inputMode="decimal" value={l[key]} onChange={e => setLength(i, key, e.target.value)} className={`${inputCls} w-16 text-center`} aria-label={`${key} ${i + 1}`} />
                    </td>
                  ))}
                  {key === "feet" && lengths.length < MAX_LENGTHS && (
                    <td rowSpan={2} className="pl-1 align-middle">
                      <button type="button" onClick={() => onChange({ ...p, lengths: [...lengths, { feet: "", qty: "" }] })}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-dashed border-gray-300 text-gray-500 hover:border-gray-400" aria-label="Add a length">
                        <Plus className="h-4 w-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-1 border-b border-gray-100 py-3 sm:grid-cols-[14rem_1fr] sm:gap-4">
        <span className="text-xs font-bold uppercase tracking-wide text-gray-600">Profile photo & drawing</span>
        <div>
          {p.photo ? (
            <div className="relative inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.photo} alt="Profile photo or drawing" className="max-h-48 rounded-md border border-gray-200" />
              <button type="button" onClick={() => onChange({ ...p, photo: null })} className="absolute right-1 top-1 rounded-full bg-white/90 p-1 text-gray-600 shadow hover:text-red-600" aria-label="Remove photo">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-2 rounded-md border border-dashed border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 hover:border-gray-400">
              <ImagePlus className="h-4 w-4" /> Add photo or drawing
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={async e => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            try { onChange({ ...p, photo: await shrinkImage(file) }); } catch { toast.error("That file couldn't be read as an image."); }
          }} />
        </div>
      </div>

      <div className="pt-3">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Prices for section 02 ($ per LF)</p>
        {PROFILE_PRICE_FIELDS.map(f => <FieldInput key={f.key} f={f} values={p.fields} onChange={set} />)}
      </div>
    </SectionCard>
  );
}

/** One checklist: the form, autosaved, with the PDF for logistics. */
export default function ChecklistEditor({ id }: { id: string }) {
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [data, setData] = useState<ChecklistData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "dirty" | "saving" | "error">("saved");
  const [people, setPeople] = useState<Person[]>([]);
  const [busy, setBusy] = useState<"" | "pdf" | "sent">("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<ChecklistData | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/checklists/${id}`).then(async r => {
      const j = await r.json().catch(() => ({}));
      if (!alive) return;
      if (!r.ok) { setLoadError(j.error || "Couldn't load this checklist."); return; }
      setChecklist(j.checklist);
      setData(j.checklist.data);
    }).catch(() => alive && setLoadError("Couldn't reach the server."));
    fetch("/api/checklists/people").then(r => r.json()).then(j => alive && setPeople(j.people ?? [])).catch(() => {});
    return () => { alive = false; };
  }, [id]);

  const save = useCallback(async (extra: { status?: "sent" | "draft" } = {}) => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const body = { data: latest.current, ...extra };
    setSaveState("saving");
    try {
      const r = await fetch(`/api/checklists/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setSaveState("error"); toast.error(j.error || "Couldn't save the checklist."); return false; }
      setChecklist(j.checklist);
      setSaveState(latest.current === body.data ? "saved" : "dirty");
      return true;
    } catch {
      setSaveState("error");
      return false;
    }
  }, [id]);

  const update = (next: ChecklistData) => {
    setData(next);
    latest.current = next;
    setSaveState("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), 1200);
  };

  // Save before leaving the page.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (saveState === "dirty" || saveState === "saving") e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveState]);

  const missing = useMemo(() => (data ? missingFields(data) : []), [data]);

  if (loadError) return <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{loadError} <Link href="/checklists" className="font-bold underline">Back to checklists</Link></div>;
  if (!data || !checklist) return <div className="flex items-center gap-2 p-10 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading checklist…</div>;

  const setHeader = (key: string, v: string) => update({ ...data, header: { ...data.header, [key]: v } });
  const setSection = (sid: keyof ChecklistData["sections"]) => (key: string, v: string) =>
    update({ ...data, sections: { ...data.sections, [sid]: { ...data.sections[sid], [key]: v } } });
  const setProfiles = (profiles: ChecklistProfile[]) => update({ ...data, profiles });

  const downloadPdf = async () => {
    setBusy("pdf");
    try { await downloadChecklistPDF(data); } catch { toast.error("Couldn't make the PDF."); }
    setBusy("");
  };
  const markSent = async () => {
    setBusy("sent");
    const next = data.sections.handoff.sentToLogistics ? data : { ...data, sections: { ...data.sections, handoff: { ...data.sections.handoff, sentToLogistics: nowLocal() } } };
    setData(next);
    latest.current = next;
    if (await save({ status: "sent" })) toast.success("Marked as sent to logistics. Download the PDF and attach it to your email.");
    setBusy("");
  };

  const status = {
    saved: <span className="inline-flex items-center gap-1 text-xs text-gray-500"><Check className="h-3.5 w-3.5" /> Saved</span>,
    dirty: <span className="text-xs text-gray-400">Unsaved changes…</span>,
    saving: <span className="inline-flex items-center gap-1 text-xs text-gray-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</span>,
    error: <button type="button" onClick={() => void save()} className="text-xs font-bold text-red-600 underline">Not saved — retry</button>,
  }[saveState];

  return (
    <div className="mx-auto max-w-4xl space-y-4 pb-16">
      <datalist id="checklist-people">
        {people.map(p => <option key={`${p.name}-${p.email}`} value={p.name}>{p.logistics ? "Logistics" : p.email ?? ""}</option>)}
      </datalist>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/checklists" className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-gray-900"><ArrowLeft className="h-4 w-4" /> Checklists</Link>
        <div className="flex flex-wrap items-center gap-2">
          {status}
          <button type="button" onClick={() => void downloadPdf()} disabled={busy !== ""}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-bold hover:bg-gray-50 disabled:opacity-50">
            {busy === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} PDF
          </button>
          <button type="button" onClick={() => void markSent()} disabled={busy !== ""}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50" style={{ background: GREEN }}>
            {busy === "sent" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {checklist.status === "sent" ? "Sent to logistics" : "Mark as sent to logistics"}
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between bg-[#1a1a1a] px-4 py-3">
          <span className="text-lg font-black text-white">MAXIMO WOOD</span>
          <span className="text-right leading-tight">
            <span className="block text-[10px] font-black uppercase tracking-wider text-[#f6ca21]">Maximo Concierge</span>
            <span className="block text-sm font-black uppercase text-white">Client approval checklist</span>
          </span>
        </div>
        <div className="h-1.5 bg-[#f6ca21]" />
        <div className="px-4 pb-2">
          {HEADER_FIELDS.map(f => <FieldInput key={f.key} f={f} values={data.header} onChange={setHeader} />)}
        </div>
        {checklist.status === "sent" && checklist.sentAt && (
          <p className="border-t border-gray-100 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800">
            Sent to logistics {new Date(checklist.sentAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}. Changes after that are saved here, so send the new PDF again if something changed.
          </p>
        )}
      </div>

      {missing.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="flex items-center gap-1.5 font-bold"><AlertTriangle className="h-4 w-4" /> Still missing before sending ({missing.length})</p>
          <p className="mt-1 text-xs leading-relaxed">{missing.join(" · ")}</p>
        </div>
      )}

      {data.profiles.map((p, i) => (
        <ProfileBlock
          key={p.id} p={p} index={i} count={data.profiles.length}
          onChange={np => setProfiles(data.profiles.map(x => (x.id === p.id ? np : x)))}
          onRemove={() => setProfiles(data.profiles.filter(x => x.id !== p.id))}
          onDuplicate={() => {
            if (data.profiles.length >= MAX_PROFILES) return;
            const copy = { ...structuredClone(p), id: emptyProfile().id };
            setProfiles([...data.profiles.slice(0, i + 1), copy, ...data.profiles.slice(i + 1)]);
          }}
        />
      ))}
      {data.profiles.length < MAX_PROFILES && (
        <button type="button" onClick={() => setProfiles([...data.profiles, emptyProfile()])}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 py-3 text-sm font-bold text-gray-500 hover:border-gray-400 hover:text-gray-700">
          <Plus className="h-4 w-4" /> Add a profile
        </button>
      )}

      {SECTIONS.map(s => (
        <SectionCard key={s.id} number={s.number} title={s.title}>
          {s.fields.map(f => <FieldInput key={f.key} f={f} values={data.sections[s.id]} onChange={setSection(s.id)} />)}
          {s.id === "order" && <p className="py-2 text-xs text-gray-400">Price to end customer and price to distributor come from each profile&apos;s prices above.</p>}
        </SectionCard>
      ))}

      <div className="rounded-xl bg-black px-4 py-3 text-sm font-black uppercase tracking-wide text-white">Maximo Concierge Team</div>
    </div>
  );
}
