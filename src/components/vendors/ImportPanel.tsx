"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/components/I18nProvider";
import { fmt } from "@/lib/i18n/locale";
import { plural } from "@/lib/i18n/dictionaries";
import { IMPORT_FIELDS, autoMap, parseCsv, rowsToImport, type ColumnMapping, type ImportField } from "@/lib/vendors";
import type { ImportPreviewRow } from "@/server/vendors";
import SanctionsBadge from "@/components/vendors/SanctionsBadge";

const card = "rounded-2xl border border-gray-200 bg-white p-5 shadow-sm";
const field = "h-9 w-full rounded-lg border border-gray-300 bg-white px-2 text-sm outline-none focus:border-[#009f67]";
const MAX_BYTES = 10 * 1024 * 1024;

const STATE_STYLE: Record<ImportPreviewRow["state"], string> = {
  new: "text-[#00704a]",
  existing: "text-gray-500",
  duplicate: "text-gray-500",
  error: "text-red-600",
};

/**
 * Bank / ERP export → Master List. The CSV is read and mapped in the browser, and account / routing
 * numbers are cut to their last 4 digits here, so full numbers never leave this page.
 */
export default function ImportPanel({ companies, sanctionsLoaded }: { companies: { id: string; name: string }[]; sanctionsLoaded: boolean }) {
  const { t } = useI18n();
  const im = t.vendors.import;
  const router = useRouter();
  const [rows, setRows] = useState<string[][] | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [companyIds, setCompanyIds] = useState<string[]>([]);
  const [preview, setPreview] = useState<ImportPreviewRow[] | null>(null);
  const [busy, setBusy] = useState<"preview" | "import" | null>(null);
  const headers = rows?.[0] ?? [];
  const mapped = useMemo(() => (rows ? rowsToImport(rows, mapping) : []), [rows, mapping]);
  const newCount = preview?.filter(p => p.state === "new").length ?? 0;

  const onFile = async (file: File | undefined) => {
    setPreview(null);
    if (!file) return;
    if (file.size > MAX_BYTES) return toast.error(im.readFailed);
    try {
      const parsed = parseCsv(await file.text());
      if (parsed.length < 2) return toast.error(im.readFailed);
      setRows(parsed);
      setMapping(autoMap(parsed[0]));
    } catch {
      toast.error(im.readFailed);
    }
  };

  const send = async (dryRun: boolean) => {
    if (mapping.legal_name === undefined) return toast.error(im.needName);
    setBusy(dryRun ? "preview" : "import");
    const res = await fetch("/api/vendors/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: mapped.filter(r => r.legal_name), companyIds, dryRun }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return toast.error(json.error || "Error");
    if (dryRun) return setPreview(json.preview as ImportPreviewRow[]);
    toast.success(fmt(im.done, { created: json.created, skipped: json.skipped, flagged: json.screening?.flagged ?? 0 }));
    setRows(null);
    setPreview(null);
    router.push("/vendors");
    router.refresh();
  };

  const setField = (f: ImportField, col: string) => {
    setPreview(null);
    setMapping(m => {
      const next = { ...m };
      if (col === "") delete next[f];
      else next[f] = Number(col);
      return next;
    });
  };

  return (
    <section className={`${card} space-y-5`}>
      <div>
        <h2 className="font-black text-gray-900">{im.title}</h2>
        <p className="text-sm text-gray-600">{im.hint}</p>
        {!sanctionsLoaded && <p className="mt-1 text-xs text-amber-700">{im.notLoaded}</p>}
      </div>

      <label className="flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 py-3 text-sm font-bold text-gray-700 hover:border-[#009f67]">
        <FileUp className="h-4 w-4 text-[#009f67]" /> {im.file}
        <input type="file" accept=".csv,text/csv" className="sr-only" onChange={e => void onFile(e.target.files?.[0])} />
      </label>

      {rows && (
        <>
          <div>
            <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">{im.mapping}</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {IMPORT_FIELDS.map(f => (
                <label key={f} className="text-xs font-bold text-gray-500">
                  {im.fields[f]}
                  <select value={mapping[f] ?? ""} onChange={e => setField(f, e.target.value)} className={field}>
                    <option value="">{im.ignore}</option>
                    {headers.map((h, i) => <option key={i} value={i}>{h || `#${i + 1}`}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">{im.companies}</p>
            <div className="flex flex-wrap gap-2">
              {companies.map(c => (
                <label key={c.id} className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={companyIds.includes(c.id)}
                    onChange={e => setCompanyIds(ids => (e.target.checked ? [...ids, c.id] : ids.filter(x => x !== c.id)))}
                    className="accent-[#009f67]"
                  />
                  {c.name}
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => send(true)} disabled={!!busy} className="flex h-9 items-center gap-1.5 rounded-lg border border-[#009f67] px-4 text-sm font-bold text-[#00704a] disabled:opacity-50">
              {busy === "preview" && <Loader2 className="h-4 w-4 animate-spin" />} {im.preview}
            </button>
            {preview && newCount > 0 && (
              <button type="button" onClick={() => send(false)} disabled={!!busy} className="flex h-9 items-center gap-1.5 rounded-lg bg-[#009f67] px-4 text-sm font-bold text-white disabled:opacity-50">
                {busy === "import" && <Loader2 className="h-4 w-4 animate-spin" />} {plural(im, "import", newCount)}
              </button>
            )}
          </div>
        </>
      )}

      {preview && (
        <div className="overflow-x-auto">
          <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">{im.previewTitle}</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-bold uppercase tracking-wider text-gray-500">
                <th className="py-2 pr-3">{im.line}</th>
                <th className="py-2 pr-3">{t.vendors.columns.vendor}</th>
                <th className="py-2 pr-3">{t.vendors.columns.status}</th>
                <th className="py-2">{im.screening}</th>
              </tr>
            </thead>
            <tbody>
              {preview.slice(0, 500).map(p => (
                <tr key={`${p.line}-${p.key}`} className="border-b border-gray-50">
                  <td className="py-1.5 pr-3 text-gray-400">{p.line}</td>
                  <td className="py-1.5 pr-3 font-bold text-gray-900">{p.legal_name}</td>
                  <td className={`py-1.5 pr-3 text-xs font-bold ${STATE_STYLE[p.state]}`}>
                    {p.state === "new" ? im.stateNew : p.state === "existing" ? im.stateExisting : p.state === "duplicate" ? im.stateDuplicate : im.stateError}
                    {p.errors.length > 0 && <span className="font-normal"> ({p.errors.map(e => im.errors[e as keyof typeof im.errors] ?? e).join(", ")})</span>}
                  </td>
                  <td className="py-1.5 text-xs">
                    <SanctionsBadge status={p.screening.result} />
                    {p.screening.top && <span className="ml-1 text-gray-500">{p.screening.top}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
