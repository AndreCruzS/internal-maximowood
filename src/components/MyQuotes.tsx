"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Calculator,
  Download,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import type { ProfileAccount } from "@/components/Profile";
import { deleteQuote, useQuotes } from "@/lib/api";
import { generateQuotePDF } from "@/lib/generateQuotePDF";
import { quoteEditHref, toQuoteData, type SavedQuote } from "@/lib/quotes";

const GREEN = "#009f67"; // GMX Forest Green


const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

const fmtMoney = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;



// ── Account ──────────────────────────────────────────────────────────────────
/** The signed-in user's saved quotes (admins: everyone's), with reopen / download / delete. */
export default function MyQuotes({ account }: { account: ProfileAccount }) {
  const queryClient = useQueryClient();
  const { data: allQuotes = [], isLoading, error } = useQuotes();
  const [search, setSearch] = useState("");
  // Admins get every salesperson's quotes from the API; salespeople only their own.
  const seesOthers = account.isAdmin && allQuotes.some(q => q.ownerId !== account.id);
  const [scope, setScope] = useState<"all" | "mine">("all");
  const showAll = seesOthers && scope === "all";
  const quotes = useMemo(
    () => (showAll ? allQuotes : allQuotes.filter(q => q.ownerId === account.id)),
    [allQuotes, showAll, account.id],
  );
  const ownerLabel = (q: SavedQuote) =>
    q.ownerId === account.id ? "You" : q.owner?.name || q.owner?.email || "Unknown user";
  const [busyId, setBusyId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return quotes;
    return quotes.filter(x =>
      [x.projectName, x.company, x.contact, x.address, x.owner?.name ?? "", x.owner?.email ?? ""].some(f =>
        f.toLowerCase().includes(q),
      ),
    );
  }, [quotes, search]);

  const download = async (q: SavedQuote) => {
    setDownloadingId(q.id);
    try {
      await generateQuotePDF(toQuoteData(q));
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate the PDF. Please try again.");
    } finally {
      setDownloadingId(null);
    }
  };

  const remove = async (q: SavedQuote) => {
    setBusyId(q.id);
    try {
      await deleteQuote(q.id);
      queryClient.setQueryData<SavedQuote[]>(["quotes"], prev => (prev ?? []).filter(x => x.id !== q.id));
      toast.success(`Deleted "${q.projectName}"`);
      setConfirmDeleteId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete the quote");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-3 flex-wrap px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-bold text-gray-700">{showAll ? "All quotes" : "My quotes"}</span>
          <span className="text-xs text-gray-400">· {quotes.length}</span>
          {seesOthers && (
            <div className="ml-2 inline-flex rounded-md border border-gray-200 p-0.5 text-xs font-bold">
              {(["all", "mine"] as const).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScope(s)}
                  className={`px-2.5 py-1 rounded ${scope === s ? "text-white" : "text-gray-500 hover:text-gray-800"}`}
                  style={scope === s ? { background: GREEN } : {}}
                >
                  {s === "all" ? "Everyone" : "Mine"}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-1 sm:flex-none justify-end">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={showAll ? "Search project, customer, salesperson…" : "Search project, company, contact…"}
              className="pl-8"
              aria-label="Search quotes"
            />
          </div>
          <Link
            href="/calculator"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-sm font-bold text-white whitespace-nowrap hover:opacity-90"
            style={{ background: GREEN }}
          >
            <Plus className="w-4 h-4" /> New quote
          </Link>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border-b border-red-200 text-sm text-red-700">
          {error instanceof Error ? error.message : "Couldn't load your quotes"}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-4 border-gray-200 rounded-full animate-spin" style={{ borderTopColor: GREEN }} />
        </div>
      ) : quotes.length === 0 ? (
        <div className="text-center py-14 px-6">
          <p className="text-sm font-semibold text-gray-600">No saved quotes yet</p>
          <p className="text-xs text-gray-400 mt-1">
            Build a quote in the calculator and press <span className="font-semibold">Save Quote</span> — it&apos;s saved under the project name.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-14 text-gray-400 text-sm">No quotes match &ldquo;{search}&rdquo;.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left">
                <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Project</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Customer</th>
                {showAll && (
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Salesperson</th>
                )}
                <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Total</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Last updated</th>
                <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(q => (
                <tr key={q.id} className="border-b border-gray-50 last:border-b-0 hover:bg-gray-50/60 transition-colors">
                  <td className="px-5 py-3">
                    <Link href={quoteEditHref(q)} className="font-semibold text-gray-900 hover:underline">
                      {q.projectName}
                    </Link>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-400">
                      {q.calculator === "b2b" ? <Building2 className="w-3 h-3" /> : <Calculator className="w-3 h-3" />}
                      {q.calculator === "b2b" ? "B2B" : "Calculator"} · {q.items.length} {q.items.length === 1 ? "item" : "items"}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    <div>{q.company || "—"}</div>
                    {q.contact && <div className="text-xs text-gray-400">{q.contact}</div>}
                  </td>
                  {showAll && (
                    <td className="px-4 py-3 text-gray-600">
                      <div className={q.ownerId === account.id ? "font-semibold" : ""}>{ownerLabel(q)}</div>
                      {q.ownerId !== account.id && q.owner?.name && q.owner.email && (
                        <div className="text-xs text-gray-400">{q.owner.email}</div>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3 text-right font-bold text-gray-900 whitespace-nowrap">{fmtMoney(q.total)}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{fmtDateTime(q.updatedAt)}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={quoteEditHref(q)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-bold text-white hover:opacity-90"
                        style={{ background: GREEN }}
                      >
                        <Pencil className="w-3.5 h-3.5" /> Edit
                      </Link>
                      <button
                        type="button"
                        onClick={() => void download(q)}
                        disabled={downloadingId === q.id}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-bold border border-gray-300 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50"
                      >
                        {downloadingId === q.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Download className="w-3.5 h-3.5" />
                        )}
                        PDF
                      </button>
                      {confirmDeleteId === q.id ? (
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => void remove(q)}
                            disabled={busyId === q.id}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-bold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            {busyId === q.id ? "Deleting…" : "Confirm"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2 py-1.5 rounded-md text-xs font-bold text-gray-500 hover:bg-gray-100"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(q.id)}
                          className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-red-200 text-red-600 bg-white hover:bg-red-50 transition-colors"
                          aria-label={`Delete ${q.projectName}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

