"use client";

import { useRef, useState } from "react";
import { AlertTriangle, BellRing, ImagePlus, Info, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";
import { MAX_NEWS_IMAGE_BYTES, NEWS_BUCKET, NEWS_IMAGE_PREFIX, PRIORITIES, PRIORITY_STYLE, type Priority } from "@/lib/news";

export const PRIORITY_ICON = { update: Info, important: AlertTriangle, critical: BellRing } as const;

/** The level badge: Update · Important · Must read. */
export function PriorityBadge({ priority, small }: { priority: Priority; small?: boolean }) {
  const { t } = useI18n();
  const Icon = PRIORITY_ICON[priority];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-bold ${PRIORITY_STYLE[priority].badge} ${small ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-0.5 text-xs"}`}>
      <Icon className={small ? "h-3 w-3" : "h-3.5 w-3.5"} /> {t.news.priorities[priority]}
    </span>
  );
}

/** Three big choices with a line on what each one does. */
export function PriorityPicker({ value, onChange }: { value: Priority; onChange: (p: Priority) => void }) {
  const { t } = useI18n();
  return (
    <div role="radiogroup" aria-label={t.news.howImportant} className="grid gap-2 sm:grid-cols-3">
      {PRIORITIES.map(p => {
        const Icon = PRIORITY_ICON[p];
        const on = value === p;
        return (
          <button key={p} type="button" role="radio" aria-checked={on} onClick={() => onChange(p)}
            className={`rounded-xl border-2 p-3 text-left transition-colors ${on ? `${PRIORITY_STYLE[p].ring} ${PRIORITY_STYLE[p].badge}` : "border-gray-200 bg-white hover:border-gray-300"}`}>
            <span className="flex items-center gap-1.5 text-sm font-black"><Icon className="h-4 w-4" /> {t.news.priorities[p]}</span>
            <span className={`mt-1 block text-xs ${on ? "" : "text-gray-500"}`}>{t.news.priorityHelp[p]}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Photo for a post: upload (to the private "news" bucket) or keep a pasted URL. */
export function PhotoField({ value, onChange, userId }: { value: string; onChange: (v: string) => void; userId: string | null }) {
  const { t } = useI18n();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (file: File) => {
    const supabase = getSupabase();
    if (!supabase || !userId) return;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) return toast.error(t.me.photoType);
    if (file.size > MAX_NEWS_IMAGE_BYTES) return toast.error(t.news.photoTooBig);
    setBusy(true);
    const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${file.type.split("/")[1].replace("jpeg", "jpg")}`;
    const { error } = await supabase.storage.from(NEWS_BUCKET).upload(path, file, { contentType: file.type });
    setBusy(false);
    if (error) return toast.error(error.message);
    onChange(`${NEWS_IMAGE_PREFIX}${path}`);
  };
  return value ? (
    <div className="relative">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={value} alt="" className="max-h-72 w-full rounded-xl object-cover" />
      <button type="button" onClick={() => onChange("")} aria-label={t.news.removePhoto} title={t.news.removePhoto}
        className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80"><X className="h-4 w-4" /></button>
    </div>
  ) : (
    <>
      <button type="button" onClick={() => ref.current?.click()} disabled={busy}
        className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-bold text-gray-700 hover:bg-gray-100 disabled:opacity-50">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4 text-[#009f67]" />} {busy ? t.news.uploading : t.news.addPhoto}
      </button>
      <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void pick(f); }} />
    </>
  );
}

export type NewsRow = {
  title: string;
  body: string;
  image_url: string | null;
  link_url: string | null;
  company_id: string | null;
  department_id: string | null;
  featured?: boolean;
  priority: Priority;
  language: string | null;
};

/** Insert or update a post. Before migration 0023 there's no priority column: retry with just must_read. */
export async function saveNews(supabase: SupabaseClient, row: NewsRow, opts: { id?: string; authorId?: string | null }) {
  const run = (r: Record<string, unknown>) =>
    opts.id
      ? supabase.from("news").update(r).eq("id", opts.id).select("id").single()
      : supabase.from("news").insert({ ...r, author_id: opts.authorId ?? null }).select("id").single();
  const full = { ...row, must_read: row.priority === "critical" };
  let res = await run(full);
  if (res.error && ["42703", "PGRST204"].includes(res.error.code ?? "")) {
    const { priority: _drop, ...legacy } = full;
    void _drop;
    res = await run(legacy);
  }
  return res as { data: { id: string } | null; error: { message: string } | null };
}
