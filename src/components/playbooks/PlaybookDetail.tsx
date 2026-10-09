"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ExternalLink, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";
import { useMe } from "@/components/MeProvider";
import { companyColor, companyName, type CompanyId } from "@/lib/intranet";
import { deptName } from "@/lib/i18n/text";
import { plural } from "@/lib/i18n/dictionaries";
import { fmt } from "@/lib/i18n/locale";
import type { Playbook } from "@/lib/playbooks";
import { KIND_ICON } from "@/components/playbooks/PlaybookList";
import { useSignedUrls } from "@/components/playbooks/useSignedUrls";

/** One playbook: intro text, numbered steps, linked document, and "I've read it" when required. */
export default function PlaybookDetail({ playbook: p, ownerName, ackCount, myAck, canEdit }: {
  playbook: Playbook;
  ownerName: string | null;
  ackCount: number;
  myAck: string | null;
  canEdit: boolean;
}) {
  const { t, tag } = useI18n();
  const me = useMe();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const urls = useSignedUrls(p.steps.flatMap(s => s.images ?? []));
  const Icon = KIND_ICON[p.kind];
  const color = companyColor(p.company_id);
  const date = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString(tag, { month: "short", day: "numeric", year: "numeric" });

  const ack = async () => {
    const supabase = getSupabase();
    if (!supabase || !me.userId) return;
    setBusy(true);
    const { error } = await supabase.from("playbook_acks").insert({ playbook_id: p.id, user_id: me.userId });
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

  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <Link href={`/departments/${p.department_id}#playbooks`} className="text-sm font-bold text-[#00704a] hover:underline">
        {fmt(t.playbooks.back, { dept: deptName(t, p.department_id) })}
      </Link>

      <header className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm" style={{ borderTop: `5px solid ${color}` }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-bold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${color}1a` }}>
              <Icon className="h-4 w-4" style={{ color }} />
            </span>
            <span className="rounded bg-gray-100 px-1.5 py-0.5 uppercase text-gray-600">{t.playbooks.kinds[p.kind]}</span>
            {p.company_id && <span style={{ color }}>{companyName(p.company_id as CompanyId)}</span>}
            {p.category && <span className="text-gray-400">· {p.category}</span>}
            {p.status === "draft" && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">{t.playbooks.draft}</span>}
          </div>
          {canEdit && (
            <div className="flex gap-2">
              <Link href={`/playbooks/${p.id}/edit`} className="flex h-9 items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-sm font-bold text-gray-700 hover:bg-gray-50">
                <Pencil className="h-4 w-4" /> {t.common.edit}
              </Link>
              <button type="button" onClick={remove} className="flex h-9 items-center rounded-lg px-2 text-red-600 hover:bg-red-50" aria-label={t.common.delete}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
        <h1 className="mt-3 text-2xl font-black text-gray-900">{p.title}</h1>
        {p.summary && <p className="mt-1 text-gray-600">{p.summary}</p>}
        <p className="mt-3 text-xs text-gray-400">
          {ownerName && `${t.playbooks.owner}: ${ownerName} · `}
          {fmt(t.playbooks.updated, { date: date(p.updated_at) })}
          {p.review_by && ` · ${fmt(t.playbooks.reviewBy, { date: date(p.review_by) })}`}
        </p>
        {p.link_url && (
          <a href={p.link_url} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-sm font-bold text-gray-800 hover:border-[#009f67] hover:text-[#00704a]">
            <ExternalLink className="h-4 w-4" /> {t.playbooks.openLink}
          </a>
        )}
      </header>

      {p.body && <div className="whitespace-pre-line rounded-2xl border border-gray-200 bg-white p-6 text-[15px] leading-7 text-gray-800 shadow-sm">{p.body}</div>}

      {p.steps.length > 0 && (
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <p className="mb-4 text-xs font-black uppercase tracking-widest text-gray-400">{plural(t.playbooks, "steps", p.steps.length)}</p>
          <ol className="space-y-5">
            {p.steps.map((s, i) => (
              <li key={i} className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-black text-white" style={{ background: color }}>{i + 1}</span>
                <div className="min-w-0 pt-1">
                  <p className="font-bold text-gray-900">{s.title}</p>
                  {s.body && <p className="mt-1 whitespace-pre-line text-sm leading-6 text-gray-700">{s.body}</p>}
                  {(s.images?.length ?? 0) > 0 && (
                    <div className="mt-3 flex flex-wrap gap-3">
                      {s.images!.map(path =>
                        urls[path] ? (
                          <a key={path} href={urls[path]} target="_blank" rel="noopener noreferrer" className="block">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={urls[path]} alt={fmt(t.playbooks.imageAlt, { n: i + 1 })} className="max-h-80 w-auto max-w-full rounded-lg border border-gray-200" />
                          </a>
                        ) : (
                          <span key={path} className="block h-40 w-60 animate-pulse rounded-lg bg-gray-100" />
                        ),
                      )}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {p.ack_required && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">{plural(t.playbooks, "ackCount", ackCount)}</p>
          {myAck ? (
            <span className="flex items-center gap-1.5 text-sm font-bold text-[#00704a]"><CheckCircle2 className="h-4 w-4" /> {fmt(t.playbooks.acked, { date: date(myAck) })}</span>
          ) : (
            <button type="button" onClick={ack} disabled={busy} className="flex h-10 items-center gap-1.5 rounded-lg bg-[#009f67] px-4 text-sm font-bold text-white disabled:opacity-50">
              <CheckCircle2 className="h-4 w-4" /> {t.playbooks.readIt}
            </button>
          )}
        </div>
      )}
    </article>
  );
}
