"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Building2, HelpCircle, Layers, Newspaper, Plus, X } from "lucide-react";
import Link from "next/link";
import { useI18n } from "@/components/I18nProvider";
import { useMe } from "@/components/MeProvider";
import { DEPARTMENTS } from "@/lib/intranet";
import { deptName } from "@/lib/i18n/text";
import { fmt } from "@/lib/i18n/locale";
import { COMPANY_WIDE, PRIORITIES, PRIORITY_STYLE, priorityOf, sortFeed, type Priority } from "@/lib/news";
import { colorOf } from "@/components/people/shared";
import FeedPost, { type Comment, type FeedPerson, type Reaction } from "@/components/news/FeedPost";
import NewsComposer from "@/components/news/NewsComposer";
import { PriorityBadge } from "@/components/news/newsShared";
import type { NewsItem } from "@/server/intranet";

const PAGE = 15;
const LEARN_KEY = "gmx.news.learned";
const noSubscribe = () => () => {};
const learnedBefore = () => { try { return !!localStorage.getItem(LEARN_KEY); } catch { return true; } };

/** The news feed: levels (Update · Important · Must read), teams, a "share an update" box, and posts you can react to and comment on. */
export default function NewsList({ news, confirmedIds, people, reactions, comments, commentsOn, priority: priority0, team: team0, error }: {
  news: NewsItem[];
  confirmedIds: string[];
  people: Record<string, FeedPerson>;
  reactions: Reaction[];
  comments: Comment[];
  commentsOn: boolean;
  priority: Priority | null;
  /** A department id, COMPANY_WIDE, or null for all teams. */
  team: string | null;
  error: string | null;
}) {
  const { t } = useI18n();
  const me = useMe();
  const canPost = me.isAdmin || me.role === "leader";
  const [priority, setPriority] = useState<Priority | null>(priority0);
  const [team, setTeam] = useState<string | null>(team0);
  const [shown, setShown] = useState(PAGE);
  // First visit: show the "how the feed works" card (until "Got it").
  const [learnOverride, setLearn] = useState<boolean | null>(null);
  const learned = useSyncExternalStore(noSubscribe, learnedBefore, () => true);
  const learn = learnOverride ?? !learned;
  const confirmed = useMemo(() => new Set(confirmedIds), [confirmedIds]);

  const dismissLearn = () => { setLearn(false); try { localStorage.setItem(LEARN_KEY, "1"); } catch { /* storage blocked */ } };

  // Keep the URL shareable (/news?level=important&team=hr) without a reload.
  useEffect(() => {
    const qs = new URLSearchParams();
    if (priority) qs.set("level", priority);
    if (team) qs.set("team", team);
    const s = qs.toString();
    window.history.replaceState(null, "", s ? `/news?${s}` : "/news");
  }, [priority, team]);

  const inTeam = (n: NewsItem) => !team || (team === COMPANY_WIDE ? !n.department_id : n.department_id === team);
  const teamPosts = news.filter(inTeam);
  const list = sortFeed(teamPosts.filter(n => !priority || priorityOf(n) === priority), confirmed);
  const byPost = <T extends { news_id: string }>(rows: T[]) => {
    const m: Record<string, T[]> = {};
    for (const r of rows) (m[r.news_id] ??= []).push(r);
    return m;
  };
  const rx = useMemo(() => byPost(reactions), [reactions]);
  const cm = useMemo(() => byPost(comments), [comments]);
  const toConfirm = teamPosts.filter(n => priorityOf(n) === "critical" && !confirmed.has(n.id)).length;
  const countFor = (id: string | null) => news.filter(n => (id === null ? true : id === COMPANY_WIDE ? !n.department_id : n.department_id === id)).length;
  const pickTeam = (id: string | null) => { setTeam(id); setShown(PAGE); window.scrollTo({ top: 0, behavior: "smooth" }); };

  const teams: { id: string | null; label: string; color: string; Icon: typeof Layers }[] = [
    { id: null, label: t.news.allTeams, color: "#009f67", Icon: Layers },
    { id: COMPANY_WIDE, label: t.news.companyWide, color: "#009f67", Icon: Building2 },
    ...DEPARTMENTS.map(d => ({ id: d.id, label: deptName(t, d.id), color: colorOf(d.id), Icon: d.icon })),
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900">{t.news.title}</h1>
          <p className="text-gray-500">{t.news.feedSubtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {!learn && (
            <button type="button" onClick={() => setLearn(true)} className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-bold text-gray-500 hover:bg-gray-100">
              <HelpCircle className="h-4 w-4" /> {t.news.howItWorks}
            </button>
          )}
          {canPost && (
            <Link href="/news/new" className="flex h-9 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm font-bold text-gray-700 hover:bg-gray-50 lg:hidden">
              <Plus className="h-4 w-4" /> {t.news.newPost}
            </Link>
          )}
        </div>
      </div>

      {/* Teams: chips on small screens */}
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden">
        {teams.map(x => (
          <button key={x.id ?? "all"} type="button" onClick={() => pickTeam(x.id)} aria-pressed={team === x.id}
            className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-bold ${team === x.id ? "border-transparent text-white" : "border-gray-200 bg-white text-gray-700"}`}
            style={team === x.id ? { background: x.color } : undefined}>
            <x.Icon className="h-4 w-4" /> {x.label}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        {/* Teams: sidebar on large screens */}
        <nav aria-label={t.news.teams} className="hidden lg:block">
          <div className="sticky top-20 space-y-0.5">
            <p className="mb-2 px-3 text-xs font-black uppercase tracking-widest text-gray-400">{t.news.teams}</p>
            {teams.map(x => {
              const n = countFor(x.id);
              const on = team === x.id;
              return (
                <button key={x.id ?? "all"} type="button" onClick={() => pickTeam(x.id)} aria-pressed={on}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm ${on ? "bg-white font-black text-gray-900 shadow-sm" : "font-bold text-gray-600 hover:bg-white/70"} ${n === 0 && !on ? "opacity-50" : ""}`}>
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: `${x.color}1a`, color: x.color }}><x.Icon className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1 truncate">{x.label}</span>
                  {n > 0 && <span className="text-xs text-gray-400">{n}</span>}
                </button>
              );
            })}
          </div>
        </nav>

        <div className="mx-auto w-full max-w-2xl space-y-4">
          {learn && (
            <div className="relative rounded-2xl border border-sky-200 bg-sky-50 p-5 text-sm text-sky-950">
              <button type="button" onClick={dismissLearn} aria-label={t.news.gotIt} className="absolute right-3 top-3 rounded-full p-1 text-sky-700 hover:bg-sky-100"><X className="h-4 w-4" /></button>
              <p className="mb-2 font-black">{t.news.learnTitle}</p>
              <ul className="space-y-2">
                <li>
                  {(() => {
                    const parts = t.news.learnLevels.split(/(\{update\}|\{important\}|\{critical\})/);
                    return parts.map((part, i) => {
                      const m = part.match(/^\{(update|important|critical)\}$/);
                      return m ? <PriorityBadge key={i} priority={m[1] as Priority} small /> : <span key={i}>{part}</span>;
                    });
                  })()}
                </li>
                <li>{t.news.learnPinned}</li>
                <li>{t.news.learnTeams}</li>
              </ul>
              <button type="button" onClick={dismissLearn} className="mt-3 rounded-lg bg-sky-700 px-4 py-1.5 text-sm font-bold text-white hover:bg-sky-800">{t.news.gotIt}</button>
            </div>
          )}

          {canPost && <NewsComposer key={team ?? "all"} self={me.userId ? people[me.userId] ?? null : null} team={team} />}

          {/* Levels */}
          <div role="tablist" aria-label={t.news.howImportant} className="flex flex-wrap gap-2">
            {([null, ...PRIORITIES] as (Priority | null)[]).map(p => {
              const on = priority === p;
              return (
                <button key={p ?? "all"} type="button" role="tab" aria-selected={on} onClick={() => { setPriority(p); setShown(PAGE); }}
                  className={`flex h-9 items-center gap-1.5 rounded-full border px-4 text-sm font-bold ${on ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"}`}>
                  {p && <span className={`h-2 w-2 rounded-full ${PRIORITY_STYLE[p].dot}`} />}
                  {t.news.filters[p ?? "all"]}
                  {p === "critical" && toConfirm > 0 && <span className="rounded-full bg-red-500 px-1.5 text-[11px] text-white">{toConfirm}</span>}
                </button>
              );
            })}
          </div>

          {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{fmt(t.common.couldntLoad, { error })}</p>}

          {list.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-gray-300 bg-white py-16 text-sm text-gray-400">
              <Newspaper className="h-7 w-7" /> {news.length ? t.news.emptyFilter : t.news.empty}
              {(priority || team) && news.length > 0 && (
                <button type="button" onClick={() => { setPriority(null); pickTeam(null); }} className="font-bold text-[#00704a] hover:underline">{t.news.showAll}</button>
              )}
            </div>
          ) : (
            <>
              {list.slice(0, shown).map(n => (
                <FeedPost key={n.id} post={n} people={people} confirmed={confirmed.has(n.id)} reactions={rx[n.id] ?? []} comments={cm[n.id] ?? []}
                  commentsOn={commentsOn} onTeam={pickTeam} />
              ))}
              {list.length > shown && (
                <button type="button" onClick={() => setShown(s => s + PAGE)}
                  className="h-11 w-full rounded-2xl border border-gray-200 bg-white text-sm font-bold text-gray-700 hover:bg-gray-50">{t.news.showMore}</button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
