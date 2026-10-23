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
  FILE_KINDS, REQUEST_PAYMENT_METHODS, TAX_ID_TYPES, emptyPayload, filePath, fileProblem, payloadToSend, readPayload, requestProblems,
  type FileKind, type RequestPayload, type VendorRequestRow,
} from "@/lib/vendorRequests";
import type { RequestFile, RequestsContext } from "@/server/vendorRequests";

const card = "rounded-2xl border border-gray-200 bg-white p-5 shadow-sm";
const field = "h-9 w-full rounded-lg border border-gray-300 bg-white px-2.5 text-sm outline-none focus:border-[#009f67]";
const area = "w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm outline-none focus:border-[#009f67]";
const label = "mb-1 block text-xs font-bold text-gray-500";

/**
 * Paulo's "New Vendor Request Form" (sections 1–7) plus country, currency and category. Saved as a
 * draft first (documents attach to the draft), then submitted to the department head. Account and
 * routing numbers are cut to their last 4 digits here, before anything is saved.
 */
export default function VendorRequestForm({ ctx, request, files: initialFiles }: { ctx: RequestsContext; request: VendorRequestRow | null; files: RequestFile[] }) {
  const { t } = useI18n();
  const f = t.vendorRequests.form;
  const router = useRouter();
  const [id, setId] = useState(request?.id ?? null);
  const [p, setP] = useState<RequestPayload>(() => (request ? readPayload(request.payload) : emptyPayload()));
  const [department, setDepartment] = useState<string>(() => request?.department_id ?? ctx.myDepartments[0] ?? (ctx.leadership ? "" : ""));
  const [companies, setCompanies] = useState<string[]>(request?.company_ids ?? []);
  const [purpose, setPurpose] = useState(request?.purpose ?? "");
  const [typed, setTyped] = useState({ account: "", routing: "" });
  const [files, setFiles] = useState<RequestFile[]>(initialFiles);
  const [busy, setBusy] = useState<string | null>(null);

  const deptOptions = useMemo(() => {
    const mine = ctx.departments.filter(d => ctx.myDepartments.includes(d.id));
    return mine.length ? mine : ctx.departments;
  }, [ctx.departments, ctx.myDepartments]);
  const set = <K extends keyof RequestPayload>(k: K, patch: Partial<RequestPayload[K]>) => setP(x => ({ ...x, [k]: { ...x[k], ...patch } }));
  const setVendor = (patch: Partial<RequestPayload["vendor"]>) => set("vendor", patch);
  const hasBankProof = files.some(x => x.kind === "bank_proof");
  const problems = requestProblems({ payload: p, company_ids: companies, department_id: department || null, hasBankProof, leadership: ctx.leadership });

  /** Saves the draft (creating it the first time) and returns its id. Full bank numbers never leave the page. */
  const save = async (quiet = false): Promise<string | null> => {
    const supabase = getSupabase();
    if (!supabase) return null;
    const payload = payloadToSend(p, typed);
    const row = { payload, department_id: department || null, company_ids: companies, purpose: purpose.trim() };
    const res = id
      ? await supabase.from("vendor_requests").update(row).eq("id", id).select("id").single()
      : await supabase.from("vendor_requests").insert({ ...row, kind: "new" }).select("id").single();
    if (res.error) {
      toast.error(res.error.message);
      return null;
    }
    const newId = (res.data as { id: string }).id;
    setP(payload);
    setTyped({ account: "", routing: "" });
    if (!id) {
      setId(newId);
      window.history.replaceState(null, "", `/vendors/request?id=${newId}`);
    }
    if (!quiet) toast.success(f.saved);
    return newId;
  };

  const upload = async (kind: FileKind, file: File) => {
    const problem = fileProblem(file);
    if (problem) return toast.error(problem === "size" ? f.fileSize : problem === "empty" ? f.fileEmpty : f.fileType);
    setBusy(`file-${kind}`);
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
      .insert({ request_id: reqId, kind, path, file_name: file.name.slice(0, 200), mime_type: type, size_bytes: file.size })
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
    if (problems.length) return toast.error(f.problems[problems[0]]);
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

  const input = (key: keyof RequestPayload["vendor"], text: string, opts: { type?: string; full?: boolean } = {}) => (
    <div className={opts.full ? "sm:col-span-2" : ""}>
      <label className={label} htmlFor={`v-${key}`}>{text}</label>
      <input id={`v-${key}`} type={opts.type ?? "text"} value={String(p.vendor[key] ?? "")} onChange={e => setVendor({ [key]: e.target.value } as Partial<RequestPayload["vendor"]>)} className={field} />
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/vendors?tab=requests" className="inline-flex items-center gap-1 text-sm font-bold text-gray-500 hover:text-gray-900">
        <ArrowLeft className="h-4 w-4" /> {t.vendorRequests.detail.back}
      </Link>
      <div>
        <h1 className="text-3xl font-black text-gray-900">{f.title}</h1>
        <p className="mt-1 text-sm text-gray-600">{f.intro}</p>
      </div>

      {/* 1. Requestor */}
      <section className={card}>
        <h2 className="mb-3 font-black text-gray-900">{f.requester}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className={label}>{t.vendorRequests.detail.requestedBy.split("{")[0].trim()}</p>
            <p className="text-sm font-bold text-gray-900">{(ctx.me && ctx.people[ctx.me]) || "—"}</p>
          </div>
          <div>
            <label className={label} htmlFor="r-dept">{f.department}</label>
            <select id="r-dept" value={department} onChange={e => setDepartment(e.target.value)} className={field}>
              {ctx.leadership && <option value="">{f.leadership}</option>}
              {!ctx.leadership && !department && <option value="">—</option>}
              {deptOptions.map(d => <option key={d.id} value={d.id}>{deptName(t, d.id)}</option>)}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="r-title">{f.jobTitle}</label>
            <input id="r-title" value={p.requester.job_title} onChange={e => set("requester", { job_title: e.target.value })} className={field} />
          </div>
          <div>
            <label className={label} htmlFor="r-phone">{f.phone}</label>
            <input id="r-phone" value={p.requester.phone} onChange={e => set("requester", { phone: e.target.value })} className={field} />
          </div>
        </div>
      </section>

      {/* 2. Vendor */}
      <section className={card}>
        <h2 className="mb-3 font-black text-gray-900">{f.vendor}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {input("legal_name", `${f.legalName} *`)}
          {input("dba", f.dba)}
          {input("country", f.country)}
          <div className="grid grid-cols-[1fr_8rem] gap-2">
            <div>
              <label className={label} htmlFor="v-tax">{f.taxId}</label>
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
          {input("registry_url", f.registry, { full: true })}
          <div className="sm:col-span-2">
            <label className={label} htmlFor="v-street">{f.street}</label>
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
              <label className={label} htmlFor={`c-${k}`}>{k === "name" ? f.contactName : k === "email" ? f.contactEmail : f.contactPhone}</label>
              <input id={`c-${k}`} type={k === "email" ? "email" : "text"} value={p.vendor.contact[k]} onChange={e => setVendor({ contact: { ...p.vendor.contact, [k]: e.target.value } })} className={field} />
            </div>
          ))}
          {input("website", f.website)}
        </div>
      </section>

      {/* 3. Bank */}
      <section className={card}>
        <h2 className="mb-1 font-black text-gray-900">{f.bank}</h2>
        <p className="mb-3 flex items-start gap-1.5 text-xs text-gray-500"><Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {f.last4Hint}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="b-name">{f.bankName}</label>
            <input id="b-name" value={p.bank.bank_name} onChange={e => set("bank", { bank_name: e.target.value })} className={field} />
          </div>
          <div>
            <label className={label} htmlFor="b-country">{f.bankCountry}</label>
            <input id="b-country" value={p.bank.bank_country} onChange={e => set("bank", { bank_country: e.target.value })} className={field} />
          </div>
          <div className="sm:col-span-2">
            <label className={label} htmlFor="b-address">{f.bankAddress}</label>
            <input id="b-address" value={p.bank.bank_address} onChange={e => set("bank", { bank_address: e.target.value })} className={field} />
          </div>
          <div className="sm:col-span-2">
            <label className={label} htmlFor="b-holder">{f.holder}</label>
            <input id="b-holder" value={p.bank.holder_name} onChange={e => set("bank", { holder_name: e.target.value })} className={field} />
            <p className="mt-1 text-xs text-gray-400">{f.holderHint}</p>
          </div>
          <div>
            <label className={label} htmlFor="b-account">{f.account}</label>
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
            <input id="b-swift" value={p.bank.swift_bic} onChange={e => set("bank", { swift_bic: e.target.value.toUpperCase() })} className={field} />
          </div>
          <div>
            <label className={label} htmlFor="b-currency">{f.currency}</label>
            <input id="b-currency" value={p.bank.currency} maxLength={3} onChange={e => set("bank", { currency: e.target.value.toUpperCase() })} className={field} />
          </div>
          <div>
            <label className={label} htmlFor="b-method">{f.method}</label>
            <select id="b-method" value={p.bank.payment_method} onChange={e => set("bank", { payment_method: e.target.value })} className={field}>
              <option value="">—</option>
              {REQUEST_PAYMENT_METHODS.map(m => <option key={m} value={m}>{f.methods[m]}</option>)}
            </select>
          </div>
          {p.bank.payment_method === "other" && (
            <div>
              <label className={label} htmlFor="b-other">{f.methodOther}</label>
              <input id="b-other" value={p.bank.payment_method_other} onChange={e => set("bank", { payment_method_other: e.target.value })} className={field} />
            </div>
          )}
        </div>
      </section>

      {/* 4. Details */}
      <section className={card}>
        <h2 className="mb-3 font-black text-gray-900">{f.details}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="d-cat">{f.category}</label>
            <input id="d-cat" list="vendor-categories" value={p.details.category} onChange={e => set("details", { category: e.target.value })} className={field} />
            <datalist id="vendor-categories">{f.categories.map(c => <option key={c} value={c} />)}</datalist>
          </div>
          <div>
            <label className={label} htmlFor="d-spend">{f.annualSpend}</label>
            <input id="d-spend" value={p.details.annual_spend} onChange={e => set("details", { annual_spend: e.target.value })} placeholder="$" className={field} />
          </div>
          <div className="sm:col-span-2">
            <label className={label} htmlFor="d-goods">{f.goods}</label>
            <textarea id="d-goods" rows={2} value={p.details.goods_services} onChange={e => set("details", { goods_services: e.target.value })} className={area} />
          </div>
          <div>
            <label className={label} htmlFor="d-term">{f.contractTerm}</label>
            <input id="d-term" value={p.details.contract_term} onChange={e => set("details", { contract_term: e.target.value })} className={field} />
          </div>
          <div>
            <label className={label} htmlFor="d-pay">{f.paymentTerms}</label>
            <input id="d-pay" value={p.details.payment_terms} onChange={e => set("details", { payment_terms: e.target.value })} className={field} />
          </div>
          <div>
            <p className={label}>{f.is1099}</p>
            <div className="flex gap-3 text-sm">
              {([[true, f.yes], [false, f.no], [null, f.unsure]] as const).map(([v, text]) => (
                <label key={String(v)} className="flex items-center gap-1.5">
                  <input type="radio" name="is1099" checked={p.details.is_1099 === v} onChange={() => set("details", { is_1099: v })} className="accent-[#009f67]" /> {text}
                </label>
              ))}
            </div>
          </div>
          <div className="sm:col-span-2">
            <p className={label}>{f.companies} *</p>
            <div className="flex flex-wrap gap-2">
              {ctx.companies.map(c => (
                <label key={c.id} className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm ${companies.includes(c.id) ? "border-[#009f67] bg-[#f2fbf7]" : "border-gray-200"}`}>
                  <input type="checkbox" checked={companies.includes(c.id)} onChange={e => setCompanies(x => (e.target.checked ? [...x, c.id] : x.filter(y => y !== c.id)))} className="accent-[#009f67]" />
                  {c.name}
                </label>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 5. Justification */}
      <section className={card}>
        <h2 className="mb-3 font-black text-gray-900">{f.justification}</h2>
        <div className="space-y-3">
          {(["reason", "comparison", "benefits"] as const).map(k => (
            <div key={k}>
              <label className={label} htmlFor={`j-${k}`}>{f[k]}</label>
              <textarea id={`j-${k}`} rows={2} value={p.justification[k]} onChange={e => set("justification", { [k]: e.target.value })} className={area} />
            </div>
          ))}
          <div>
            <label className={label} htmlFor="j-purpose">{t.vendorRequests.detail.purpose}</label>
            <input id="j-purpose" value={purpose} onChange={e => setPurpose(e.target.value)} className={field} />
          </div>
        </div>
      </section>

      {/* 6. Documents */}
      <section className={card}>
        <h2 className="mb-1 font-black text-gray-900">{f.documents}</h2>
        <p className="mb-3 text-xs text-gray-500">{f.fileHint}</p>
        <ul className="space-y-2">
          {FILE_KINDS.map(kind => {
            const mine = files.filter(x => x.kind === kind);
            return (
              <li key={kind} className="rounded-xl border border-gray-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-bold text-gray-900">
                    {f.docKinds[kind]} {kind === "bank_proof" && <span className="text-xs font-normal text-red-600">({f.required})</span>}
                  </span>
                  <label className={`flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-bold text-gray-700 hover:bg-gray-50 ${busy ? "pointer-events-none opacity-50" : ""}`}>
                    {busy === `file-${kind}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                    {busy === `file-${kind}` ? f.uploading : f.upload}
                    <input type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void upload(kind, file); }} />
                  </label>
                </div>
                {mine.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {mine.map(x => (
                      <li key={x.id} className="flex items-center gap-2 text-xs text-gray-600">
                        <FileText className="h-3.5 w-3.5 text-gray-400" />
                        <a href={`/api/vendors/files/${x.id}`} target="_blank" rel="noopener noreferrer" className="hover:underline">{x.file_name}</a>
                        <span className="text-gray-400">{Math.ceil(x.size_bytes / 1024)} KB</span>
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

      {/* 7. Compliance */}
      <section className={card}>
        <h2 className="mb-3 font-black text-gray-900">{f.compliance}</h2>
        <div className="space-y-3">
          <div>
            <p className={label}>{f.vetted}</p>
            <div className="flex gap-3 text-sm">
              {([[true, f.yes], [false, f.no]] as const).map(([v, text]) => (
                <label key={String(v)} className="flex items-center gap-1.5">
                  <input type="radio" name="vetted" checked={p.compliance.vetted === v} onChange={() => set("compliance", { vetted: v })} className="accent-[#009f67]" /> {text}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className={label} htmlFor="c-note">{f.vettedNote}</label>
            <textarea id="c-note" rows={2} value={p.compliance.vetted_note} onChange={e => set("compliance", { vetted_note: e.target.value })} className={area} />
          </div>
          <div>
            <label className={label} htmlFor="c-risks">{f.risks}</label>
            <textarea id="c-risks" rows={2} value={p.compliance.risks} onChange={e => set("compliance", { risks: e.target.value })} className={area} />
          </div>
        </div>
      </section>

      {problems.length > 0 && (
        <ul className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {problems.map(x => <li key={x}>• {f.problems[x]}</li>)}
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
