"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";
import { useMe } from "@/components/MeProvider";
import { plural } from "@/lib/i18n/dictionaries";
import { priorityOf } from "@/lib/news";
import FeedPost, { type Comment, type FeedPerson, type Reaction } from "@/components/news/FeedPost";
import type { NewsItem } from "@/server/intranet";

/** One post on its own page: the full post with comments open, and for its managers who has confirmed a must-read. */
export default function NewsDetail({ post, people, confirmed, reactions, comments, commentsOn, reads }: {
  post: NewsItem;
  people: Record<string, FeedPerson>;
  confirmed: boolean;
  reactions: Reaction[];
  comments: Comment[];
  commentsOn: boolean;
  reads: { user_id: string; read_at: string }[];
}) {
  const { t } = useI18n();
  const me = useMe();
  const router = useRouter();
  const [showReaders, setShowReaders] = useState(false);
  const canEdit = me.canManage(post.department_id) || (!!me.userId && post.author_id === me.userId && me.role !== "member");

  const remove = async () => {
    const supabase = getSupabase();
    if (!supabase || !window.confirm(t.news.deleteConfirm)) return;
    const { error } = await supabase.from("news").delete().eq("id", post.id);
    if (error) return toast.error(error.message);
    toast.success(t.news.deleted);
    router.push("/news");
    router.refresh();
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/news" className="text-sm font-bold text-[#00704a] hover:underline">{t.news.backToNews}</Link>
      <FeedPost post={post} people={people} confirmed={confirmed} reactions={reactions} comments={comments} commentsOn={commentsOn} detail />

      {priorityOf(post) === "critical" && canEdit && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm shadow-sm">
          <button type="button" onClick={() => setShowReaders(v => !v)} aria-expanded={showReaders} className="flex items-center gap-2 font-bold text-gray-800 hover:underline">
            <Users className="h-4 w-4 text-[#00704a]" /> {plural(t.news, "readBy", reads.length)}
          </button>
          {showReaders && (
            <ul className="mt-3 columns-2 text-gray-700 sm:columns-3">
              {reads.map(r => <li key={r.user_id}>{people[r.user_id]?.name ?? "—"}</li>)}
            </ul>
          )}
        </div>
      )}

      {canEdit && (
        <div className="flex gap-2">
          <Link href={`/news/${post.id}/edit`} className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-bold text-gray-700 hover:bg-gray-50">
            <Pencil className="h-4 w-4" /> {t.common.edit}
          </Link>
          <button type="button" onClick={remove} className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-bold text-red-700 hover:bg-red-50">
            <Trash2 className="h-4 w-4" /> {t.common.delete}
          </button>
        </div>
      )}
    </div>
  );
}
