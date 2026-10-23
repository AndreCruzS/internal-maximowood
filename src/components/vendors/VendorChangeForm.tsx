"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileText, Loader2, Lock, Paperclip, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";
import { fmt } from "@/lib/i18n/locale";
import { deptName } from "@/lib/i18n/text";
import {
  REQUEST_PAYMENT_METHODS, TAX_ID_TYPES, emptyPayload, filePath, fileProblem, payloadToSend, readPayload,
  type FileKind, type RequestPayload, type VendorRequestRow,
} from "@/lib/vendorRequests";
import { CHANGE_FIELDS, PRIVATE_FIELDS, buildDiff, changeProblems, fieldText, type ChangeField, type VendorSnapshot } from "@/lib/vendorChanges";
import type { RequestFile, RequestsContext } from "@/server/vendorRequests";
import type { VendorPublic } from "@/lib/vendors";

const card = "rounded-2xl border border-gray-200 bg-white p-5 shadow-sm";
const field = "h-9 w-full rounded-lg border border-gray-300 bg-white px-2.5 text-sm outline-none focus:border-[#009f67]";
const area = "w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm outline-none focus:border-[#009f67]";
const label = "mb-1 block text-xs font-bold text-gray-500";
const DOC_KINDS: FileKind[] = ["bank_proof", "tax_form", "registry", "other"];

export type ChangeKind = "change_bank" | "change_details";

/**
 * A change to an approved vendor: new bank details (last 4 only + a new bank proof) or new details.
 * Only the fields that differ from the vendor as it is now are sent (payload.changed); approvers see
 * old → new. Same flow as a new vendor: department head → OFAC → approval → Payments.
 */
