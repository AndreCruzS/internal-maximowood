"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, CheckCircle2, MessageCircle, Pencil, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";
import { useMe } from "@/components/MeProvider";
import { companyName, type CompanyId } from "@/lib/intranet";
import { deptName } from "@/lib/i18n/text";
import { plural } from "@/lib/i18n/dictionaries";
import { fmt } from "@/lib/i18n/locale";
import { PRIORITY_STYLE, isFresh, priorityOf, timeAgo } from "@/lib/news";
import { Photo, colorOf } from "@/components/people/shared";
import { PriorityBadge } from "@/components/news/newsShared";
import type { NewsItem } from "@/server/intranet";

export const EMOJIS = ["👍", "❤️", "🎉", "👏"] as const;

export type FeedPerson = { name: string; photo_url: string | null; person_id: string | null; department_id: string | null };
export type Reaction = { news_id: string; user_id: string; emoji: string };
export type Comment = { id: string; news_id: string; user_id: string; body: string; created_at: string };

const LONG = 320;

/** One post in the feed: author, level, text, photo, reactions, comments and — for must-reads — "I've read this". */
export default function FeedPost({ post, people, confirmed: confirmedAtStart, reactions: rx0, comments: c0, commentsOn, detail, onTeam }: {
  post: NewsItem;
  people: Record<string, FeedPerson>;
  confirmed: boolean;
  reactions: Reaction[];
  comments: Comment[];
  /** False before migration 0023 (no comments table yet). */
  commentsOn: boolean;
  /** On the post's own page: full text, comments open. */
  detail?: boolean;
  onTeam?: (dept: string) => void;
}) {
  const { t, tag } = useI18n();
  const me = useMe();
  const router = useRouter();
  const [rx, setRx] = useState(rx0);
  const [comments, setComments] = useState(c0);
  const [confirmed, setConfirmed] = useState(confirmedAtStart);
  const [open, setOpen] = useState(!!detail);
  const [expanded, setExpanded] = useState(!!detail);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const priority = priorityOf(post);
  const author = post.author_id ? people[post.author_id] : undefined;
  const canEdit = me.canManage(post.department_id) || (!!me.userId && post.author_id === me.userId && me.role !== "member");
  const long = post.body.length > LONG || post.body.split("\n").length > 6;
  const href = `/news/${post.id}`;

  const react = async (emoji: string) => {
    const supabase = getSupabase();
    if (!supabase || !me.userId) return;
    const mine = rx.some(r => r.user_id === me.userId && r.emoji === emoji);
    const before = rx;
    setRx(mine ? rx.filter(r => !(r.user_id === me.userId && r.emoji === emoji)) : [...rx, { news_id: post.id, user_id: me.userId, emoji }]);
    const { error } = mine
      ? await supabase.from("news_reactions").delete().match({ news_id: post.id, user_id: me.userId, emoji })
      : await supabase.from("news_reactions").insert({ news_id: post.id, emoji });
    if (error) { setRx(before); toast.error(error.message); }
  };

  const confirm = async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.from("news_reads").insert({ news_id: post.id });
    setBusy(false);
    if (error) return toast.error(error.message);
    setConfirmed(true);
    router.refresh();
  };

  const addComment = async () => {
    const supabase = getSupabase();
    const body = draft.trim();
    if (!supabase || !body) return;
    setBusy(true);
    const { data, error } = await supabase.from("news_comments").insert({ news_id: post.id, body }).select("id, news_id, user_id, body, created_at").single();
    setBusy(false);
    if (error) return toast.error(error.message);
    setComments(c => [...c, data as Comment]);
    setDraft("");
  };

  const removeComment = async (c: Comment) => {
    const supabase = getSupabase();
    if (!supabase) return;
    const { error } = await supabase.from("news_comments").delete().eq("id", c.id);
    if (error) return toast.error(error.message);
    setComments(list => list.filter(x => x.id !== c.id));
  };

  const counts = EMOJIS.map(e => ({ e, n: rx.filter(r => r.emoji === e).length, mine: rx.some(r => r.user_id === me.userId && r.emoji === e) }));
  const total = rx.length;
  const ring = priority === "update" ? "border-gray-200" : PRIORITY_STYLE[priority].ring;

  return (
    <article className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${ring} ${priority === "critical" && !confirmed ? "ring-2 ring-red-100" : ""}`}>
      {priority !== "update" && <div className={`h-1.5 ${priority === "critical" ? "bg-red-500" : "bg-amber-400"}`} />}

      {/* Author line */}
      <header className="flex items-start gap-3 px-5 pt-4">
        {author?.person_id ? (
          <Link href={`/people/${author.person_id}`} className="shrink-0"><Photo person={{ full_name: author.name, photo_url: author.photo_url }} size={44} color={colorOf(author.department_id)} /></Link>
        ) : (
          <Photo person={{ full_name: author?.name ?? "GMX Group", photo_url: author?.photo_url ?? null }} size={44} color={colorOf(post.department_id)} />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm">
            <span className="font-black text-gray-900">{author?.name ?? "GMX Group"}</span>
            {post.department_id ? (
              <>
                <span className="text-gray-400"> · </span>
                <button type="button" onClick={() => onTeam?.(post.department_id!)} disabled={!onTeam}
                  className="font-bold enabled:hover:underline" style={{ color: colorOf(post.department_id) }}>
                  {deptName(t, post.department_id)}
                </button>
              </>
            ) : (
              <span className="text-gray-400"> · {t.news.companyWide}</span>
            )}
          </p>
          <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-gray-400">
            {/* Relative time and the viewer's timezone differ between server and browser. */}
            <Link href={href} className="hover:underline" title={new Date(post.published_at).toLocaleString(tag)} suppressHydrationWarning>{timeAgo(post.published_at, tag)}</Link>
            {post.company_id && <span>· {companyName(post.company_id as CompanyId)}</span>}
            {isFresh(post.published_at) && <span className="rounded-full bg-[#e6f6f0] px-1.5 font-bold text-[#00704a]">{t.news.fresh}</span>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <PriorityBadge priority={priority} />
          {canEdit && !detail && (
            <Link href={`/news/${post.id}/edit`} aria-label={t.common.edit} title={t.common.edit} className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><Pencil className="h-4 w-4" /></Link>
          )}
        </div>
      </header>

      {/* Content */}
      <div className="px-5 pb-3 pt-3">
        {detail ? (
          <h1 className="text-2xl font-black leading-snug text-gray-900">{post.title}</h1>
        ) : (
          <Link href={href} className="block text-lg font-black leading-snug text-gray-900 hover:underline">{post.title}</Link>
        )}
        {post.body && (
          <div className={`mt-1.5 whitespace-pre-line text-[15px] leading-relaxed text-gray-700 ${!expanded && long ? "line-clamp-5" : ""}`}>{post.body}</div>
        )}
        {long && !detail && (
          <button type="button" onClick={() => setExpanded(v => !v)} className="mt-1 text-sm font-bold text-gray-500 hover:text-gray-800">
            {expanded ? t.news.seeLess : t.news.seeMore}
          </button>
        )}
      </div>
      {post.image_url && (
        detail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.image_url} alt="" className="max-h-[32rem] w-full bg-gray-50 object-contain" />
        ) : (
          <Link href={href} className="block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={post.image_url} alt="" className="max-h-96 w-full object-cover" />
          </Link>
        )
      )}
      {post.link_url && (
        <div className="px-5 pt-3">
          <a href={post.link_url} target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm hover:border-[#009f67]">
            <span className="min-w-0 truncate font-bold text-gray-800">{post.link_url.replace(/^https?:\/\/(www\.)?/, "")}</span>
            <ArrowUpRight className="h-4 w-4 shrink-0 text-[#00704a]" />
          </a>
        </div>
      )}

      {/* Must read */}
      {priority === "critical" && (
        <div className={`mx-5 mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-2.5 text-sm ${confirmed ? "bg-[#e6f6f0]" : "bg-red-50"}`}>
          {confirmed ? (
            <span className="flex items-center gap-1.5 font-bold text-[#00704a]"><CheckCircle2 className="h-4 w-4" /> {t.news.confirmed}</span>
          ) : (
            <>
              <span className="font-bold text-red-800">{t.news.pleaseConfirm}</span>
              <button type="button" onClick={confirm} disabled={busy} className="flex h-9 items-center gap-1.5 rounded-lg bg-[#009f67] px-4 font-bold text-white hover:bg-[#00704a] disabled:opacity-50">
                <CheckCircle2 className="h-4 w-4" /> {t.news.markRead}
              </button>
            </>
          )}
        </div>
      )}

      {/* Counts */}
      {(total > 0 || comments.length > 0) && (
        <div className="flex items-center justify-between px-5 pt-3 text-xs text-gray-500">
          <span>{total > 0 && <>{counts.filter(c => c.n).map(c => c.e).join("")} {total}</>}</span>
          {comments.length > 0 && (
            <button type="button" onClick={() => setOpen(v => !v)} className="hover:underline">{plural(t.news, "comments", comments.length)}</button>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="mx-5 mt-2 flex flex-wrap items-center gap-1 border-t border-gray-100 py-2">
        {counts.map(({ e, n, mine }) => (
          <button key={e} type="button" onClick={() => react(e)} aria-pressed={mine} aria-label={fmt(t.news.react, { emoji: e })}
            className={`flex h-9 items-center gap-1 rounded-full px-3 text-sm transition-colors ${mine ? "bg-[#e6f6f0] font-bold text-[#00704a]" : "text-gray-600 hover:bg-gray-100"}`}>
            <span className="text-base leading-none">{e}</span>{n > 0 && <span>{n}</span>}
          </button>
        ))}
        <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open}
          className="ml-auto flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-bold text-gray-600 hover:bg-gray-100">
          <MessageCircle className="h-4 w-4" /> {t.news.comment}
        </button>
      </div>

      {/* Comments */}
      {open && (
        <div className="space-y-3 border-t border-gray-100 bg-gray-50/60 px-5 py-4">
          {!commentsOn ? (
            <p className="text-sm text-gray-400">{t.news.commentsOff}</p>
          ) : (
            <>
              {comments.map(c => {
                const who = people[c.user_id];
                const mine = c.user_id === me.userId;
                return (
                  <div key={c.id} className="group flex gap-2.5">
                    <Photo person={{ full_name: who?.name ?? "?", photo_url: who?.photo_url ?? null }} size={32} color={colorOf(who?.department_id ?? null)} />
                    <div className="min-w-0 flex-1">
                      <div className="inline-block max-w-full rounded-2xl bg-white px-3.5 py-2 shadow-sm">
                        <p className="text-xs font-black text-gray-900">{who?.name ?? "—"}</p>
                        <p className="whitespace-pre-line break-words text-sm text-gray-800">{c.body}</p>
                      </div>
                      <p className="mt-0.5 flex items-center gap-2 pl-3 text-[11px] text-gray-400">
                        <span suppressHydrationWarning>{timeAgo(c.created_at, tag)}</span>
                        {(mine || canEdit) && (
                          <button type="button" onClick={() => removeComment(c)} aria-label={t.news.deleteComment} title={t.news.deleteComment}
                            className="text-gray-400 hover:text-red-600"><Trash2 className="h-3 w-3" /></button>
                        )}
                      </p>
                    </div>
                  </div>
                );
              })}
              <form onSubmit={e => { e.preventDefault(); void addComment(); }} className="flex items-end gap-2.5">
                {me.userId && people[me.userId] && (
                  <Photo person={{ full_name: people[me.userId].name, photo_url: people[me.userId].photo_url }} size={32} color={colorOf(people[me.userId].department_id)} />
                )}
                <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={1} maxLength={1000} placeholder={t.news.writeComment} aria-label={t.news.writeComment}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void addComment(); } }}
                  className="min-h-9 flex-1 resize-none rounded-2xl border border-gray-300 bg-white px-3.5 py-2 text-sm outline-none focus:border-[#009f67]" />
                <button type="submit" disabled={busy || !draft.trim()} aria-label={t.news.send} title={t.news.send}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#009f67] text-white disabled:bg-gray-200 disabled:text-gray-400"><Send className="h-4 w-4" /></button>
              </form>
            </>
          )}
        </div>
      )}
    </article>
  );
}
