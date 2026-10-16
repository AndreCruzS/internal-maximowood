"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";
import { useMe } from "@/components/MeProvider";
import { DEPARTMENTS } from "@/lib/intranet";
import { deptName } from "@/lib/i18n/text";
import { fmt } from "@/lib/i18n/locale";
import { COMPANY_WIDE, type Priority } from "@/lib/news";
import { Photo, colorOf } from "@/components/people/shared";
import { PhotoField, PriorityPicker, saveNews } from "@/components/news/newsShared";
import type { FeedPerson } from "@/components/news/FeedPost";

const field = "w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-[#009f67]";

/** "Share an update…": a box at the top of the feed that opens into a short form. */
export default function NewsComposer({ self, team }: { self: FeedPerson | null; team: string | null }) {
  const { t, locale } = useI18n();
  const me = useMe();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [withLink, setWithLink] = useState(false);
  const departments = me.isAdmin ? DEPARTMENTS : DEPARTMENTS.filter(x => x.id === me.departmentId);
  const startDept = me.isAdmin ? (team && team !== COMPANY_WIDE ? team : "") : me.departmentId ?? "";
  const [d, setD] = useState({ title: "", body: "", image_url: "", link_url: "", department_id: startDept, priority: "update" as Priority });
  const set = (patch: Partial<typeof d>) => setD(x => ({ ...x, ...patch }));
  const first = (self?.name ?? me.name).split(/\s+/)[0];
  const hint = t.news.hints[(d.department_id || "company") as keyof typeof t.news.hints] ?? t.news.hints.company;

  const reset = () => { setD({ title: "", body: "", image_url: "", link_url: "", department_id: startDept, priority: "update" }); setWithLink(false); setOpen(false); };

  const post = async () => {
    const supabase = getSupabase();
    if (!supabase || !d.title.trim()) return;
    setBusy(true);
    const { error } = await saveNews(supabase, {
      title: d.title.trim(),
      body: d.body.trim(),
      image_url: d.image_url || null,
      link_url: d.link_url.trim() || null,
      company_id: null,
      department_id: d.department_id || (me.isAdmin ? null : me.departmentId),
      priority: d.priority,
      language: locale,
    }, { authorId: me.userId });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(t.news.posted);
    reset();
    router.refresh();
  };

  const avatar = <Photo person={{ full_name: self?.name ?? me.name ?? "?", photo_url: self?.photo_url ?? null }} size={44} color={colorOf(self?.department_id ?? me.departmentId)} />;

  if (!open) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        {avatar}
        <button type="button" onClick={() => setOpen(true)}
          className="h-11 flex-1 rounded-full border border-gray-300 bg-gray-50 px-4 text-left text-sm text-gray-500 hover:bg-gray-100">
          {first ? fmt(t.news.composerPrompt, { name: first }) : t.news.composerPromptAnon}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-2xl border-2 border-[#009f67] bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        {avatar}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-gray-900">{self?.name ?? me.name}</p>
          <label className="flex items-center gap-1.5 text-xs text-gray-500">
            {t.news.postTo}
            <select value={d.department_id} onChange={e => set({ department_id: e.target.value })} aria-label={t.news.postTo}
              className="rounded-md border border-gray-200 bg-white px-1.5 py-0.5 text-xs font-bold text-gray-800">
              {me.isAdmin && <option value="">{t.news.companyWide}</option>}
              {departments.map(x => <option key={x.id} value={x.id}>{deptName(t, x.id)}</option>)}
            </select>
          </label>
        </div>
      </div>
      <input autoFocus value={d.title} onChange={e => set({ title: e.target.value })} maxLength={160} placeholder={hint} aria-label={t.news.titlePlaceholder}
        className={`${field} h-11 text-base font-bold`} />
      <textarea value={d.body} onChange={e => set({ body: e.target.value })} rows={4} placeholder={t.news.bodyPlaceholder} aria-label={t.news.body}
        className={`${field} py-2`} />
      <div>
        <p className="mb-2 text-xs font-bold text-gray-500">{t.news.howImportant}</p>
        <PriorityPicker value={d.priority} onChange={priority => set({ priority })} />
      </div>
      {d.image_url && <PhotoField value={d.image_url} onChange={image_url => set({ image_url })} userId={me.userId} />}
      {withLink && (
        <input value={d.link_url} onChange={e => set({ link_url: e.target.value })} placeholder="https://…" aria-label={t.news.link} className={`${field} h-10`} />
      )}
      <div className="flex flex-wrap items-center gap-1 border-t border-gray-100 pt-3">
        {!d.image_url && <PhotoField value="" onChange={image_url => set({ image_url })} userId={me.userId} />}
        {!withLink && (
          <button type="button" onClick={() => setWithLink(true)} className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-bold text-gray-700 hover:bg-gray-100">
            <Link2 className="h-4 w-4 text-[#009f67]" /> {t.news.addLink}
          </button>
        )}
        <Link href="/news/new" className="flex h-9 items-center rounded-lg px-3 text-sm font-bold text-gray-500 hover:bg-gray-100">{t.news.moreOptions}</Link>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={reset} className="h-10 rounded-lg px-4 text-sm font-bold text-gray-600 hover:bg-gray-100">{t.common.cancel}</button>
          <button type="button" onClick={post} disabled={busy || !d.title.trim()}
            className="flex h-10 items-center gap-2 rounded-lg bg-[#009f67] px-5 text-sm font-bold text-white hover:bg-[#00704a] disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t.news.publish}
          </button>
        </div>
      </div>
    </div>
  );
}
