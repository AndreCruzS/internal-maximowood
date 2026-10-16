"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ExternalLink, History, Pencil, RefreshCw, Send, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";
import { useMe } from "@/components/MeProvider";
import { companyColor, companyInk, companyName, type CompanyId } from "@/lib/intranet";
import { deptName } from "@/lib/i18n/text";
import { plural } from "@/lib/i18n/dictionaries";
import { fmt } from "@/lib/i18n/locale";
import { ackIsCurrent, type Playbook } from "@/lib/playbooks";
import { KIND_ICON } from "@/components/playbooks/PlaybookList";
import PlaybookContent from "@/components/playbooks/PlaybookContent";
import AssignDialog from "@/components/playbooks/AssignDialog";
import { QualityChip, localYmd } from "@/components/playbooks/Quality";

export type Assignment = {
  id: string;
  person_id: string;
  assigned_by_person_id: string | null;
  due_on: string | null;
  note: string;
  created_at: string;
  completed_at: string | null;
};

export const assignmentState = (a: Pick<Assignment, "due_on" | "completed_at">, today: string) =>
  a.completed_at ? "done" : a.due_on && a.due_on < today ? "overdue" : "open";
export const STATE_STYLE = { open: "bg-sky-50 text-sky-800", overdue: "bg-red-50 text-red-700", done: "bg-[#e6f6f0] text-[#00704a]" } as const;

