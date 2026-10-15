"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3, CalendarClock, ExternalLink, Lightbulb, Loader2, MessageCircleQuestion, Newspaper, PlayCircle, Plus, Search, Send, Trash2, Users,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";
import { fmt } from "@/lib/i18n/locale";
import { Photo } from "@/components/people/shared";
import {
  REQUEST_STATUSES, askIndex, matchesTopic, splitSessions, youTubeThumb,
  type KnowledgeItem, type KnowledgeKind, type KnowledgeRequest, type RequestStatus,
} from "@/lib/knowledge";
import type { KnowledgeData } from "@/server/knowledge";

const GREEN = "#009f67";
const field = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#009f67] focus:ring-2 focus:ring-[#009f67]/20";
const card = "rounded-2xl border border-gray-200 bg-white p-5 shadow-sm";

type Section = { id: string; kind?: KnowledgeKind; icon: LucideIcon };
const SECTIONS: Section[] = [
  { id: "request", icon: MessageCircleQuestion },
  { id: "upcoming", kind: "session", icon: CalendarClock },
  { id: "pills", kind: "pill", icon: Lightbulb },
  { id: "ask", icon: Users },
  { id: "videos", kind: "video", icon: PlayCircle },
  { id: "studies", kind: "study", icon: BarChart3 },
  { id: "insights", kind: "insight", icon: Newspaper },
];

