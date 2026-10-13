import type { SupabaseClient } from "@supabase/supabase-js";
import { POLL_COLUMNS, type Poll, type PollResults, type PollWithVotes } from "@/lib/polls";

/** Polls with the viewer's own vote and the totals. Empty before migration 0015. */
export async function loadPolls(supabase: SupabaseClient, userId: string, { openOnly = false, limit = 50 } = {}): Promise<PollWithVotes[]> {
  let q = supabase.from("polls").select(POLL_COLUMNS).order("created_at", { ascending: false }).limit(limit);
  if (openOnly) q = q.or(`closes_at.is.null,closes_at.gt.${new Date().toISOString()}`);
  const { data } = await q;
  const polls = (data as Poll[] | null) ?? [];
  if (!polls.length) return [];
  const [votes, results] = await Promise.all([
    supabase.from("poll_votes").select("poll_id, choices").eq("user_id", userId).in("poll_id", polls.map(p => p.id)),
    Promise.all(polls.map(p => supabase.rpc("poll_results", { poll: p.id }))),
  ]);
  const mine = new Map(((votes.data as { poll_id: string; choices: number[] }[] | null) ?? []).map(v => [v.poll_id, v.choices]));
  return polls.map((p, i) => ({
    ...p,
    mine: mine.get(p.id) ?? null,
    results: (results[i].data as PollResults | null) ?? { voters: 0, counts: p.options.map(() => 0) },
  }));
}
