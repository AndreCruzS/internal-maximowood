"use client";

import { ExternalLink, Mail, NotebookPen } from "lucide-react";
import { useHubSpotConfig } from "@/lib/api";
import { hubspotRecordUrl } from "@/lib/hubspot";
import type { SavedQuote } from "@/lib/quotes";

/** In My Quotes: when the quote was last sent / saved to HubSpot, and a link to its deal. */
export default function QuoteHubSpotBadge({ quote }: { quote: SavedQuote }) {
  const { data: config } = useHubSpotConfig(!!quote.hubspot);
  const hs = quote.hubspot;
  if (!hs?.lastSentAt) return null;
  const url = hubspotRecordUrl(config?.portalId ?? null, "deal", hs.dealId) ?? hubspotRecordUrl(config?.portalId ?? null, "contact", hs.contactId);
  const when = new Date(hs.lastSentAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return (
    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-[#c2410c]">
      {hs.lastAction === "send" ? <Mail className="h-3 w-3" /> : <NotebookPen className="h-3 w-3" />}
      <span>{hs.lastAction === "send" ? `Sent ${when}${hs.lastSentTo ? ` to ${hs.lastSentTo}` : ""}` : `In HubSpot ${when}`}</span>
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-bold underline">
          HubSpot <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}
