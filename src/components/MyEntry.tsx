"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { COMPANIES, DEPARTMENTS } from "@/lib/intranet";
import type { Person, Position } from "@/components/PeopleView";

type Draft = { id?: string; title: string; department_id: string; team: string; reports_to: string };

const field = "h-9 w-full rounded-lg border border-gray-300 bg-white px-2.5 text-sm outline-none focus:border-[#009f67]";
const label = "mb-1 block text-xs font-bold text-gray-500";

/**
 * The signed-in person's own entry. First visit: claim their name from the
 * org chart (or add themselves). After that: keep contact details and
 * positions (title, department, team, manager) up to date — the org chart
 * is built from these.
 */
export default function MyEntry({ mine, people, positions }: {
  mine: Person | null;
  people: Person[];
  positions: Position[];
}) {
  const router = useRouter();
  const supabase = getSupabase();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  // ── First visit: claim ────────────────────────────────────────────────────
  const unclaimed = people.filter(p => !p.user_id);
  const [pick, setPick] = useState("");
  const [newName, setNewName] = useState("");

  const run = async (fn: () => Promise<{ error: { message: string } | null }>, ok: string) => {
    if (!supabase) return;
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success(ok);
      router.refresh();
    }
  };

  // ── Edit ──────────────────────────────────────────────────────────────────
  const myPositions = useMemo(() => (mine ? positions.filter(p => p.person_id === mine.id) : []), [mine, positions]);
  const [details, setDetails] = useState({
    full_name: mine?.full_name ?? "",
    phone: mine?.phone ?? "",
    location: mine?.location ?? "",
    company_id: mine?.company_id ?? "",
  });
  const [drafts, setDrafts] = useState<Draft[]>(
    myPositions.map(p => ({ id: p.id, title: p.title, department_id: p.department_id ?? "", team: p.team ?? "", reports_to: p.reports_to ?? "" })),
  );
  const managerOptions = useMemo(() => {
    const byId = new Map(people.map(p => [p.id, p.full_name]));
    return positions
      .filter(p => p.person_id !== mine?.id)
      .map(p => ({ id: p.id, label: `${byId.get(p.person_id) ?? "?"} — ${p.title}` }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [people, positions, mine]);

  if (!mine) {
    return (
      <section className="rounded-xl border-2 border-[#009f67] bg-[#f2fbf7] p-5">
        <h2 className="flex items-center gap-2 font-black text-gray-900">
          <UserCheck className="h-5 w-5 text-[#00704a]" /> Add yourself to the org chart
        </h2>
        <p className="mt-1 text-sm text-gray-600">Find your name below — then fill in your position and contact details.</p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-64 flex-1">
            <label className={label} htmlFor="claim">I&apos;m already listed</label>
            <select id="claim" value={pick} onChange={e => setPick(e.target.value)} className={field}>
              <option value="">Choose your name…</option>
              {unclaimed.map(p => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            disabled={!pick || busy}
            onClick={() => run(async () => supabase!.rpc("claim_person", { target: pick }), "You're linked to your org chart entry")}
            className="h-9 rounded-lg bg-[#009f67] px-4 text-sm font-bold text-white disabled:opacity-50"
          >
            That&apos;s me
          </button>
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-[#cdeee0] pt-4">
          <div className="min-w-64 flex-1">
            <label className={label} htmlFor="newname">I&apos;m not listed</label>
            <input id="newname" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Your full name" className={field} />
          </div>
          <button
            type="button"
            disabled={!newName.trim() || busy}
            onClick={() => run(async () => supabase!.rpc("create_my_person", { name: newName }), "Added — now fill in your position")}
            className="h-9 rounded-lg border border-[#009f67] bg-white px-4 text-sm font-bold text-[#00704a] disabled:opacity-50"
          >
            Add me
          </button>
        </div>
      </section>
    );
  }

  const save = async () => {
    if (!supabase) return;
    if (drafts.some(d => !d.title.trim())) return toast.error("Every position needs a title.");
    setBusy(true);
    const fail = (m: string) => {
      setBusy(false);
      toast.error(m);
    };
    const { error: e1 } = await supabase
      .from("people")
      .update({
        full_name: details.full_name.trim() || mine.full_name,
        phone: details.phone.trim() || null,
        location: details.location.trim() || null,
        company_id: details.company_id || null,
      })
      .eq("id", mine.id);
    if (e1) return fail(e1.message);

    const keep = new Set(drafts.filter(d => d.id).map(d => d.id));
    const removed = myPositions.filter(p => !keep.has(p.id)).map(p => p.id);
    if (removed.length) {
      const { error } = await supabase.from("positions").delete().in("id", removed);
      if (error) return fail(error.message);
    }
    for (const [i, d] of drafts.entries()) {
      const row = {
        person_id: mine.id,
        title: d.title.trim(),
        department_id: d.department_id || null,
        team: d.team.trim() || null,
        reports_to: d.reports_to || null,
        sort: myPositions.find(p => p.id === d.id)?.sort ?? 1000 + i,
      };
      const { error } = d.id
        ? await supabase.from("positions").update(row).eq("id", d.id)
        : await supabase.from("positions").insert(row);
      if (error) return fail(error.message);
    }
    setBusy(false);
    setOpen(false);
    toast.success("Your entry is updated");
    router.refresh();
  };

  const setDraft = (i: number, patch: Partial<Draft>) => setDrafts(ds => ds.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-black text-gray-900">Your entry</h2>
          <p className="text-sm text-gray-500">
            {myPositions.length ? myPositions.map(p => p.title).join(" · ") : "Add your position so you appear in the org chart."}
          </p>
        </div>
        {!open && (
          <button type="button" onClick={() => setOpen(true)} className="h-9 rounded-lg border border-gray-300 px-4 text-sm font-bold text-gray-800 hover:bg-gray-50">
            Edit my position &amp; contact
          </button>
        )}
      </div>

      {open && (
        <div className="mt-4 space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className={label} htmlFor="me-name">Full name</label>
              <input id="me-name" value={details.full_name} onChange={e => setDetails(d => ({ ...d, full_name: e.target.value }))} className={field} />
            </div>
            <div>
              <label className={label} htmlFor="me-phone">Phone / WhatsApp</label>
              <input id="me-phone" value={details.phone} onChange={e => setDetails(d => ({ ...d, phone: e.target.value }))} placeholder="+1 305 555 0100" className={field} />
            </div>
            <div>
              <label className={label} htmlFor="me-loc">Location</label>
              <input id="me-loc" value={details.location} onChange={e => setDetails(d => ({ ...d, location: e.target.value }))} placeholder="Curitiba, Brazil" className={field} />
            </div>
            <div>
              <label className={label} htmlFor="me-co">Company</label>
              <select id="me-co" value={details.company_id} onChange={e => setDetails(d => ({ ...d, company_id: e.target.value }))} className={field}>
                <option value="">—</option>
                {COMPANIES.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="-mt-3 text-xs text-gray-400">Email: {mine.email ?? "—"} (from your login)</p>

          <div className="space-y-3">
            <p className="text-xs font-black uppercase tracking-widest text-gray-400">Positions</p>
            {drafts.map((d, i) => (
              <div key={d.id ?? `new-${i}`} className="grid items-end gap-3 rounded-lg border border-gray-200 p-3 sm:grid-cols-2 lg:grid-cols-[2fr_1.5fr_1fr_2fr_auto]">
                <div>
                  <label className={label}>Title</label>
                  <input value={d.title} onChange={e => setDraft(i, { title: e.target.value })} placeholder="e.g. Coordenadora de Vendas" className={field} />
                </div>
                <div>
                  <label className={label}>Department</label>
                  <select value={d.department_id} onChange={e => setDraft(i, { department_id: e.target.value })} className={field}>
                    <option value="">Leadership</option>
                    {DEPARTMENTS.map(x => (
                      <option key={x.id} value={x.id}>{x.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={label}>Team</label>
                  <input value={d.team} onChange={e => setDraft(i, { team: e.target.value })} placeholder="e.g. Comex" className={field} />
                </div>
                <div>
                  <label className={label}>Reports to</label>
                  <select value={d.reports_to} onChange={e => setDraft(i, { reports_to: e.target.value })} className={field}>
                    <option value="">No one (top of the chart)</option>
                    {managerOptions.map(m => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                </div>
                <button type="button" onClick={() => setDrafts(ds => ds.filter((_, j) => j !== i))} className="h-9 rounded-lg px-2 text-red-600 hover:bg-red-50" aria-label="Remove position">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setDrafts(ds => [...ds, { title: "", department_id: "", team: "", reports_to: "" }])}
              className="flex items-center gap-1.5 text-sm font-bold text-[#00704a] hover:underline"
            >
              <Plus className="h-4 w-4" /> Add a position
            </button>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="h-9 rounded-lg border border-gray-300 px-4 text-sm font-bold text-gray-700">
              Cancel
            </button>
            <button type="button" onClick={save} disabled={busy} className="flex h-9 items-center gap-2 rounded-lg bg-[#009f67] px-4 text-sm font-bold text-white disabled:opacity-50">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
