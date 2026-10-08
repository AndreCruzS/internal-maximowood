"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Check,
  KeyRound,
  Loader2,
  Pencil,
  ShieldCheck,
  UserCircle,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import AdminUsers from "@/components/AdminUsers";
import AboutMeCard, { type MyPerson } from "@/components/AboutMeCard";
import { sendJson } from "@/lib/api";

const GREEN = "#009f67"; // GMX Forest Green
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
          style={{ background: GREEN, color: "#fff" }}
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
                className="h-9 px-3 rounded-md text-sm font-bold text-white disabled:opacity-50"
                style={{ background: GREEN }}
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
                  ? { background: "rgba(0,159,103,0.12)", color: "#00704a" }
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
export type ProfileTab = "profile" | "admin";

export default function Profile({ account, initialTab, person }: { account: ProfileAccount; initialTab: ProfileTab; person: MyPerson | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const [tab, setTab] = useState<ProfileTab>(initialTab);

  // Keep the tab in the URL (?tab=admin) so it survives a refresh and can be linked.
  const selectTab = (next: ProfileTab) => {
    setTab(next);
    router.replace(next === "admin" ? `${pathname}?tab=admin` : pathname, { scroll: false });
  };

  const tabs: { id: ProfileTab; label: string; icon: React.ReactNode }[] = [
    { id: "profile", label: "My profile", icon: <UserCircle className="w-4 h-4" /> },
    { id: "admin", label: "Admin · Team logins", icon: <Users className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black" style={{ color: DARK }}>
            My Profile
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {tab === "admin" ? "Manage who can sign in to the GMX Group Intranet" : "Your account and how colleagues see you"}
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
                  tab === t.id ? "text-white shadow-sm" : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                }`}
                style={tab === t.id ? { background: GREEN } : {}}
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

          <AboutMeCard person={person} />
        </>
      )}
    </div>
  );
}
