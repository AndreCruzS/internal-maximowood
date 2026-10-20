/**
 * First sign-in: which org-chart entries (not linked to a login yet) could be
 * this person? Seeded entries often use a nickname ("Guto Fugiwara") while the
 * person signs up with their full name ("Joao Augusto Fugiwara") and an email
 * like guto@…, so any of these counts: the same email, the same surname, or a
 * first name / nickname / email name that appears in the entry's name.
 */

export type MatchCandidate = { id: string; full_name: string; user_id: string | null; email?: string | null };
export type MatchInput = { first: string; last: string; nickname?: string; email?: string };

export const normName = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

// Name particles that say nothing on their own ("Maria da Silva").
const PARTICLES = new Set(["da", "de", "do", "das", "dos", "di", "du", "del", "la", "le", "van", "von", "e", "y"]);

const tokens = (s: string) =>
  normName(s)
    .split(/[^a-z0-9]+/)
    .filter(w => w.length >= 2 && !PARTICLES.has(w));

export function matchPeople<T extends MatchCandidate>(people: T[], me: MatchInput, limit = 4): T[] {
  const email = normName(me.email ?? "");
  const firsts = new Set([...tokens(me.first), ...tokens(me.nickname ?? ""), ...tokens(email.split("@")[0] ?? "")]);
  const lastTokens = tokens(me.last);
  const surname = lastTokens[lastTokens.length - 1];
  if (!firsts.size && !surname && !email) return [];

  const scored = people
    .filter(p => !p.user_id)
    .map(p => {
      const theirs = new Set(tokens(p.full_name));
      let score = 0;
      if (email && p.email && normName(p.email) === email) score += 10;
      if (surname && theirs.has(surname)) score += 3;
      if ([...firsts].some(w => theirs.has(w))) score += 2;
      return { p, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || a.p.full_name.localeCompare(b.p.full_name));
  return scored.slice(0, limit).map(x => x.p);
}
