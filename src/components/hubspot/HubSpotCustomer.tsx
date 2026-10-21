"use client";

import { useEffect, useState } from "react";
import { Building2, Loader2, Search, User, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useHubSpotDeals, useHubSpotSearch } from "@/lib/api";
import { contactName, type HsCompany, type HsContact, type HubSpotConfig, type HubSpotTarget } from "@/lib/hubspot";

/** The customer + deal chosen in the quote dialog. */
export type CustomerPick = {
  contact: HsContact | null;
  company: HsCompany | null;
  /** Not in HubSpot: a new contact (and the dialog's company name) are created on send / save. */
  manual: boolean;
  newContact: { firstName: string; lastName: string; email: string; phone: string };
  /** An existing deal id, or "new" for a new deal in `pipelineId`. */
  deal: string | "new" | null;
  pipelineId: string;
};

export const emptyPick = (pipelineId = "908001413"): CustomerPick => ({
  contact: null,
  company: null,
  manual: false,
  newContact: { firstName: "", lastName: "", email: "", phone: "" },
  deal: null,
  pipelineId,
});

/** A pick the dialog restores for a saved quote that's already linked to HubSpot. */
export function pickFromSaved(ids: { contactId: string | null; companyId: string | null; dealId: string | null }, company: string, contact: string): CustomerPick {
  const [firstName, ...rest] = contact.split(" ");
  return {
    ...emptyPick(),
    contact: ids.contactId ? { id: ids.contactId, firstName: firstName ?? "", lastName: rest.join(" "), email: "", phone: "", companyId: ids.companyId, companyName: company, address: "" } : null,
    company: ids.companyId ? { id: ids.companyId, name: company, domain: "", address: "" } : null,
    deal: ids.dealId,
  };
}

/** The request target, using the dialog's company / address for anything new. */
export function toTarget(pick: CustomerPick, companyName: string, address: string): HubSpotTarget {
  const nc = pick.newContact;
  const company = pick.company ?? null;
  return {
    contactId: pick.contact?.id ?? null,
    companyId: company?.id ?? pick.contact?.companyId ?? null,
    dealId: pick.deal && pick.deal !== "new" ? pick.deal : null,
    newContact: !pick.contact && pick.manual && (nc.firstName.trim() || nc.lastName.trim()) ? nc : null,
    newCompany: !company && !pick.contact?.companyId && companyName.trim() ? { name: companyName.trim(), address: address.trim() } : null,
    newDealPipelineId: pick.deal === "new" ? pick.pipelineId : null,
  };
}

/** The email the quote goes to by default. */
export const pickEmail = (pick: CustomerPick) => pick.contact?.email || (pick.manual ? pick.newContact.email : "");

export function pickReady(pick: CustomerPick, companyName: string): string | null {
  if (!pick.contact && !pick.company && !(pick.manual && (pick.newContact.firstName.trim() || pick.newContact.lastName.trim())) && !companyName.trim()) {
    return "Pick the customer in HubSpot (or enter a new one).";
  }
  if (!pick.deal) return "Pick the deal, or \"New deal\".";
  return null;
}

/**
 * HubSpot customer search (contacts + companies) that fills in the dialog's company,
 * contact and address, then the customer's open deals or a new deal in a pipeline.
 */