/** The Knowledge page: everyone learns and asks; leaders, HR and admins publish. */
export default function KnowledgeView({ data, userId }: { data: KnowledgeData; userId: string }) {
  const { t } = useI18n();
  const k = t.knowledge;
  const byKind = (kind: KnowledgeKind) => data.items.filter(i => i.kind === kind);
  const { upcoming, past } = useMemo(() => splitSessions(data.items), [data.items]);
  const names = useMemo(() => Object.fromEntries(data.people.map(p => [p.id, p.full_name])), [data.people]);
  const canDelete = (i: KnowledgeItem) => data.isAdmin || (data.canEdit && i.created_by === userId);
  const label: Record<string, string> = {
    request: k.request, upcoming: k.upcoming, pills: k.pills, ask: k.ask, videos: k.videos, studies: k.studies, insights: k.insights,
  };
  const heading = (s: Section, extra?: React.ReactNode) => (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-lg font-black text-gray-900"><s.icon className="h-5 w-5 text-[#00704a]" /> {label[s.id]}</h2>
      {extra}
    </div>
  );
  const sec = (id: string) => SECTIONS.find(s => s.id === id)!;
  const adder = (kind: KnowledgeKind) => (data.canEdit ? <AddItem kind={kind} people={data.people} /> : null);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-3xl font-black text-gray-900">{k.title}</h1>
        <p className="text-gray-500">{k.subtitle}</p>
        <nav className="mt-4 flex flex-wrap gap-2" aria-label={k.title}>
          {SECTIONS.map(s => (
            <a key={s.id} href={`#${s.id}`} className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm font-bold text-gray-700 hover:border-[#009f67] hover:text-[#00704a]">
              <s.icon className="h-4 w-4" /> {label[s.id]}
            </a>
          ))}
        </nav>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section id="request" className={`${card} scroll-mt-24`}>
          {heading(sec("request"))}
          <RequestForm />
          <Requests requests={data.requests} canEdit={data.canEdit} userId={userId} userNames={data.userNames} />
        </section>

        <section id="upcoming" className={`${card} scroll-mt-24`}>
          {heading(sec("upcoming"), adder("session"))}
          {upcoming.length ? (
            <ul className="space-y-3">{upcoming.map(i => <SessionRow key={i.id} item={i} names={names} canDelete={canDelete(i)} />)}</ul>
          ) : <Empty text={k.noUpcoming} />}
          {past.length > 0 && (
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer font-bold text-gray-600">{fmt(k.pastSessions, { n: past.length })}</summary>
              <ul className="mt-3 space-y-3">{past.map(i => <SessionRow key={i.id} item={i} names={names} canDelete={canDelete(i)} past />)}</ul>
            </details>
          )}
        </section>
      </div>

      <section id="pills" className="scroll-mt-24">
        {heading(sec("pills"), adder("pill"))}
        {byKind("pill").length ? (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {byKind("pill").map(i => (
              <li key={i.id} className="flex flex-col rounded-2xl border border-[#9fdcc5] bg-[#f2fbf7] p-5">
                <Lightbulb className="mb-2 h-6 w-6 text-[#00704a]" />
                <p className="font-black text-gray-900">{i.title}</p>
                {i.summary && <p className="mt-1 whitespace-pre-line text-sm text-gray-700">{i.summary}</p>}
                <ItemFooter item={i} names={names} canDelete={canDelete(i)} />
              </li>
            ))}
          </ul>
        ) : <Empty text={k.empty} boxed />}
      </section>

      <section id="ask" className={`${card} scroll-mt-24`}>
        {heading(sec("ask"))}
        <WhoToAsk data={data} />
      </section>

      <section id="videos" className="scroll-mt-24">
        {heading(sec("videos"), adder("video"))}
        {byKind("video").length ? (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {byKind("video").map(i => {
              const thumb = youTubeThumb(i.url);
              return (
                <li key={i.id} className="flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                  <a href={i.url ?? undefined} target="_blank" rel="noopener noreferrer" className="relative flex aspect-video items-center justify-center bg-gradient-to-br from-[#00704a] to-[#009f67]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {thumb && <img src={thumb} alt="" className="absolute inset-0 h-full w-full object-cover" />}
                    <PlayCircle className="relative h-12 w-12 text-white drop-shadow" />
                  </a>
                  <div className="flex flex-1 flex-col p-4">
                    <p className="font-bold text-gray-900">{i.title}</p>
                    {i.summary && <p className="mt-1 line-clamp-3 text-sm text-gray-600">{i.summary}</p>}
                    <ItemFooter item={i} names={names} canDelete={canDelete(i)} />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : <Empty text={k.empty} boxed />}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {(["studies", "insights"] as const).map(id => {
          const s = sec(id);
          const items = byKind(s.kind!);
          return (
            <section key={id} id={id} className={`${card} scroll-mt-24`}>
              {heading(s, adder(s.kind!))}
              {items.length ? (
                <ul className="divide-y divide-gray-100">
                  {items.map(i => (
                    <li key={i.id} className="py-3 first:pt-0 last:pb-0">
                      {i.url ? (
                        <a href={i.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-1.5 font-bold text-gray-900 hover:text-[#00704a]">
                          {i.title} <ExternalLink className="mt-1 h-3.5 w-3.5 shrink-0" />
                        </a>
                      ) : <p className="font-bold text-gray-900">{i.title}</p>}
                      {i.summary && <p className="mt-0.5 whitespace-pre-line text-sm text-gray-600">{i.summary}</p>}
                      <ItemFooter item={i} names={names} canDelete={canDelete(i)} hideLink />
                    </li>
                  ))}
                </ul>
              ) : <Empty text={k.empty} />}
            </section>
          );
        })}
      </div>
    </div>
  );
}

const Empty = ({ text, boxed }: { text: string; boxed?: boolean }) => (
  <p className={boxed ? "rounded-xl border border-dashed border-gray-300 bg-white px-5 py-8 text-center text-sm text-gray-500" : "text-sm text-gray-500"}>{text}</p>
);

function useDelete() {
  const { t } = useI18n();
  const router = useRouter();
  return async (item: KnowledgeItem) => {
    const supabase = getSupabase();
    if (!supabase || !window.confirm(fmt(t.knowledge.deleteConfirm, { title: item.title }))) return;
    const { error } = await supabase.from("knowledge_items").delete().eq("id", item.id);
    if (error) return toast.error(error.message);
    router.refresh();
  };
}

/** Presenter, link and delete under an item. */
function ItemFooter({ item, names, canDelete, hideLink }: { item: KnowledgeItem; names: Record<string, string>; canDelete: boolean; hideLink?: boolean }) {
  const { t } = useI18n();
  const remove = useDelete();
  const by = item.presenter_id ? names[item.presenter_id] : null;
  if (!by && (hideLink || !item.url) && !canDelete) return null;
  return (
    <div className="mt-auto flex items-center gap-3 pt-3 text-xs">
      {by && item.presenter_id && <Link href={`/people/${item.presenter_id}`} className="font-bold text-gray-500 hover:underline">{fmt(t.knowledge.by, { name: by })}</Link>}
      {!hideLink && item.url && (
        <a href={item.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 font-bold text-[#00704a] hover:underline">
          {t.knowledge.open} <ExternalLink className="h-3 w-3" />
        </a>
      )}
      {canDelete && (
        <button type="button" onClick={() => remove(item)} aria-label={t.common.delete} className="ml-auto text-gray-400 hover:text-red-600">
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function SessionRow({ item: i, names, canDelete, past }: { item: KnowledgeItem; names: Record<string, string>; canDelete: boolean; past?: boolean }) {
  const { t, tag } = useI18n();
  const d = new Date(i.event_at!);
  return (
    <li className="flex gap-3">
      <span className={`flex w-14 shrink-0 flex-col items-center justify-center rounded-xl py-1.5 ${past ? "bg-gray-100 text-gray-500" : "bg-[#e6f6f0] text-[#00704a]"}`}>
        <span className="text-[11px] font-black uppercase">{d.toLocaleDateString(tag, { month: "short" })}</span>
        <span className="text-xl font-black leading-none">{d.getDate()}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold text-gray-900">{i.title}</span>
        <span className="block text-xs text-gray-500">{d.toLocaleString(tag, { weekday: "long", hour: "numeric", minute: "2-digit" })}</span>
        {i.summary && <span className="mt-0.5 block whitespace-pre-line text-sm text-gray-600">{i.summary}</span>}
        <ItemFooter item={i} names={names} canDelete={canDelete} />
      </span>
      {!past && i.url && (
        <a href={i.url} target="_blank" rel="noopener noreferrer" className="h-8 shrink-0 self-start rounded-lg px-3 py-1.5 text-xs font-bold text-white" style={{ background: GREEN }}>
          {t.knowledge.join}
        </a>
      )}
    </li>
  );
}

function RequestForm() {
  const { t } = useI18n();
  const k = t.knowledge;
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = getSupabase();
    if (!supabase || !topic.trim()) return;
    setBusy(true);
    const me = (await supabase.auth.getUser()).data.user?.id;
    const { error } = await supabase.from("knowledge_requests").insert({ topic: topic.trim(), details: details.trim(), requested_by: me });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(k.sent);
    setTopic("");
    setDetails("");
    router.refresh();
  };

  return (
    <form onSubmit={send} className="space-y-3">
      <p className="text-sm text-gray-500">{k.requestHint}</p>
      <input value={topic} onChange={e => setTopic(e.target.value)} maxLength={200} placeholder={k.topicPlaceholder} aria-label={k.topic} className={`${field} h-10`} />
      <textarea value={details} onChange={e => setDetails(e.target.value)} maxLength={2000} rows={3} placeholder={k.detailsPlaceholder} aria-label={k.details} className={field} />
      <div className="flex justify-end">
        <button type="submit" disabled={busy || !topic.trim()} className="flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-bold text-white disabled:opacity-50" style={{ background: GREEN }}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {k.send}
        </button>
      </div>
    </form>
  );
}

const STATUS_STYLE: Record<RequestStatus, string> = {
  open: "bg-amber-50 text-amber-800",
  planned: "bg-sky-50 text-sky-800",
  done: "bg-[#e6f6f0] text-[#00704a]",
  declined: "bg-gray-100 text-gray-500",
};

/** The viewer's own requests; editors see (and plan) everyone's. */
function Requests({ requests, canEdit, userId, userNames }: { requests: KnowledgeRequest[]; canEdit: boolean; userId: string; userNames: Record<string, string> }) {
  const { t } = useI18n();
  const k = t.knowledge;
  const router = useRouter();
  if (!requests.length) return null;

  const setStatus = async (r: KnowledgeRequest, status: RequestStatus) => {
    const supabase = getSupabase();
    if (!supabase) return;
    const { error } = await supabase.from("knowledge_requests").update({ status }).eq("id", r.id);
    if (error) return toast.error(error.message);
    router.refresh();
  };

  return (
    <div className="mt-5 border-t border-gray-100 pt-4">
      <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">{canEdit ? fmt(k.allRequests, { n: requests.length }) : k.myRequests}</p>
      <ul className="space-y-2">
        {requests.map(r => (
          <li key={r.id} className="flex items-start gap-3 text-sm">
            <span className="min-w-0 flex-1">
              <span className="block font-bold text-gray-900">{r.topic}</span>
              {r.details && <span className="block text-gray-600">{r.details}</span>}
              {canEdit && r.requested_by !== userId && r.requested_by && userNames[r.requested_by] && (
                <span className="block text-xs text-gray-400">{fmt(k.requestedBy, { name: userNames[r.requested_by] })}</span>
              )}
            </span>
            {canEdit ? (
              <select value={r.status} onChange={e => setStatus(r, e.target.value as RequestStatus)} aria-label={k.status}
                className={`h-8 rounded-full border-0 px-2 text-xs font-bold ${STATUS_STYLE[r.status]}`}>
                {REQUEST_STATUSES.map(s => <option key={s} value={s}>{k.statuses[s]}</option>)}
              </select>
            ) : (
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_STYLE[r.status]}`}>{k.statuses[r.status]}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Topics from everyone's "Ask me about", searchable, with who to talk to. */
function WhoToAsk({ data }: { data: KnowledgeData }) {
  const { t } = useI18n();
  const k = t.knowledge;
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const index = useMemo(() => askIndex(data.people), [data.people]);
  const shown = q.trim() ? index.filter(x => matchesTopic(x.topic, q)) : index.slice(0, 24);
  const open = shown.find(x => x.topic === picked) ?? (q.trim() ? shown[0] : null);

  return (
    <div>
      <p className="mb-3 text-sm text-gray-500">
        {k.askHint} <Link href="/profile" className="font-bold text-[#00704a] hover:underline">{k.askAddYours}</Link>
      </p>
      <label className="relative block sm:max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input value={q} onChange={e => { setQ(e.target.value); setPicked(null); }} placeholder={k.askSearch} aria-label={k.askSearch} className={`${field} h-10 pl-9`} />
      </label>
      {shown.length ? (
        <ul className="mt-4 flex flex-wrap gap-2">
          {shown.map(x => {
            const active = open?.topic === x.topic;
            return (
              <li key={x.topic}>
                <button type="button" onClick={() => setPicked(active ? null : x.topic)} aria-pressed={active}
                  className={`rounded-full px-3 py-1.5 text-sm font-bold ${active ? "bg-[#009f67] text-white" : "bg-[#e6f6f0] text-[#00704a] hover:bg-[#d3efe3]"}`}>
                  {x.topic} <span className={active ? "text-white/80" : "text-[#00704a]/60"}>· {x.people.length}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : <p className="mt-4 text-sm text-gray-500">{k.askEmpty}</p>}
      {open && (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {open.people.map(p => (
            <li key={p.id}>
              <Link href={`/people/${p.id}`} className="flex items-center gap-3 rounded-xl border border-gray-200 p-2.5 hover:border-[#009f67]">
                <Photo person={p} size={36} color={GREEN} />
                <span className="font-bold text-gray-900">{p.full_name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Editors: publish a pill, PK, video, study or insight. */
function AddItem({ kind, people }: { kind: KnowledgeKind; people: { id: string; full_name: string }[] }) {
  const { t } = useI18n();
  const k = t.knowledge;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [d, setD] = useState({ title: "", summary: "", url: "", when: "", presenter: "" });
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof d) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setD(x => ({ ...x, [key]: e.target.value }));
  const needsUrl = kind === "video";

  const save = async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    const url = d.url.trim();
    if (!d.title.trim()) return toast.error(k.needTitle);
    if (url && !/^https?:\/\//i.test(url)) return toast.error(k.badUrl);
    if (needsUrl && !url) return toast.error(k.badUrl);
    if (kind === "session" && !d.when) return toast.error(k.needWhen);
    setBusy(true);
    const me = (await supabase.auth.getUser()).data.user?.id;
    const { error } = await supabase.from("knowledge_items").insert({
      kind, title: d.title.trim(), summary: d.summary.trim(), url: url || null,
      event_at: kind === "session" ? new Date(d.when).toISOString() : null,
      presenter_id: d.presenter || null, created_by: me,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(k.published);
    setD({ title: "", summary: "", url: "", when: "", presenter: "" });
    setOpen(false);
    router.refresh();
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="flex h-8 items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 text-sm font-bold text-gray-700 hover:border-[#009f67] hover:text-[#00704a]">
        <Plus className="h-4 w-4" /> {k.add}
      </button>
    );
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
      <div role="dialog" aria-modal className="w-full max-w-lg space-y-3 rounded-2xl bg-white p-5 shadow-xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-black text-gray-900">{k.addKind[kind]}</h3>
        <input value={d.title} onChange={set("title")} maxLength={200} placeholder={k.fieldTitle} aria-label={k.fieldTitle} className={`${field} h-10`} autoFocus />
        <textarea value={d.summary} onChange={set("summary")} maxLength={4000} rows={kind === "pill" ? 5 : 3} placeholder={kind === "pill" ? k.pillPlaceholder : k.fieldSummary} aria-label={k.fieldSummary} className={field} />
        <input value={d.url} onChange={set("url")} placeholder={kind === "session" ? k.meetLink : kind === "video" ? k.videoLink : k.fieldUrl} aria-label={k.fieldUrl} className={`${field} h-10`} />
        <div className="grid gap-3 sm:grid-cols-2">
          {kind === "session" && (
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-gray-500">{k.when}</span>
              <input type="datetime-local" value={d.when} onChange={set("when")} className={`${field} h-10`} />
            </label>
          )}
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-gray-500">{k.presenter}</span>
            <select value={d.presenter} onChange={set("presenter")} className={`${field} h-10 bg-white`}>
              <option value="">—</option>
              {people.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={() => setOpen(false)} className="h-10 rounded-lg border border-gray-300 px-4 text-sm font-bold text-gray-700">{t.common.cancel}</button>
          <button type="button" onClick={save} disabled={busy} className="flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-bold text-white disabled:opacity-50" style={{ background: GREEN }}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {k.publish}
          </button>
        </div>
      </div>
    </div>
  );
}
