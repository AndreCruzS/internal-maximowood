"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Calculator,
  Check,
  Download,
  FileText,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserCircle,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import AdminUsers from "@/components/AdminUsers";
import { deleteQuote, sendJson, useQuotes } from "@/lib/api";
import { generateQuotePDF } from "@/lib/generateQuotePDF";
import { quoteEditHref, toQuoteData, type SavedQuote } from "@/lib/quotes";

const GOLD = "#C9A227";
const DARK = "#1A1A1A";

export type ProfileAccount = {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  lastSignInAt: string | null;
  isAdmin: boolean;
};

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—";

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

const fmtMoney = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function initials(name: string, email: string) {
  const src = name.trim() || email.split("@")[0];
  const parts = src.split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

const sectionLabel = "text-xs font-semibold text-gray-500 uppercase tracking-wider";

// ── Account ──────────────────────────────────────────────────────────────────
function AccountCard({ account }: { account: ProfileAccount }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(account.name);
  const [saving, setSaving] = useState(false);

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await sendJson("/api/profile", "PATCH", { name });
      toast.success("Name updated");
      setEditing(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update your name");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <div className="flex items-start gap-4">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-black shrink-0"
          style={{ background: DARK, color: GOLD }}
          aria-hidden
        >
          {initials(account.name, account.email)}
        </div>
        <div className="flex-1 min-w-0">
          {editing ? (
            <form onSubmit={saveName} className="flex items-center gap-2">
              <Input
                autoFocus
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Your name"
                maxLength={120}
                disabled={saving}
                className="max-w-xs"
              />
              <button
                type="submit"
                disabled={saving}
                className="h-9 px-3 rounded-md text-sm font-bold text-black disabled:opacity-50"
                style={{ background: GOLD }}
                aria-label="Save name"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => {
                  setName(account.name);
                  setEditing(false);
                }}
                className="h-9 px-2 rounded-md text-gray-500 hover:bg-gray-100"
                aria-label="Cancel"
              >
                <X className="w-4 h-4" />
              </button>
            </form>
          ) : (
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-gray-900 truncate">{account.name || "Add your name"}</h2>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-gray-400 hover:text-gray-700"
                aria-label="Edit name"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <span className="text-sm text-gray-600">{account.email}</span>
            <span
              className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={
                account.isAdmin
                  ? { background: "rgba(201,162,39,0.15)", color: "#8a6d1a" }
                  : { background: "#F3F4F6", color: "#6B7280" }
              }
            >
              {account.isAdmin && <ShieldCheck className="w-3 h-3" />}
              {account.isAdmin ? "ADMIN" : "SALES"}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs max-w-sm">
            <span className="text-gray-400">Member since</span>
            <span className="text-gray-700 font-semibold">{fmtDate(account.createdAt)}</span>
            <span className="text-gray-400">Last sign-in</span>
            <span className="text-gray-700 font-semibold">{fmtDate(account.lastSignInAt)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Password ─────────────────────────────────────────────────────────────────
function PasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (next.length < 8) return setError("New password must be at least 8 characters");
    if (next !== confirm) return setError("The new passwords don't match");
    setSaving(true);
    try {
      await sendJson("/api/profile/password", "POST", { currentPassword: current, newPassword: next });
      toast.success("Password changed");
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't change your password");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <KeyRound className="w-4 h-4 text-gray-500" />
        <span className="text-sm font-bold text-gray-700">Change password</span>
      </div>
      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1.5">
          <label htmlFor="pw-current" className={sectionLabel}>Current password</label>
          <Input id="pw-current" type="password" autoComplete="current-password" required value={current} onChange={e => setCurrent(e.target.value)} disabled={saving} />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="pw-new" className={sectionLabel}>New password</label>
            <Input id="pw-new" type="password" autoComplete="new-password" required minLength={8} value={next} onChange={e => setNext(e.target.value)} disabled={saving} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="pw-confirm" className={sectionLabel}>Confirm</label>
            <Input id="pw-confirm" type="password" autoComplete="new-password" required value={confirm} onChange={e => setConfirm(e.target.value)} disabled={saving} />
          </div>
        </div>
        {error && <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">{error}</div>}
        <button
          type="submit"
          disabled={saving || !current || !next || !confirm}
          className="h-9 px-5 rounded-md text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-50"
          style={{ background: DARK }}
        >
          {saving ? "Saving…" : "Update password"}
        </button>
      </form>
    </div>
  );
}

// ── Quotes ───────────────────────────────────────────────────────────────────
function QuotesCard({ account }: { account: ProfileAccount }) {
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
                  className={`px-2.5 py-1 rounded ${scope === s ? "text-black" : "text-gray-500 hover:text-gray-800"}`}
                  style={scope === s ? { background: GOLD } : {}}
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
            href="/"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-sm font-bold text-black whitespace-nowrap hover:opacity-90"
            style={{ background: GOLD }}
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
          <div className="w-8 h-8 border-4 border-gray-200 rounded-full animate-spin" style={{ borderTopColor: GOLD }} />
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
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-bold text-black hover:opacity-90"
                        style={{ background: GOLD }}
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

export type ProfileTab = "profile" | "admin";

export default function Profile({ account, initialTab }: { account: ProfileAccount; initialTab: ProfileTab }) {
  const router = useRouter();
  const pathname = usePathname();
  const [tab, setTab] = useState<ProfileTab>(initialTab);

  // Keep the tab in the URL (?tab=admin) so it survives a refresh and can be linked.
  const selectTab = (next: ProfileTab) => {
    setTab(next);
    router.replace(next === "admin" ? `${pathname}?tab=admin` : pathname, { scroll: false });
  };

  const tabs: { id: ProfileTab; label: string; icon: React.ReactNode }[] = [
    { id: "profile", label: "Profile & quotes", icon: <UserCircle className="w-4 h-4" /> },
    { id: "admin", label: "Admin · Team logins", icon: <Users className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black" style={{ color: DARK, fontFamily: "'Anybody', sans-serif" }}>
            My Profile
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {tab === "admin" ? "Manage who can sign in to the sales calculator" : "Your account and saved quotes"}
          </p>
        </div>

        {account.isAdmin && (
          <div role="tablist" className="inline-flex rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
            {tabs.map(t => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => selectTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-all ${
                  tab === t.id ? "text-black shadow-sm" : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                }`}
                style={tab === t.id ? { background: GOLD } : {}}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {tab === "admin" && account.isAdmin ? (
        <AdminUsers />
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <AccountCard account={account} />
            <PasswordCard />
          </div>

          <QuotesCard account={account} />
        </>
      )}
    </div>
  );
}
