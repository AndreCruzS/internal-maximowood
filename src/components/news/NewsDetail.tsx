"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, CheckCircle2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";
import { useMe } from "@/components/MeProvider";
import { plural } from "@/lib/i18n/dictionaries";
import { fmt } from "@/lib/i18n/locale";
import { NewsTags } from "@/components/news/NewsList";
import type { NewsItem } from "@/server/intranet";

const EMOJIS = ["👍", "❤️", "🎉", "👏"] as const;

/** One announcement: full text, link, reactions and — for must-read posts — "I've read this" + who has read it. */
export default function NewsDetail({ post, me: myId, reads, reactions, names }: {
  post: NewsItem;
  me: string;
  reads: { user_id: string; read_at: string }[];
  reactions: { user_id: string; emoji: string }[];
  names: Record<string, string>;
}) {
  const { t, tag } = useI18n();
  const me = useMe();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [showReaders, setShowReaders] = useState(false);
  const supabase = getSupabase();
  const iRead = reads.some(r => r.user_id === myId);
  const canEdit = me.canManage(post.department_id) || (post.author_id === myId && me.role !== "member");

  const run = async (fn: () => PromiseLike<{ error: { message: string } | null }>) => {
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) toast.error(error.message);
    else router.refresh();
  };
  const react = (emoji: string) => {
    if (!supabase) return;
    const mine = reactions.some(r => r.user_id === myId && r.emoji === emoji);
    void run(() =>
      mine
        ? supabase.from("news_reactions").delete().match({ news_id: post.id, user_id: myId, emoji })
        : supabase.from("news_reactions").insert({ news_id: post.id, emoji }),
    );
  };

  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <Link href="/news" className="text-sm font-bold text-[#00704a] hover:underline">{t.news.backToNews}</Link>
      {post.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.image_url} alt="" className="max-h-80 w-full rounded-xl object-cover" />
      )}
      <div className="space-y-3">
        <NewsTags n={post} />
        <h1 className="text-3xl font-black leading-tight text-gray-900">{post.title}</h1>
        <p className="text-sm text-gray-500">
          {new Date(post.published_at).toLocaleDateString(tag, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
          {post.author_id && names[post.author_id] ? ` · ${fmt(t.news.by, { name: names[post.author_id] })}` : ""}
        </p>
      </div>
      <div className="whitespace-pre-line text-[15px] leading-7 text-gray-800">{post.body}</div>
      {post.link_url && (
        <a href={post.link_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2 text-sm font-bold text-gray-800 hover:bg-gray-50">
          {t.news.openLink} <ArrowUpRight className="h-4 w-4" />
        </a>
      )}

      {post.must_read && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
          {iRead ? (
            <span className="flex items-center gap-2 font-bold text-[#00704a]"><CheckCircle2 className="h-5 w-5" /> {t.news.confirmed}</span>
          ) : (
            <button
              type="button"
              disabled={busy || !supabase}
              onClick={() => run(() => supabase!.from("news_reads").insert({ news_id: post.id }))}
              className="rounded-lg bg-[#009f67] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              {t.news.markRead}
            </button>
          )}
          <button type="button" onClick={() => setShowReaders(v => !v)} className="text-sm font-bold text-amber-900 underline" disabled={!canEdit}>
            {plural(t.news, "readBy", reads.length)}
          </button>
          {showReaders && canEdit && (
            <ul className="w-full columns-2 text-sm text-gray-700 sm:columns-3">
              {reads.map(r => <li key={r.user_id}>{names[r.user_id] ?? "—"}</li>)}
            </ul>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {EMOJIS.map(e => {
          const count = reactions.filter(r => r.emoji === e).length;
          const mine = reactions.some(r => r.user_id === myId && r.emoji === e);
          return (
            <button
              key={e}
              type="button"
              disabled={busy}
              onClick={() => react(e)}
              aria-pressed={mine}
              className={`rounded-full border px-3 py-1 text-sm ${mine ? "border-[#009f67] bg-[#e6f6f0]" : "border-gray-300 bg-white hover:bg-gray-50"}`}
            >
              {e} {count > 0 && <span className="ml-0.5 font-bold text-gray-700">{count}</span>}
            </button>
          );
        })}
      </div>

      {canEdit && (
        <div className="flex gap-2 border-t border-gray-200 pt-4">
          <Link href={`/news/${post.id}/edit`} className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-bold text-gray-700 hover:bg-gray-50">
            <Pencil className="h-4 w-4" /> {t.common.edit}
          </Link>
          <button
            type="button"
            onClick={async () => {
              if (!supabase || !window.confirm(t.news.deleteConfirm)) return;
              const { error } = await supabase.from("news").delete().eq("id", post.id);
              if (error) return toast.error(error.message);
              toast.success(t.news.deleted);
              router.push("/news");
              router.refresh();
            }}
            className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-sm font-bold text-red-700 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" /> {t.common.delete}
          </button>
        </div>
      )}
    </article>
  );
}
