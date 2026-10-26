"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ClipboardCheck, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import type { Checklist } from "@/lib/checklist";

const GREEN = "#009f67";
const fmtDate = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

/** Starts the checklist for an approved quote (or opens the one it already has) and returns its id. */
export async function startChecklist(quoteId?: string): Promise<string> {
  const r = await fetch("/api/checklists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(quoteId ? { quoteId } : {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Couldn't start the checklist.");
  return j.checklist.id as string;
}

/** The rep's checklists (admins: everyone's), with status and a way to start a blank one. */
export default function ChecklistList({ isAdmin, myId }: { isAdmin: boolean; myId: string }) {
  const router = useRouter();
  const [list, setList] = useState<Checklist[] | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/checklists").then(async r => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setError(j.error || "Couldn't load checklists.");
      else setList(j.checklists);
    }).catch(() => setError("Couldn't reach the server."));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (list ?? []).filter(c => !q || [c.title, c.data.header.client, c.owner?.name, c.owner?.email].some(x => (x ?? "").toLowerCase().includes(q)));
  }, [list, search]);

  const newBlank = async () => {
    setCreating(true);
    try { router.push(`/checklists/${await startChecklist()}`); } catch (e) { toast.error((e as Error).message); setCreating(false); }
  };
  const remove = async (id: string) => {
    const r = await fetch(`/api/checklists/${id}`, { method: "DELETE" });
    if (!r.ok) { toast.error("Couldn't delete the checklist."); return; }
    setList(l => (l ?? []).filter(c => c.id !== id));
    setConfirmId(null);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-black text-gray-900"><ClipboardCheck className="h-5 w-5" style={{ color: GREEN }} /> Sales checklists</h1>
          <p className="text-xs text-gray-500">What logistics needs once a customer approves. Start one from a saved quote with <b>Customer approved</b>.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search" className="h-9 w-44 pl-8" />
          </div>
          <button type="button" onClick={() => void newBlank()} disabled={creating}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 text-sm font-bold hover:bg-gray-50 disabled:opacity-50">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Blank checklist
          </button>
        </div>
      </div>

      {error ? (
        <p className="p-6 text-sm text-red-600">{error}</p>
      ) : !list ? (
        <p className="flex items-center gap-2 p-6 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>
      ) : list.length === 0 ? (
        <div className="px-6 py-14 text-center text-sm text-gray-500">
          No checklists yet. Open <Link href="/quotes" className="font-bold underline">Saved quotes</Link> and press <b>Customer approved</b> on a quote.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-bold uppercase tracking-wider text-gray-500">
                <th className="px-5 py-3">Client</th>
                {isAdmin && <th className="px-4 py-3">Salesperson</th>}
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Last updated</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} className="border-b border-gray-50 last:border-b-0 hover:bg-gray-50/60">
                  <td className="px-5 py-3">
                    <Link href={`/checklists/${c.id}`} className="font-semibold text-gray-900 hover:underline">{c.data.header.client || c.title || "Untitled"}</Link>
                    {!c.quoteId && <div className="text-xs text-gray-400">Not from a quote</div>}
                  </td>
                  {isAdmin && <td className={`px-4 py-3 text-gray-600 ${c.ownerId === myId ? "font-semibold" : ""}`}>{c.ownerId === myId ? "You" : c.owner?.name || c.owner?.email || "—"}</td>}
                  <td className="whitespace-nowrap px-4 py-3 text-right font-bold">{c.data.header.totalAmount ? `$${c.data.header.totalAmount}` : "—"}</td>
                  <td className="px-4 py-3">
                    {c.status === "sent"
                      ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">Sent{c.sentAt ? ` ${new Date(c.sentAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : ""}</span>
                      : <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700">Draft</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">{fmtDate(c.updatedAt)}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Link href={`/checklists/${c.id}`} className="rounded-md px-2.5 py-1.5 text-xs font-bold text-white hover:opacity-90" style={{ background: GREEN }}>Open</Link>
                      {confirmId === c.id ? (
                        <>
                          <button type="button" onClick={() => void remove(c.id)} className="rounded-md bg-red-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-red-700">Delete</button>
                          <button type="button" onClick={() => setConfirmId(null)} className="px-2 py-1.5 text-xs font-bold text-gray-500">Cancel</button>
                        </>
                      ) : (
                        <button type="button" onClick={() => setConfirmId(c.id)} aria-label={`Delete checklist for ${c.title}`}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-red-200 bg-white text-red-600 hover:bg-red-50">
                          <Trash2 className="h-3.5 w-3.5" />
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
