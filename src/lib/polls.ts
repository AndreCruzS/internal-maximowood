/** Quick polls (migration 0015). Votes are private; only totals come back from poll_results. */
export type Poll = {
  id: string;
  question: string;
  options: string[];
  multiple: boolean;
  closes_at: string | null;
  created_by: string | null;
  created_at: string;
};
export type PollResults = { voters: number; counts: number[] };
export type PollWithVotes = Poll & { mine: number[] | null; results: PollResults };

export const POLL_COLUMNS = "id, question, options, multiple, closes_at, created_by, created_at";

export const isOpen = (p: Pick<Poll, "closes_at">, now = Date.now()) => !p.closes_at || new Date(p.closes_at).getTime() > now;

/** Whole-number percentages of voters (multiple-choice polls can add up to more than 100). */
export const percents = (r: PollResults) => r.counts.map(c => (r.voters ? Math.round((c / r.voters) * 100) : 0));