export default function VendorChangeForm({ ctx, vendor, current, kind, request, files: initialFiles }: {
  ctx: RequestsContext;
  vendor: VendorPublic;
  /** The vendor's current details (vendor staff only); null when the viewer can't see them. */
  current: VendorSnapshot | null;
  kind: ChangeKind;
  request: VendorRequestRow | null;
  files: RequestFile[];
}) {
  const { t } = useI18n();
  const c = t.vendorRequests.change;
  const f = t.vendorRequests.form;
  const router = useRouter();
  const staffView = !!current;

  /** The vendor as it is now: public fields for everyone, private ones only when we can see them. */
  const baseline: VendorSnapshot = useMemo(() => ({
    legal_name: vendor.legal_name, dba: vendor.dba, country: vendor.country, category: vendor.category, companies: vendor.company_ids,
    ...(current ?? {}),
  }), [vendor, current]);

  const initial = (): RequestPayload => {
    if (request) return readPayload(request.payload);
    const p = emptyPayload();
    p.vendor.legal_name = baseline.legal_name ?? "";
    p.vendor.dba = baseline.dba ?? "";
    p.vendor.country = baseline.country ?? "";
    p.details.category = baseline.category ?? "";
    if (current) {
      p.vendor.tax_id = current.tax_id ?? "";
      p.vendor.tax_id_type = current.tax_id_type ?? "";
      p.vendor.address = { ...p.vendor.address, ...(current.address ?? {}) };
      p.vendor.contact = { ...p.vendor.contact, ...(current.contact ?? {}) };
      p.vendor.website = current.website ?? "";
    }
    return p;
  };
  const [id, setId] = useState(request?.id ?? null);
  const [p, setP] = useState<RequestPayload>(initial);
  const [companies, setCompanies] = useState<string[]>(request?.company_ids?.length ? request.company_ids : vendor.company_ids);
  const [department, setDepartment] = useState<string>(() => request?.department_id ?? ctx.myDepartments[0] ?? "");
  const [purpose, setPurpose] = useState(request?.purpose ?? "");
  const [typed, setTyped] = useState({ account: "", routing: "" });
  const [files, setFiles] = useState<RequestFile[]>(initialFiles);
  const [busy, setBusy] = useState<string | null>(null);

  const deptOptions = useMemo(() => {
    const mine = ctx.departments.filter(d => ctx.myDepartments.includes(d.id));
    return mine.length ? mine : ctx.departments;
  }, [ctx.departments, ctx.myDepartments]);
  const companyName = (cid: string) => ctx.companies.find(x => x.id === cid)?.name ?? cid;
  const setVendor = (patch: Partial<RequestPayload["vendor"]>) => setP(x => ({ ...x, vendor: { ...x.vendor, ...patch } }));
  const setBank = (patch: Partial<RequestPayload["bank"]>) => setP(x => ({ ...x, bank: { ...x.bank, ...patch } }));

  /** Fields that now differ from the vendor (private ones the viewer can't see count as changed once filled in). */
  const changed: ChangeField[] = kind === "change_bank" ? [] : CHANGE_FIELDS.filter(fl => {
    const after = fieldText(fl, { vendor: p.vendor, category: p.details.category, companies, taxIdType: p.vendor.tax_id_type });
    if (!staffView && PRIVATE_FIELDS.includes(fl)) return after !== "";
    const before = fieldText(fl, { vendor: baseline as Partial<RequestPayload["vendor"]>, category: baseline.category ?? "", companies: baseline.companies ?? [], taxIdType: baseline.tax_id_type });
    return before !== after;
  });
  const withChanged: RequestPayload = { ...p, changed };
  const diff = kind === "change_details" ? buildDiff(staffView ? baseline : { ...baseline, tax_id: "", address: {}, contact: {}, website: "" }, withChanged, companies, companyName) : [];
  const hasBankProof = files.some(x => x.kind === "bank_proof");
  const bankPreview = payloadToSend(p, typed);
  const problems = changeProblems(kind, { payload: bankPreview, purpose, hasBankProof, diff });

  const save = async (quiet = false): Promise<string | null> => {
    const supabase = getSupabase();
    if (!supabase) return null;
    // Full bank numbers never leave the page: only their last 4.
    const payload = kind === "change_bank" ? { ...payloadToSend(p, typed), changed: [] } : withChanged;
    const row = {
      payload, department_id: department || null, purpose: purpose.trim(),
      company_ids: kind === "change_details" && changed.includes("companies") ? companies : [],
    };
    const res = id
      ? await supabase.from("vendor_requests").update(row).eq("id", id).select("id").single()
      : await supabase.from("vendor_requests").insert({ ...row, kind, vendor_id: vendor.id }).select("id").single();
    if (res.error) {
      toast.error(res.error.message);
      return null;
    }
    const newId = (res.data as { id: string }).id;
    setP(payload);
    setTyped({ account: "", routing: "" });
    if (!id) {
      setId(newId);
      window.history.replaceState(null, "", `/vendors/change?id=${newId}`);
    }
    if (!quiet) toast.success(f.saved);
    return newId;
  };

  const upload = async (fileKind: FileKind, file: File) => {
    const problem = fileProblem(file);
    if (problem) return toast.error(problem === "size" ? f.fileSize : problem === "empty" ? f.fileEmpty : f.fileType);
    setBusy(`file-${fileKind}`);
    const reqId = id ?? (await save(true));
    const supabase = getSupabase();
    const { data: auth } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
    if (!reqId || !supabase || !auth.user) return setBusy(null);
    const type = file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : file.name.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg");
    const path = filePath(auth.user.id, reqId, file.name, crypto.randomUUID().slice(0, 8));
    const up = await supabase.storage.from("vendors").upload(path, file, { contentType: type, upsert: false });
    if (up.error) {
      setBusy(null);
      return toast.error(up.error.message);
    }
    const { data, error } = await supabase
      .from("vendor_files")
      .insert({ request_id: reqId, kind: fileKind, path, file_name: file.name.slice(0, 200), mime_type: type, size_bytes: file.size })
      .select("id, kind, file_name, mime_type, size_bytes, created_at")
      .single();
    setBusy(null);
    if (error) {
      await supabase.storage.from("vendors").remove([path]);
      return toast.error(error.message);
    }
    setFiles(x => [...x, data as RequestFile]);
  };

  const removeFile = async (file: RequestFile) => {
    const supabase = getSupabase();
    if (!supabase) return;
    setBusy(`rm-${file.id}`);
    const { data: row } = await supabase.from("vendor_files").select("path").eq("id", file.id).maybeSingle();
    const { error } = await supabase.from("vendor_files").delete().eq("id", file.id);
    if (!error && row) await supabase.storage.from("vendors").remove([(row as { path: string }).path]);
    setBusy(null);
    if (error) return toast.error(error.message);
    setFiles(x => x.filter(y => y.id !== file.id));
  };

  const submit = async () => {
    if (problems.length) return toast.error(c.problems[problems[0]]);
    setBusy("submit");
    const reqId = await save(true);
    if (!reqId) return setBusy(null);
    const res = await fetch(`/api/vendors/requests/${reqId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "submit" }) });
    const json = (await res.json().catch(() => ({}))) as { error?: string; warning?: string | null };
    setBusy(null);
    if (!res.ok) return toast.error(json.error ?? "Error");
    toast.success(f.submitted);
    if (json.warning) toast.warning(fmt(t.vendorRequests.detail.warningScreening, { reason: json.warning }));
    router.push(`/vendors/requests/${reqId}`);
  };

  const mark = (fl: ChangeField) => (changed.includes(fl) ? <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-bold uppercase text-amber-800">{c.changed}</span> : null);
  const vInput = (key: "legal_name" | "dba" | "country" | "website", text: string) => (
    <div>
      <label className={label} htmlFor={`v-${key}`}>{text}{mark(key)}</label>
      <input id={`v-${key}`} value={p.vendor[key]} onChange={e => setVendor({ [key]: e.target.value })} className={field} />
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href={`/vendors/${vendor.id}`} className="inline-flex items-center gap-1 text-sm font-bold text-gray-500 hover:text-gray-900">
        <ArrowLeft className="h-4 w-4" /> {t.vendorRequests.openVendor}
      </Link>
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-gray-400">{c.vendor}: {vendor.legal_name}</p>
        <h1 className="text-3xl font-black text-gray-900">{kind === "change_bank" ? c.titleBank : c.titleDetails}</h1>
        <p className="mt-1 text-sm text-gray-600">{kind === "change_bank" ? c.introBank : c.introDetails}</p>
      </div>

      <section className={card}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="c-dept">{f.department}</label>
            <select id="c-dept" value={department} onChange={e => setDepartment(e.target.value)} className={field}>
              {ctx.leadership && <option value="">{f.leadership}</option>}
              {!ctx.leadership && !department && <option value="">—</option>}
              {deptOptions.map(d => <option key={d.id} value={d.id}>{deptName(t, d.id)}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={label} htmlFor="c-reason">{c.reason} *</label>
            <textarea id="c-reason" rows={2} value={purpose} onChange={e => setPurpose(e.target.value)} className={area} />
          </div>
        </div>
      </section>

      {kind === "change_details" ? (
        <section className={card}>
          <h2 className="font-black text-gray-900">{c.fields}</h2>
          <p className="mb-3 text-xs text-gray-500">{c.unchanged}</p>
          {!staffView && <p className="mb-3 flex items-start gap-1.5 text-xs text-gray-500"><Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {c.privateHint}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            {vInput("legal_name", f.legalName)}
            {vInput("dba", f.dba)}
            {vInput("country", f.country)}
            <div className="grid grid-cols-[1fr_8rem] gap-2">
              <div>
                <label className={label} htmlFor="v-tax">{f.taxId}{mark("tax_id")}</label>
                <input id="v-tax" value={p.vendor.tax_id} onChange={e => setVendor({ tax_id: e.target.value })} className={field} />
              </div>
              <div>
                <label className={label} htmlFor="v-taxtype">{f.taxIdType}</label>
                <select id="v-taxtype" value={p.vendor.tax_id_type} onChange={e => setVendor({ tax_id_type: e.target.value })} className={field}>
                  <option value="">—</option>
                  {TAX_ID_TYPES.map(x => <option key={x} value={x}>{f.taxIdTypes[x]}</option>)}
                </select>
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className={label} htmlFor="v-street">{f.street}{mark("address")}</label>
              <input id="v-street" value={p.vendor.address.line1} onChange={e => setVendor({ address: { ...p.vendor.address, line1: e.target.value } })} className={field} />
            </div>
            <div className="grid grid-cols-3 gap-2 sm:col-span-2">
              {(["city", "state", "postal_code"] as const).map(k => (
                <div key={k}>
                  <label className={label} htmlFor={`v-${k}`}>{k === "city" ? f.city : k === "state" ? f.state : f.postal}</label>
                  <input id={`v-${k}`} value={p.vendor.address[k]} onChange={e => setVendor({ address: { ...p.vendor.address, [k]: e.target.value } })} className={field} />
                </div>
              ))}
            </div>
            {(["name", "email", "phone"] as const).map(k => (
              <div key={k}>
                <label className={label} htmlFor={`c-${k}`}>{k === "name" ? f.contactName : k === "email" ? f.contactEmail : f.contactPhone}{k === "name" && mark("contact")}</label>
                <input id={`c-${k}`} type={k === "email" ? "email" : "text"} value={p.vendor.contact[k]} onChange={e => setVendor({ contact: { ...p.vendor.contact, [k]: e.target.value } })} className={field} />
              </div>
            ))}
            {vInput("website", f.website)}
            <div>
              <label className={label} htmlFor="d-cat">{f.category}{mark("category")}</label>
              <input id="d-cat" list="vendor-categories" value={p.details.category} onChange={e => setP(x => ({ ...x, details: { ...x.details, category: e.target.value } }))} className={field} />
              <datalist id="vendor-categories">{f.categories.map(x => <option key={x} value={x} />)}</datalist>
            </div>
            <div className="sm:col-span-2">
              <p className={label}>{f.companies}{mark("companies")}</p>
              <div className="flex flex-wrap gap-2">
                {ctx.companies.map(co => (
                  <label key={co.id} className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm ${companies.includes(co.id) ? "border-[#009f67] bg-[#f2fbf7]" : "border-gray-200"}`}>
                    <input type="checkbox" checked={companies.includes(co.id)} onChange={e => setCompanies(x => (e.target.checked ? [...x, co.id] : x.filter(y => y !== co.id)))} className="accent-[#009f67]" />
                    {co.name}
                  </label>
                ))}
              </div>
            </div>
          </div>
          {diff.length > 0 && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
              <p className="mb-1 font-bold text-amber-900">{t.vendorRequests.diff.title}</p>
              <ul className="space-y-1">
                {diff.map(d => (
                  <li key={d.field} className="text-amber-900">
                    <b>{c.fieldNames[d.field]}:</b> <span className="line-through opacity-70">{d.before || t.vendorRequests.diff.empty}</span> → {d.after || t.vendorRequests.diff.empty}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      ) : (
        <section className={card}>
          <h2 className="mb-1 font-black text-gray-900">{c.newBank}</h2>
          <p className="mb-3 flex items-start gap-1.5 text-xs text-gray-500"><Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {f.last4Hint}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor="b-name">{f.bankName} *</label>
              <input id="b-name" value={p.bank.bank_name} onChange={e => setBank({ bank_name: e.target.value })} className={field} />
            </div>
            <div>
              <label className={label} htmlFor="b-country">{f.bankCountry}</label>
              <input id="b-country" value={p.bank.bank_country} onChange={e => setBank({ bank_country: e.target.value })} className={field} />
            </div>
            <div className="sm:col-span-2">
              <label className={label} htmlFor="b-holder">{f.holder}</label>
              <input id="b-holder" value={p.bank.holder_name} onChange={e => setBank({ holder_name: e.target.value })} className={field} />
              <p className="mt-1 text-xs text-gray-400">{f.holderHint}</p>
            </div>
            <div>
              <label className={label} htmlFor="b-account">{f.account} *</label>
              <input id="b-account" value={typed.account} onChange={e => setTyped(x => ({ ...x, account: e.target.value }))} autoComplete="off" inputMode="numeric"
                placeholder={p.bank.account_last4 ? fmt(f.savedLast4, { n: p.bank.account_last4 }) : ""} className={field} />
            </div>
            <div>
              <label className={label} htmlFor="b-routing">{f.routing}</label>
              <input id="b-routing" value={typed.routing} onChange={e => setTyped(x => ({ ...x, routing: e.target.value }))} autoComplete="off"
                placeholder={p.bank.routing_last4 ? fmt(f.savedLast4, { n: p.bank.routing_last4 }) : ""} className={field} />
            </div>
            <div>
              <label className={label} htmlFor="b-swift">{f.swift}</label>
              <input id="b-swift" value={p.bank.swift_bic} onChange={e => setBank({ swift_bic: e.target.value.toUpperCase() })} className={field} />
            </div>
            <div>
              <label className={label} htmlFor="b-currency">{f.currency}</label>
              <input id="b-currency" value={p.bank.currency} maxLength={3} onChange={e => setBank({ currency: e.target.value.toUpperCase() })} className={field} />
            </div>
            <div>
              <label className={label} htmlFor="b-method">{f.method}</label>
              <select id="b-method" value={p.bank.payment_method} onChange={e => setBank({ payment_method: e.target.value })} className={field}>
                <option value="">—</option>
                {REQUEST_PAYMENT_METHODS.map(m => <option key={m} value={m}>{f.methods[m]}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={label} htmlFor="b-address">{f.bankAddress}</label>
              <input id="b-address" value={p.bank.bank_address} onChange={e => setBank({ bank_address: e.target.value })} className={field} />
            </div>
          </div>
          <p className="mt-3 text-xs text-gray-500">{t.vendorRequests.diff.bankNote}</p>
        </section>
      )}

      <section className={card}>
        <h2 className="mb-1 font-black text-gray-900">{f.documents}</h2>
        <p className="mb-3 text-xs text-gray-500">{f.fileHint}</p>
        <ul className="space-y-2">
          {DOC_KINDS.map(dk => {
            const mine = files.filter(x => x.kind === dk);
            return (
              <li key={dk} className="rounded-xl border border-gray-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-bold text-gray-900">
                    {dk === "bank_proof" && kind === "change_bank" ? c.bankProof : f.docKinds[dk]}
                    {dk === "bank_proof" && kind === "change_bank" && <span className="ml-1 text-xs font-normal text-red-600">({f.required})</span>}
                  </span>
                  <label className={`flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-bold text-gray-700 hover:bg-gray-50 ${busy ? "pointer-events-none opacity-50" : ""}`}>
                    {busy === `file-${dk}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                    {busy === `file-${dk}` ? f.uploading : f.upload}
                    <input type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void upload(dk, file); }} />
                  </label>
                </div>
                {mine.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {mine.map(x => (
                      <li key={x.id} className="flex items-center gap-2 text-xs text-gray-600">
                        <FileText className="h-3.5 w-3.5 text-gray-400" />
                        <a href={`/api/vendors/files/${x.id}`} target="_blank" rel="noopener noreferrer" className="hover:underline">{x.file_name}</a>
                        <button type="button" onClick={() => removeFile(x)} disabled={!!busy} className="ml-auto text-gray-400 hover:text-red-600" aria-label={f.remove} title={f.remove}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {problems.length > 0 && (
        <ul className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {problems.map(x => <li key={x}>• {c.problems[x]}</li>)}
        </ul>
      )}
      <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-gray-200 bg-[#f7f8f7]/95 py-3 backdrop-blur">
        <button type="button" onClick={() => void save()} disabled={!!busy} className="h-10 rounded-lg border border-gray-300 bg-white px-4 text-sm font-bold text-gray-700 disabled:opacity-50">
          {f.saveDraft}
        </button>
        <button type="button" onClick={submit} disabled={!!busy || problems.length > 0} className="flex h-10 items-center gap-1.5 rounded-lg bg-[#009f67] px-4 text-sm font-bold text-white disabled:opacity-50">
          {busy === "submit" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {f.submit}
        </button>
      </div>
    </div>
  );
}