/** One playbook: its content, "I've read it" (versioned), and for its team the score, history and assignments. */
export default function PlaybookDetail({ playbook: p, names, ackCount, myAck, canEdit, canAssign, assignments, myAssignment, people, departments, myPersonId }: {
  playbook: Playbook;
  names: Record<string, string>;
  ackCount: number;
  myAck: { at: string; version: number } | null;
  canEdit: boolean;
  canAssign: boolean;
  assignments: Assignment[];
  myAssignment: Assignment | null;
  people: { id: string; full_name: string }[];
  departments: Record<string, string[]>;
  myPersonId: string | null;
}) {
  const { t, tag } = useI18n();
  const s = t.sop;
  const me = useMe();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const Icon = KIND_ICON[p.kind];
  const color = companyColor(p.company_id);
  const ink = companyInk(p.company_id);
  const date = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString(tag, { month: "short", day: "numeric", year: "numeric" });
  const current = myAck ? ackIsCurrent(myAck.version, p) : false;
  const today = localYmd();

  const ack = async () => {
    const supabase = getSupabase();
    if (!supabase || !me.userId) return;
    setBusy(true);
    let { error } = await supabase.from("playbook_acks")
      .upsert({ playbook_id: p.id, user_id: me.userId, version: p.version ?? 1, acked_at: new Date().toISOString() }, { onConflict: "playbook_id,user_id" });
    // Before migration 0019 there's no version column (and no re-confirming).
    if (error && ["PGRST204", "42703"].includes(error.code ?? "")) ({ error } = await supabase.from("playbook_acks").insert({ playbook_id: p.id, user_id: me.userId }));
    setBusy(false);
    if (error) return toast.error(error.message);
    router.refresh();
  };

  const remove = async () => {
    const supabase = getSupabase();
    if (!supabase || !window.confirm(t.playbooks.deleteConfirm)) return;
    const { error } = await supabase.from("playbooks").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success(t.playbooks.deleted);
    router.push(`/departments/${p.department_id}#playbooks`);
    router.refresh();
  };

  const unassign = async (a: Assignment) => {
    const supabase = getSupabase();
    if (!supabase) return;
    const { error } = await supabase.from("playbook_assignments").delete().eq("id", a.id);
    if (error) return toast.error(error.message);
    router.refresh();
  };

  const showAck = p.ack_required || myAssignment;
  const open = assignments.filter(a => !a.completed_at);

  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <Link href={`/departments/${p.department_id}#playbooks`} className="text-sm font-bold text-[#00704a] hover:underline">
        {fmt(t.playbooks.back, { dept: deptName(t, p.department_id) })}
      </Link>

      {myAssignment && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-bold">
            {myAssignment.assigned_by_person_id ? fmt(s.sentBy, { name: names[myAssignment.assigned_by_person_id] ?? s.unknown }) : s.assignTitle}
            {myAssignment.due_on ? ` · ${fmt(s.dueOn, { date: date(myAssignment.due_on) })}` : ""}
          </p>
          {myAssignment.note && <p className="mt-1 whitespace-pre-line">{myAssignment.note}</p>}
        </div>
      )}

      <header className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm" style={{ borderTop: `5px solid ${color}` }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${color}1a` }}>
              <Icon className="h-4 w-4" style={{ color: ink }} />
            </span>
            <span className="rounded bg-gray-100 px-1.5 py-0.5 uppercase text-gray-600">{t.playbooks.kinds[p.kind]}</span>
            {p.company_id && <span style={{ color: ink }}>{companyName(p.company_id as CompanyId)}</span>}
            {p.category && <span className="text-gray-400">· {p.category}</span>}
            {p.status === "draft" && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">{t.playbooks.draft}</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            {canEdit && <QualityChip p={p} />}
            {canAssign && p.status === "published" && (
              <button type="button" onClick={() => setAssigning(true)} className="flex h-9 items-center gap-1.5 rounded-lg bg-[#009f67] px-3 text-sm font-bold text-white hover:bg-[#00704a]">
                <Send className="h-4 w-4" /> {s.assign}
              </button>
            )}
            {canEdit && (
              <>
                <Link href={`/playbooks/${p.id}/history`} className="flex h-9 items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-sm font-bold text-gray-700 hover:bg-gray-50">
                  <History className="h-4 w-4" /> {s.history}
                </Link>
                <Link href={`/playbooks/${p.id}/edit`} className="flex h-9 items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-sm font-bold text-gray-700 hover:bg-gray-50">
                  <Pencil className="h-4 w-4" /> {t.common.edit}
                </Link>
                <button type="button" onClick={remove} className="flex h-9 items-center rounded-lg px-2 text-red-600 hover:bg-red-50" aria-label={t.common.delete}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        </div>
        <h1 className="mt-3 text-2xl font-black text-gray-900">{p.title}</h1>
        {p.summary && <p className="mt-1 text-gray-600">{p.summary}</p>}
        <p className="mt-3 text-xs text-gray-400">
          {p.owner_person_id && names[p.owner_person_id] && (
            <>
              {t.playbooks.owner}: <Link href={`/people/${p.owner_person_id}`} className="hover:underline">{names[p.owner_person_id]}</Link> ·{" "}
            </>
          )}
          {p.version && p.version > 1 ? `${fmt(s.version, { n: p.version })} · ` : ""}
          {fmt(t.playbooks.updated, { date: date(p.updated_at) })}
          {p.review_by && ` · ${fmt(t.playbooks.reviewBy, { date: date(p.review_by) })}`}
        </p>
        {p.link_url && (
          <a href={p.link_url} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-sm font-bold text-gray-800 hover:border-[#009f67] hover:text-[#00704a]">
            <ExternalLink className="h-4 w-4" /> {t.playbooks.openLink}
          </a>
        )}
      </header>

      <PlaybookContent p={p} names={names} />

      {showAck && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">
            {p.ack_required && <p>{plural(t.playbooks, "ackCount", ackCount)}</p>}
            {myAck && !current && <p className="mt-1 font-bold text-amber-800">{fmt(s.ackAgain, { date: date(myAck.at) })}</p>}
          </div>
          {myAck && current && !myAssignment ? (
            <span className="flex items-center gap-1.5 text-sm font-bold text-[#00704a]"><CheckCircle2 className="h-4 w-4" /> {fmt(t.playbooks.acked, { date: date(myAck.at) })}</span>
          ) : (
            <button type="button" onClick={ack} disabled={busy} className="flex h-10 items-center gap-1.5 rounded-lg bg-[#009f67] px-4 text-sm font-bold text-white disabled:opacity-50">
              {myAck && !current ? <RefreshCw className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />} {p.ack_required ? t.playbooks.readIt : s.markRead}
            </button>
          )}
        </div>
      )}

      {canAssign && assignments.length > 0 && (
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-xs font-black uppercase tracking-widest text-gray-400">{plural(s, "assignedCount", assignments.length)}</h2>
            <Link href={`/playbooks/assignments?dept=${p.department_id}`} className="text-sm font-bold text-[#00704a] hover:underline">{s.assignments} →</Link>
          </div>
          <ul className="divide-y divide-gray-100">
            {assignments.map(a => {
              const st = assignmentState(a, today);
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                  <Link href={`/people/${a.person_id}`} className="min-w-0 flex-1 truncate font-bold text-gray-900 hover:underline">{names[a.person_id] ?? s.unknown}</Link>
                  <span className="text-xs text-gray-500">
                    {a.completed_at ? fmt(s.doneOn, { date: date(a.completed_at) }) : a.due_on ? fmt(s.dueOn, { date: date(a.due_on) }) : s.noDue}
                  </span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATE_STYLE[st]}`}>{s.status[st]}</span>
                  {!a.completed_at && (
                    <button type="button" onClick={() => unassign(a)} aria-label={s.removeAssignment} title={s.removeAssignment} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"><X className="h-4 w-4" /></button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {assigning && (
        <AssignDialog
          playbook={p}
          people={people}
          departments={departments}
          alreadyOpen={open.map(a => a.person_id)}
          myPersonId={myPersonId}
          onClose={() => setAssigning(false)}
        />
      )}
    </article>
  );
}
