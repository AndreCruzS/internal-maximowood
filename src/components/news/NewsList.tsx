"use client";

import Link from "next/link";
import { BellRing, CheckCircle2, Newspaper, Plus } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { useMe } from "@/components/MeProvider";
import { companyName, type CompanyId } from "@/lib/intranet";
import { deptName } from "@/lib/i18n/text";
import { fmt } from "@/lib/i18n/locale";
import type { NewsItem } from "@/server/intranet";

export function NewsTags({ n }: { n: NewsItem }) {
  const { t } = useI18n();
  return (
    <span className="flex flex-wrap gap-1.5 text-[11px] font-bold">
      {n.must_read && <span className="flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-amber-800"><BellRing className="h-3 w-3" /> {t.news.mustRead}</span>}
      {n.featured && <span className="rounded bg-[#e6f6f0] px-1.5 py-0.5 text-[#00704a]">{t.news.featured}</span>}
      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">{n.company_id ? companyName(n.company_id as CompanyId) : "GMX Group"}</span>
      {n.department_id && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">{deptName(t, n.department_id)}</span>}
      {n.language && <span className="rounded bg-gray-100 px-1.5 py-0.5 uppercase text-gray-500">{n.language}</span>}
    </span>
  );
}

/** All announcements, newest first; must-read ones show whether you've confirmed them. */
export default function NewsList({ news, readIds, authors, mustReadOnly, error }: {
  news: NewsItem[];
  readIds: string[];
  authors: Record<string, string>;
  mustReadOnly: boolean;
  error: string | null;
}) {
  const { t, tag } = useI18n();
  const me = useMe();
  const canPost = me.isAdmin || me.role === "leader";
  const read = new Set(readIds);
  const list = mustReadOnly ? news.filter(n => n.must_read) : news;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900">{t.news.title}</h1>
          <p className="text-gray-500">{t.news.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 bg-white p-0.5 text-sm font-bold">
            <Link href="/news" className={`rounded-md px-3 py-1.5 ${!mustReadOnly ? "bg-[#009f67] text-white" : "text-gray-500"}`}>{t.common.all}</Link>
            <Link href="/news?filter=must-read" className={`rounded-md px-3 py-1.5 ${mustReadOnly ? "bg-[#009f67] text-white" : "text-gray-500"}`}>{t.news.mustRead}</Link>
          </div>
          {canPost && (
            <Link href="/news/new" className="flex h-9 items-center gap-1.5 rounded-lg bg-[#009f67] px-4 text-sm font-bold text-white">
              <Plus className="h-4 w-4" /> {t.news.newPost}
            </Link>
          )}
        </div>
      </div>
      {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{fmt(t.common.couldntLoad, { error })}</p>}
      {list.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white py-16 text-sm text-gray-400">
          <Newspaper className="h-7 w-7" /> {t.news.empty}
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {list.map(n => (
            <li key={n.id}>
              <Link href={`/news/${n.id}`} className="flex h-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md">
                {n.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={n.image_url} alt="" className="h-40 w-full object-cover" />
                )}
                <div className="flex flex-1 flex-col gap-2 p-5">
                  <NewsTags n={n} />
                  <p className="text-lg font-black leading-snug text-gray-900">{n.title}</p>
                  <p className="line-clamp-3 text-sm text-gray-600">{n.body}</p>
                  <p className="mt-auto flex items-center justify-between pt-2 text-xs text-gray-400">
                    <span>
                      {new Date(n.published_at).toLocaleDateString(tag, { month: "short", day: "numeric", year: "numeric" })}
                      {n.author_id && authors[n.author_id] ? ` · ${fmt(t.news.by, { name: authors[n.author_id] })}` : ""}
                    </span>
                    {n.must_read && read.has(n.id) && <span className="flex items-center gap-1 font-bold text-[#00704a]"><CheckCircle2 className="h-3.5 w-3.5" /> {t.news.confirmed}</span>}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
