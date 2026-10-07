"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus, RefreshCw, Trash2, KeyRound, Copy, Check, ShieldCheck, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { AdminUser } from "@/app/api/admin/users/route";

const GREEN = "#009f67"; // GMX Forest Green
const DARK = "#1A1A1A";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json as T;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard blocked — user can select manually */
        }
      }}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold border border-gray-300 bg-white hover:bg-gray-50 transition-colors"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/** One-time credential banner shown after create / reset. */
function CredentialCard({
  email,
  password,
  onDismiss,
}: {
  email: string;
  password: string;
  onDismiss: () => void;
}) {
  return (
    <div className="rounded-xl border-2 p-4 shadow-sm" style={{ borderColor: GREEN, background: "#F2FBF7" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5" style={{ color: GREEN }} />
          <p className="text-sm font-bold text-gray-800">
            Login ready — copy the password now, it won&apos;t be shown again
          </p>
        </div>
        <button type="button" onClick={onDismiss} className="text-gray-400 hover:text-gray-700">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-[auto_1fr] sm:items-center text-sm">
        <span className="text-gray-500 font-semibold">Email</span>
        <span className="font-mono text-gray-900">{email}</span>
        <span className="text-gray-500 font-semibold">Password</span>
        <div className="flex items-center gap-2">
          <code className="px-2 py-1 rounded bg-white border border-gray-200 font-mono text-gray-900 select-all">
            {password}
          </code>
          <CopyButton value={password} />
        </div>
      </div>
    </div>
  );
}

export default function AdminUsers() {
  const queryClient = useQueryClient();
  const {
    data: users = [],
    isLoading: loading,
    error: listErrorObj,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api<{ users: AdminUser[] }>("/api/admin/users").then(r => r.users),
    refetchOnWindowFocus: false,
  });
  const listError = listErrorObj instanceof Error ? listErrorObj.message : "";

  const setUsers = (updater: (prev: AdminUser[]) => AdminUser[]) =>
    queryClient.setQueryData<AdminUser[]>(["admin-users"], prev => updater(prev ?? []));

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");
  const [credential, setCredential] = useState<{ email: string; password: string } | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setCredential(null);
    setCreating(true);
    try {
      const { user, password } = await api<{ user: AdminUser; password: string }>("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({ email, name }),
      });
      setCredential({ email: user.email ?? email, password });
      setEmail("");
      setName("");
      setUsers(prev => [user, ...prev.filter(u => u.id !== user.id)]);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Could not create login");
    } finally {
      setCreating(false);
    }
  };

  const resetPassword = async (u: AdminUser) => {
    setBusyId(u.id);
    setRowError(null);
    try {
      const { password } = await api<{ password: string }>(`/api/admin/users/${u.id}`, { method: "PATCH" });
      setCredential({ email: u.email ?? "", password });
    } catch (e) {
      setRowError({ id: u.id, message: e instanceof Error ? e.message : "Could not reset password" });
    } finally {
      setBusyId(null);
    }
  };

  const deleteUser = async (u: AdminUser) => {
    setBusyId(u.id);
    setRowError(null);
    try {
      await api(`/api/admin/users/${u.id}`, { method: "DELETE" });
      setUsers(prev => prev.filter(x => x.id !== u.id));
      setConfirmDeleteId(null);
    } catch (e) {
      setRowError({ id: u.id, message: e instanceof Error ? e.message : "Could not delete login" });
    } finally {
      setBusyId(null);
    }
  };

  const fmtDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-black" style={{ color: DARK }}>
            Team Logins
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Create and manage sign-ins for the GMX Group Intranet · {users.length} {users.length === 1 ? "login" : "logins"}
          </p>
        </div>
        <button
          onClick={() => void refetch()}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white transition-all hover:opacity-90"
          style={{ background: DARK }}
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Create form */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <UserPlus className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-bold text-gray-700">Add a login</span>
        </div>
        <form onSubmit={createUser} className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px] space-y-1.5">
            <label htmlFor="new-email" className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Email
            </label>
            <Input
              id="new-email"
              type="email"
              required
              placeholder="name@gmxgroup.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              disabled={creating}
            />
          </div>
          <div className="flex-1 min-w-[180px] space-y-1.5">
            <label htmlFor="new-name" className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Name <span className="text-gray-300 normal-case">(optional)</span>
            </label>
            <Input
              id="new-name"
              type="text"
              placeholder="Jane Doe"
              value={name}
              onChange={e => setName(e.target.value)}
              disabled={creating}
            />
          </div>
          <button
            type="submit"
            disabled={creating || !email}
            className="h-9 px-5 rounded-md text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-50"
            style={{ background: GREEN }}
          >
            {creating ? "Creating…" : "Create login"}
          </button>
        </form>
        <p className="mt-3 text-xs text-gray-400">
          A temporary password is generated and shown once. Share it with the person; they can keep it or you can reset it later.
        </p>
        {formError && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">{formError}</div>
        )}
      </div>

      {credential && (
        <CredentialCard
          email={credential.email}
          password={credential.password}
          onDismiss={() => setCredential(null)}
        />
      )}

      {/* User list */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {listError && (
          <div className="p-4 bg-red-50 border-b border-red-200 text-sm text-red-700">{listError}</div>
        )}
        {loading && users.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-gray-200 rounded-full animate-spin" style={{ borderTopColor: GREEN }} />
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-14 text-gray-400 text-sm">No logins yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left">
                  <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Email</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Created</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Last sign-in</th>
                  <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u, idx) => (
                  <tr
                    key={u.id}
                    className={`border-b border-gray-50 hover:bg-gray-50/60 transition-colors ${
                      idx === users.length - 1 ? "border-b-0" : ""
                    }`}
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-800">{u.email}</span>
                        {u.isAdmin && (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                            style={{ background: "rgba(0,159,103,0.12)", color: "#00704a" }}
                          >
                            <ShieldCheck className="w-3 h-3" /> ADMIN
                          </span>
                        )}
                      </div>
                      {rowError?.id === u.id && (
                        <p className="mt-1 text-xs text-red-600">{rowError.message}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{u.name || "—"}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(u.createdAt)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(u.lastSignInAt)}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => void resetPassword(u)}
                          disabled={busyId === u.id}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-bold border border-gray-300 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          Reset password
                        </button>
                        {confirmDeleteId === u.id ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => void deleteUser(u)}
                              disabled={busyId === u.id}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-bold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              {busyId === u.id ? "Deleting…" : "Confirm"}
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
                            onClick={() => {
                              setRowError(null);
                              setConfirmDeleteId(u.id);
                            }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-bold border border-red-200 text-red-600 bg-white hover:bg-red-50 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete
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
    </div>
  );
}
