"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQuote } from "@/lib/api";
import type { SavedQuote } from "@/lib/quotes";

/**
 * Tracks which saved quote a calculator is editing.
 *
 * `quoteId` comes from `?quote=<id>` (the Profile page links there). When it
 * loads, `onLoad` runs once so the calculator can fill its cart. After a save,
 * `markSaved` records the quote and puts its id in the URL so a refresh keeps
 * editing the same quote; `detach` goes back to an unsaved, new quote.
 */
export function useSavedQuote(quoteId: string | null, onLoad: (quote: SavedQuote) => void) {
  const router = useRouter();
  const pathname = usePathname();
  const { data, error, isLoading } = useQuote(quoteId);

  const [savedQuote, setSavedQuote] = useState<SavedQuote | null>(null);
  const [loadedId, setLoadedId] = useState<string | null>(null);

  // Adjust-state-during-render: hydrate the cart the first time a quote arrives.
  if (data && data.id === quoteId && loadedId !== data.id) {
    setLoadedId(data.id);
    setSavedQuote(data);
    onLoad(data);
  }

  const markSaved = (quote: SavedQuote) => {
    setLoadedId(quote.id);
    setSavedQuote(quote);
    if (quote.id !== quoteId) router.replace(`${pathname}?quote=${quote.id}`, { scroll: false });
  };

  const detach = () => {
    setLoadedId(null);
    setSavedQuote(null);
    if (quoteId) router.replace(pathname, { scroll: false });
  };

  return {
    savedQuote,
    markSaved,
    detach,
    loading: !!quoteId && isLoading,
    loadError: quoteId && error ? "That quote couldn't be opened — it may have been deleted." : "",
  };
}
