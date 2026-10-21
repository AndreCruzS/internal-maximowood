"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Plus, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { isEmail, type HsOwner, type HubSpotSettings } from "@/lib/hubspot";

type AdminData = {
  mode: "live" | "sample";
  emailReady: boolean;
  scopes: string[];
  probes: { area: string; scope: string; ok: boolean; status: number | null }[];
  ownersReadable: boolean;
  settings: HubSpotSettings;
  owners: HsOwner[];
  pipelines: { id: string; label: string; stages: { id: string; label: string }[] }[];
};

const card = "rounded-xl border border-gray-200 bg-white p-5 shadow-sm";

/** Calculator admins: HubSpot connection status, default stage per pipeline, email template and rep → owner mapping. */
export default function HubSpotAdmin() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery<AdminData>({
    queryKey: ["admin-hubspot"],
    queryFn: async () => {
      const res = await fetch("/api/admin/hubspot", { credentials: "include" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
      return json as AdminData;
    },
    refetchOnWindowFocus: false,
  });
  if (isLoading) return <div className={card}><Loader2 className="h-4 w-4 animate-spin" /></div>;
  if (error || !data) return <div className={card}><p className="text-sm text-red-600">{error instanceof Error ? error.message : "Couldn't load HubSpot settings."}</p></div>;
  return <HubSpotAdminForm data={data} onSaved={() => {
    void queryClient.invalidateQueries({ queryKey: ["admin-hubspot"] });
    void queryClient.invalidateQueries({ queryKey: ["hubspot-config"] });
  }} />;
}

function HubSpotAdminForm({ data, onSaved }: { data: AdminData; onSaved: () => void }) {
  const [draft, setDraft] = useState<HubSpotSettings>(data.settings);
  const [rows, setRows] = useState(() => Object.entries(data.settings.ownerOverrides).map(([email, ownerId]) => ({ email, ownerId })));
  const [saving, setSaving] = useState(false);
  const [ccText, setCcText] = useState(data.settings.alwaysCc.join(", "));

  const save = async () => {
    setSaving(true);
    const body: HubSpotSettings = {
      ...draft,
      ownerOverrides: Object.fromEntries(rows.filter(r => r.email.trim() && r.ownerId.trim()).map(r => [r.email.trim().toLowerCase(), r.ownerId.trim()])),
      alwaysCc: ccText.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean),
    };
    const badCc = body.alwaysCc.filter(e => !isEmail(e));
    if (badCc.length) {
      setSaving(false);
      return toast.error(`Not a valid email: ${badCc.join(", ")}`);
    }
    const res = await fetch("/api/admin/hubspot", { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return toast.error(json.error || "Couldn't save");
    toast.success("HubSpot settings saved");
    onSaved();
  };

  return (
    <div className={`${card} mt-6 space-y-5`}>
      <div>
        <h2 className="text-lg font-black text-gray-900">HubSpot</h2>
        <p className="text-sm text-gray-500">Quotes are sent from the rep&apos;s own address and logged on the HubSpot contact, company and deal.</p>
      </div>

      {/* Connection */}
      <div className="space-y-2">
        <p className="text-xs font-black uppercase tracking-widest text-gray-400">Connection</p>
        <p className="text-sm">
          {data.mode === "live" ? "Connected with the private app token." : "Not connected (HUBSPOT_ACCESS_TOKEN isn't set): the quote dialog runs on sample data."}{" "}
          Email: {data.emailReady ? "set up." : "not set up yet (SMTP_USER / SMTP_PASS) — quotes can't be emailed, only saved to HubSpot."}
        </p>
        {data.probes.length > 0 && (
          <ul className="grid gap-1 sm:grid-cols-2">
            {data.probes.map(p => (
              <li key={p.area} className="flex items-center gap-2 text-sm">
                {p.ok ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
                <span className="font-semibold capitalize">{p.area}</span>
                {!p.ok && <span className="text-xs text-red-700">{p.status === 403 ? `missing scope ${p.scope}` : `error ${p.status ?? ""}`}</span>}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-gray-400">Scopes the private app needs: {data.scopes.join(", ")}.</p>
      </div>

      {/* Default stage per pipeline */}
      <div className="space-y-2">
        <p className="text-xs font-black uppercase tracking-widest text-gray-400">Stage for new deals</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {data.pipelines.map(p => (
            <div key={p.id} className="space-y-1">
              <Label htmlFor={`stage-${p.id}`} className="text-xs">{p.label}</Label>
              <select
                id={`stage-${p.id}`}
                value={draft.defaultStages[p.id] ?? ""}
                onChange={e => setDraft({ ...draft, defaultStages: { ...draft.defaultStages, [p.id]: e.target.value } })}
                className="h-9 w-full rounded-md border border-gray-300 bg-white px-2 text-sm"
                disabled={p.stages.length === 0}
              >
                <option value="">First open stage</option>
                {p.stages.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400">Existing deals keep their stage; a quote only updates the amount.</p>
      </div>

      {/* Template */}
      <div className="space-y-2">
        <p className="text-xs font-black uppercase tracking-widest text-gray-400">Email template</p>
        <Input value={draft.template.subject} onChange={e => setDraft({ ...draft, template: { ...draft.template, subject: e.target.value } })} aria-label="Default subject" />
        <Textarea value={draft.template.body} onChange={e => setDraft({ ...draft, template: { ...draft.template, body: e.target.value } })} rows={7} className="text-sm" aria-label="Default message" />
        <p className="text-xs text-gray-400">Placeholders: {"{project}"}, {"{contact}"}, {"{company}"}, {"{rep}"}. Reps edit the message before sending.</p>
      </div>

      {/* Always CC */}
      <div className="space-y-2">
        <p className="text-xs font-black uppercase tracking-widest text-gray-400">Always CC</p>
        <Input
          value={ccText}
          onChange={e => setCcText(e.target.value)}
          placeholder="name@maximowood.com, other@lumberplus.com"
          aria-label="Always CC"
        />
        <p className="text-xs text-gray-400">Copied on every quote email, besides the rep. Separate addresses with commas; leave empty for nobody.</p>
      </div>

      {/* Owners */}
      <div className="space-y-2">
        <p className="text-xs font-black uppercase tracking-widest text-gray-400">Reps in HubSpot</p>
        <p className="text-xs text-gray-500">
          Reps are matched to their HubSpot user by email. Add a row when the calculator login and the HubSpot email differ.
          {!data.ownersReadable && data.mode === "live" && " The token can't read HubSpot users (crm.objects.owners.read), so enter the HubSpot owner id by hand."}
        </p>
        {rows.map((r, i) => (
          <div key={i} className="flex gap-2">
            <Input value={r.email} onChange={e => setRows(rs => rs.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))} placeholder="Calculator login email" aria-label="Calculator login email" />
            {data.owners.length > 0 ? (
              <select
                value={r.ownerId}
                onChange={e => setRows(rs => rs.map((x, j) => (j === i ? { ...x, ownerId: e.target.value } : x)))}
                aria-label="HubSpot user"
                className="h-9 w-full rounded-md border border-gray-300 bg-white px-2 text-sm"
              >
                <option value="">HubSpot user…</option>
                {data.owners.map(o => <option key={o.id} value={o.id}>{o.name || o.email} ({o.email})</option>)}
              </select>
            ) : (
              <Input value={r.ownerId} onChange={e => setRows(rs => rs.map((x, j) => (j === i ? { ...x, ownerId: e.target.value } : x)))} placeholder="HubSpot owner id" aria-label="HubSpot owner id" inputMode="numeric" />
            )}
            <button type="button" onClick={() => setRows(rs => rs.filter((_, j) => j !== i))} aria-label="Remove" className="px-2 text-red-600">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setRows(rs => [...rs, { email: "", ownerId: "" }])} className="inline-flex items-center gap-1 text-sm font-bold text-gray-700">
          <Plus className="h-4 w-4" /> Add a rep
        </button>
      </div>

      <Button onClick={() => void save()} disabled={saving} className="font-bold text-white" style={{ background: "#ff7a59" }}>
        {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save HubSpot settings
      </Button>
    </div>
  );
}
