"use client";

import { useState } from "react";
import { ArrowLeft, ExternalLink, Loader2, Mail, NotebookPen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ccFor, renderTemplate, type HubSpotConfig, type HubSpotQuoteResponse, type QuoteAction } from "@/lib/hubspot";
import { pickEmail, toTarget, type CustomerPick } from "@/components/hubspot/HubSpotCustomer";

/**
 * Last step of "Send to customer" / "Save to HubSpot only": the rep writes the
 * message (to the customer, or a note in HubSpot), ticks the follow-up task, and
 * the server emails the PDF and logs everything in HubSpot.
 */
export default function HubSpotCompose({
  action,
  quoteId,
  projectName,
  companyName,
  contactName,
  address,
  pick,
  config,
  buildPdf,
  onBack,
  onDone,
}: {
  action: QuoteAction;
  quoteId: string;
  projectName: string;
  companyName: string;
  contactName: string;
  address: string;
  pick: CustomerPick;
  config: HubSpotConfig;
  buildPdf: () => Promise<{ blob: Blob; filename: string }>;
  onBack: () => void;
  onDone: (result: HubSpotQuoteResponse) => void;
}) {
  const vars = { project: projectName, contact: contactName.split(" ")[0] ?? "", rep: config.rep.name, company: companyName };
  const send = action === "send";
  const [to, setTo] = useState(pickEmail(pick));
  const [subject, setSubject] = useState(renderTemplate(config.template.subject, vars));
  const [message, setMessage] = useState(send ? renderTemplate(config.template.body, vars) : "");
  const [task, setTask] = useState(send);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<HubSpotQuoteResponse | null>(null);

  const submit = async () => {
    setBusy(true);
    try {
      const pdf = await buildPdf();
      const form = new FormData();
      form.append("pdf", pdf.blob, pdf.filename);
      form.append(
        "payload",
        JSON.stringify({ action, target: toTarget(pick, companyName, address), email: { to, subject, message }, createTask: task }),
      );
      const res = await fetch(`/api/quotes/${quoteId}/hubspot`, { method: "POST", body: form, credentials: "include" });
      const body = (await res.json().catch(() => ({}))) as HubSpotQuoteResponse & { error?: string };
      if (!res.ok && !body.emailStatus) throw new Error(body.error || `Request failed (${res.status})`);
      setResult(body);
      if (body.emailStatus === "failed") toast.error("The email couldn't be sent, so nothing was logged in HubSpot.");
      else if (body.hubspotStatus === "partial" || body.hubspotStatus === "failed") toast.warning(send ? "Email sent, but part of the HubSpot logging failed." : "Part of the HubSpot logging failed.");
      else toast.success(body.mode === "sample" ? "Sample run done — nothing was sent." : send ? "Quote sent and logged in HubSpot" : "Quote saved to HubSpot");
      onDone(body);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <div className="space-y-3">
        <div className={`rounded-lg border p-4 text-sm ${result.errors.length || result.warnings?.length ? "border-amber-300 bg-amber-50" : "border-green-200 bg-green-50"}`}>
          {result.mode === "sample" ? (
            <p className="font-bold text-gray-900">Sample run: this is what would happen once HubSpot is connected.</p>
          ) : (
            <p className="font-bold text-gray-900">{send ? (result.emailStatus === "sent" ? `Sent to ${to}.` : "The email wasn't sent.") : "Saved to HubSpot."}</p>
          )}
          <ul className="mt-2 list-disc pl-5 text-gray-700">
            {send && <li>Email from {config.rep.email} to {to}, CC {ccFor(config.rep.email, config.alwaysCc ?? [], to).join(", ")}, with the PDF attached{result.mode === "sample" ? " (not sent)" : ""}.</li>}
            <li>{send ? "Email" : "Note"} with the PDF logged on the contact, company and deal.</li>
            <li>Deal amount set to the quote total (stage unchanged).</li>
            {task && <li>Follow-up task for you, due in 48 hours.</li>}
          </ul>
          {result.errors.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-amber-900">
              {result.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
          {result.warnings?.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-xs text-amber-800">
              {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          )}
          {result.dealUrl && (
            <a href={result.dealUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 font-bold text-[#c2410c] underline">
              Open the deal in HubSpot <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} disabled={busy} className="flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-gray-900">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to the quote
      </button>
      <div className="flex items-center gap-2">
        {send ? <Mail className="h-5 w-5 text-[#c2410c]" /> : <NotebookPen className="h-5 w-5 text-[#c2410c]" />}
        <h3 className="font-black text-gray-900">{send ? "Send the quote to the customer" : "Save the quote to HubSpot"}</h3>
      </div>
      {config.mode === "sample" && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">HubSpot isn&apos;t connected yet: this is a sample run. Nothing is emailed or saved in HubSpot.</p>
      )}
      {send && config.mode === "live" && !config.emailReady && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">Email isn&apos;t set up yet, so quotes can&apos;t be sent. Use &quot;Save to HubSpot only&quot; for now.</p>
      )}

      {send && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="hs-to">To</Label>
              <Input id="hs-to" type="email" value={to} onChange={e => setTo(e.target.value)} placeholder="customer@company.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hs-cc">CC</Label>
              <Input id="hs-cc" value={ccFor(config.rep.email, config.alwaysCc ?? [], to).join(", ")} readOnly className="bg-gray-50 text-gray-500" />
            </div>
          </div>
          <p className="-mt-2 text-[11px] text-gray-500">From {config.rep.name} &lt;{config.rep.email}&gt;</p>
          <div className="space-y-1.5">
            <Label htmlFor="hs-subject">Subject</Label>
            <Input id="hs-subject" value={subject} onChange={e => setSubject(e.target.value)} />
          </div>
        </>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="hs-message">{send ? "Message to the customer" : "Note in HubSpot (optional)"}</Label>
        <Textarea
          id="hs-message"
          value={message}
          onChange={e => setMessage(e.target.value)}
          rows={send ? 9 : 4}
          className="text-sm"
          placeholder={send ? "Write the email that goes with the quote…" : "Anything your team should know about this quote…"}
        />
        {send && <p className="text-[11px] text-gray-500">The quote PDF is attached.</p>}
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={task} onChange={e => setTask(e.target.checked)} className="accent-[#ff7a59]" />
        Create a follow-up task for me in HubSpot, due in 48 hours
      </label>
      <Button
        onClick={() => void submit()}
        disabled={busy || (send && (!to.trim() || !subject.trim() || !message.trim())) || (send && config.mode === "live" && !config.emailReady)}
        className="w-full gap-2 font-bold text-white"
        style={{ background: "#ff7a59" }}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : send ? <Mail className="h-4 w-4" /> : <NotebookPen className="h-4 w-4" />}
        {send ? "Send to customer" : "Save to HubSpot"}
      </Button>
    </div>
  );
}