export default function HubSpotCustomer({
  config,
  pick,
  onChange,
  onAutofill,
}: {
  config: HubSpotConfig;
  pick: CustomerPick;
  onChange: (pick: CustomerPick) => void;
  onAutofill: (v: { company?: string; contact?: string; address?: string }) => void;
}) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);
  const search = useHubSpotSearch(debounced);
  const companyId = pick.company?.id ?? pick.contact?.companyId ?? null;
  const deals = useHubSpotDeals(pick.contact?.id ?? null, companyId);
  const picked = !!(pick.contact || pick.company);

  const chooseContact = (c: HsContact) => {
    onChange({ ...pick, contact: c, company: c.companyId ? { id: c.companyId, name: c.companyName, domain: "", address: c.address } : null, manual: false, deal: null });
    onAutofill({ contact: contactName(c), ...(c.companyName ? { company: c.companyName } : {}), ...(c.address ? { address: c.address } : {}) });
    setQ("");
  };
  const chooseCompany = (c: HsCompany) => {
    onChange({ ...pick, contact: null, company: c, manual: false, deal: null });
    onAutofill({ company: c.name, ...(c.address ? { address: c.address } : {}) });
    setQ("");
  };
  const clear = () => onChange(emptyPick(pick.pipelineId));
  const results = search.data ?? { contacts: [], companies: [] };
  const field = "h-9 w-full rounded-md border border-[#E0DDD4] bg-white px-2.5 text-sm";

  return (
    <div className="rounded-lg border border-[#ff7a59]/40 bg-[#fff8f5] p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-black uppercase tracking-widest text-[#c2410c]">HubSpot customer & deal</p>
        {config.mode === "sample" && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">Sample data</span>}
      </div>

      {picked ? (
        <div className="flex items-start gap-2 rounded-md border border-[#E0DDD4] bg-white px-3 py-2">
          {pick.contact ? <User className="mt-0.5 h-4 w-4 text-[#c2410c]" /> : <Building2 className="mt-0.5 h-4 w-4 text-[#c2410c]" />}
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-bold text-gray-900">{pick.contact ? contactName(pick.contact) : pick.company?.name}</p>
            <p className="text-xs text-gray-500">{[pick.contact?.email, pick.contact?.companyName || (pick.contact ? "" : pick.company?.domain)].filter(Boolean).join(" · ")}</p>
          </div>
          <button type="button" onClick={clear} aria-label="Change customer" className="text-gray-400 hover:text-gray-700">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : pick.manual ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input className={field} placeholder="First name" aria-label="Contact first name" value={pick.newContact.firstName} onChange={e => onChange({ ...pick, newContact: { ...pick.newContact, firstName: e.target.value } })} />
            <input className={field} placeholder="Last name" aria-label="Contact last name" value={pick.newContact.lastName} onChange={e => onChange({ ...pick, newContact: { ...pick.newContact, lastName: e.target.value } })} />
            <input className={field} placeholder="Email" type="email" aria-label="Contact email" value={pick.newContact.email} onChange={e => onChange({ ...pick, newContact: { ...pick.newContact, email: e.target.value } })} />
            <input className={field} placeholder="Phone" aria-label="Contact phone" value={pick.newContact.phone} onChange={e => onChange({ ...pick, newContact: { ...pick.newContact, phone: e.target.value } })} />
          </div>
          <p className="text-[11px] text-gray-500">A new contact (and the company below, if it&apos;s new) is created in HubSpot when you send or save.</p>
          <button type="button" onClick={() => onChange({ ...pick, manual: false })} className="text-xs font-bold text-[#c2410c] underline">Search HubSpot instead</button>
        </div>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search contacts or companies…" className="pl-8" aria-label="Search HubSpot" />
          {search.isFetching && <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-gray-400" />}
          {debounced.trim().length >= 2 && !search.isFetching && (
            <div className="mt-1 max-h-60 overflow-y-auto rounded-md border border-[#E0DDD4] bg-white shadow-sm">
              {search.isError && <p className="px-3 py-2 text-xs text-red-600">HubSpot search failed. Try again, or enter the customer by hand.</p>}
              {results.contacts.map(c => (
                <button key={c.id} type="button" onClick={() => chooseContact(c)} className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-[#fff1eb]">
                  <User className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <span className="text-sm"><span className="font-semibold text-gray-900">{contactName(c)}</span><span className="block text-xs text-gray-500">{[c.email, c.companyName].filter(Boolean).join(" · ")}</span></span>
                </button>
              ))}
              {results.companies.map(c => (
                <button key={c.id} type="button" onClick={() => chooseCompany(c)} className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-[#fff1eb]">
                  <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <span className="text-sm"><span className="font-semibold text-gray-900">{c.name}</span><span className="block text-xs text-gray-500">{c.domain}</span></span>
                </button>
              ))}
              {!search.isError && results.contacts.length + results.companies.length === 0 && <p className="px-3 py-2 text-xs text-gray-500">No match in HubSpot.</p>}
            </div>
          )}
          <button type="button" onClick={() => onChange({ ...pick, manual: true, deal: pick.deal ?? "new" })} className="mt-1.5 text-xs font-bold text-[#c2410c] underline">
            Not in HubSpot? Enter a new customer
          </button>
        </div>
      )}

      {(picked || pick.manual) && (
        <div className="space-y-1.5">
          <Label className="text-xs">Deal</Label>
          {deals.isLoading && <p className="text-xs text-gray-500"><Loader2 className="mr-1 inline h-3 w-3 animate-spin" />Loading deals…</p>}
          {deals.isError && <p className="text-xs text-red-600">Couldn&apos;t load this customer&apos;s deals.</p>}
          <div className="space-y-1">
            {(deals.data?.deals ?? []).map(d => (
              <label key={d.id} className={`flex cursor-pointer items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm ${pick.deal === d.id ? "border-[#ff7a59]" : "border-[#E0DDD4]"}`}>
                <input type="radio" name="hs-deal" checked={pick.deal === d.id} onChange={() => onChange({ ...pick, deal: d.id })} className="accent-[#ff7a59]" />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-gray-900">{d.name}</span>
                  <span className="block text-xs text-gray-500">{d.pipelineLabel} · {d.stageLabel}{d.amount != null ? ` · $${d.amount.toLocaleString("en-US")}` : ""}</span>
                </span>
              </label>
            ))}
            <label className={`flex cursor-pointer flex-wrap items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm ${pick.deal === "new" ? "border-[#ff7a59]" : "border-[#E0DDD4]"}`}>
              <input type="radio" name="hs-deal" checked={pick.deal === "new"} onChange={() => onChange({ ...pick, deal: "new" })} className="accent-[#ff7a59]" />
              <span className="font-semibold text-gray-900">New deal in</span>
              <select
                value={pick.pipelineId}
                onChange={e => onChange({ ...pick, deal: "new", pipelineId: e.target.value })}
                aria-label="Pipeline for the new deal"
                className="h-8 rounded-md border border-[#E0DDD4] bg-white px-2 text-sm"
              >
                {config.pipelines.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </label>
          </div>
          <p className="text-[11px] text-gray-500">The deal&apos;s amount becomes this quote&apos;s total. Its stage isn&apos;t changed.</p>
        </div>
      )}
    </div>
  );
}
