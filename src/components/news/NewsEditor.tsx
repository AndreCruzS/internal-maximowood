"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";
import { useMe } from "@/components/MeProvider";
import { COMPANIES, DEPARTMENTS } from "@/lib/intranet";
import { LOCALES, LOCALE_NAMES } from "@/lib/i18n/locale";
import { deptName } from "@/lib/i18n/text";
import type { NewsItem } from "@/server/intranet";

const field = "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-[#009f67]";
const label = "mb-1 block text-xs font-bold text-gray-500";

/** Write or edit an announcement. Admins post for anyone; a department leader posts for their department. */
export default function NewsEditor({ post }: { post: NewsItem | null }) {
  const { t, locale } = useI18n();
  const me = useMe();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [d, setD] = useState({
    title: post?.title ?? "",
    body: post?.body ?? "",
    image_url: post?.image_url ?? "",
    link_url: post?.link_url ?? "",
    company_id: post?.company_id ?? "",
    department_id: post?.department_id ?? (me.isAdmin ? "" : me.departmentId ?? ""),
    featured: post?.featured ?? false,
    must_read: post?.must_read ?? false,
    language: post?.language ?? locale,
  });
  const set = (patch: Partial<typeof d>) => setD(x => ({ ...x, ...patch }));
  const departments = me.isAdmin ? DEPARTMENTS : DEPARTMENTS.filter(x => x.id === me.departmentId);

  const save = async () => {
    const supabase = getSupabase();
    if (!supabase || !d.title.trim()) return;
    setBusy(true);
    const row = {
      title: d.title.trim(),
      body: d.body.trim(),
      image_url: d.image_url.trim() || null,
      link_url: d.link_url.trim() || null,
      company_id: d.company_id || null,
      // Leaders always post for their own department (their profile may load after the form).
      department_id: d.department_id || (me.isAdmin ? null : me.departmentId),
      featured: d.featured,
      must_read: d.must_read,
      language: d.language || null,
    };
    const res = post
      ? await supabase.from("news").update(row).eq("id", post.id).select("id").single()
      : await supabase.from("news").insert({ ...row, author_id: me.userId }).select("id").single();
    setBusy(false);
    if (res.error) return toast.error(res.error.message);
    toast.success(post ? t.news.updated : t.news.posted);
    router.push(`/news/${(res.data as { id: string }).id}`);
    router.refresh();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href={post ? `/news/${post.id}` : "/news"} className="text-sm font-bold text-[#00704a] hover:underline">{t.news.backToNews}</Link>
      <h1 className="text-2xl font-black text-gray-900">{post ? t.common.edit : t.news.newPost}</h1>
      <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div>
          <label className={label} htmlFor="n-title">{t.news.formTitle}</label>
          <input id="n-title" value={d.title} onChange={e => set({ title: e.target.value })} className={field} />
        </div>
        <div>
          <label className={label} htmlFor="n-body">{t.news.body}</label>
          <textarea id="n-body" value={d.body} onChange={e => set({ body: e.target.value })} rows={10} className="w-full rounded-lg border border-gray-300 p-3 text-sm outline-none focus:border-[#009f67]" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="n-img">{t.news.image}</label>
            <input id="n-img" value={d.image_url} onChange={e => set({ image_url: e.target.value })} placeholder="https://…" className={field} />
          </div>
          <div>
            <label className={label} htmlFor="n-link">{t.news.link}</label>
            <input id="n-link" value={d.link_url} onChange={e => set({ link_url: e.target.value })} placeholder="https://…" className={field} />
          </div>
          <div>
            <label className={label} htmlFor="n-co">{t.news.company}</label>
            <select id="n-co" value={d.company_id} onChange={e => set({ company_id: e.target.value })} className={field}>
              <option value="">{t.news.everyone}</option>
              {COMPANIES.filter(c => c.id !== "gmx").map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="n-dept">{t.news.department}</label>
            <select id="n-dept" value={d.department_id} onChange={e => set({ department_id: e.target.value })} className={field}>
              {me.isAdmin && <option value="">{t.news.allDepartments}</option>}
              {departments.map(x => <option key={x.id} value={x.id}>{deptName(t, x.id)}</option>)}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="n-lang">{t.news.language}</label>
            <select id="n-lang" value={d.language} onChange={e => set({ language: e.target.value })} className={field}>
              {LOCALES.map(l => <option key={l} value={l}>{LOCALE_NAMES[l]}</option>)}
            </select>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm font-bold text-gray-700">
          <input type="checkbox" checked={d.featured} onChange={e => set({ featured: e.target.checked })} className="h-4 w-4 accent-[#009f67]" /> {t.news.featuredLabel}
        </label>
        <label className="flex items-center gap-2 text-sm font-bold text-gray-700">
          <input type="checkbox" checked={d.must_read} onChange={e => set({ must_read: e.target.checked })} className="h-4 w-4 accent-[#009f67]" /> {t.news.mustReadLabel}
        </label>
        <div className="flex justify-end">
          <button type="button" onClick={save} disabled={busy || !d.title.trim()} className="flex h-10 items-center gap-2 rounded-lg bg-[#009f67] px-5 text-sm font-bold text-white disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {post ? t.news.saveChanges : t.news.publish}
          </button>
        </div>
      </div>
    </div>
  );
}
