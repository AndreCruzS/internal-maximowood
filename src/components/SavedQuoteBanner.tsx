"use client";

import Link from "next/link";
import { FilePen, FilePlus2, Loader2, AlertTriangle } from "lucide-react";
import type { SavedQuote } from "@/lib/quotes";

const GOLD = "#C9A227";

/** Shown above the cart while a calculator is editing a saved quote. */
export default function SavedQuoteBanner({
  savedQuote,
  loading,
  loadError,
  onStartNew,
}: {
  savedQuote: SavedQuote | null;
  loading: boolean;
  loadError: string;
  onStartNew: () => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-xs font-semibold text-gray-500">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading saved quote…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-800">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <div className="flex-1">
          <p className="font-semibold">{loadError}</p>
          <button type="button" onClick={onStartNew} className="mt-1 font-bold underline">
            Start a new quote
          </button>
        </div>
      </div>
    );
  }

  if (!savedQuote) return null;

  return (
    <div className="rounded-xl border-2 bg-white px-4 py-3" style={{ borderColor: GOLD, background: "#FFFDF5" }}>
      <div className="flex items-start gap-2">
        <FilePen className="w-4 h-4 shrink-0 mt-0.5" style={{ color: GOLD }} />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-[#8a6d1a]">Editing saved quote</p>
          <p className="text-sm font-black text-[#1A1A1A] truncate">{savedQuote.projectName}</p>
          {savedQuote.owner && (
            <p className="text-xs font-semibold text-[#8a6d1a]">
              Created by {savedQuote.owner.name || savedQuote.owner.email} — your changes update their quote.
            </p>
          )}
          <p className="text-xs text-gray-500">
            Add or remove items, then use <span className="font-semibold">Update quote</span> to save the changes.
          </p>
          <div className="mt-2 flex items-center gap-3 text-xs font-bold">
            <button type="button" onClick={onStartNew} className="inline-flex items-center gap-1 text-gray-600 hover:text-black">
              <FilePlus2 className="w-3.5 h-3.5" /> Start new quote
            </button>
            <Link href="/profile" className="text-gray-600 hover:text-black underline">
              My quotes
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
