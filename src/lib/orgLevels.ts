/**
 * Seniority levels for the org chart: people of the same level sit on the same row, so a
 * manager never lines up with a director. Admins can set a level; otherwise it's read from
 * the job title (EN / ES / PT).
 */
export const ORG_LEVELS = [1, 2, 3, 4, 5, 6] as const;
export type OrgLevel = (typeof ORG_LEVELS)[number];

const RULES: [OrgLevel, RegExp][] = [
  [6, /\b(estagi[aá]ri[oa]|intern|pasante|becari[oa]|trainee|aprendiz)\b/i],
  [1, /\b(ceo|coo|cco|cfo|cto|cmo|cio|s[oó]ci[oa]|partner|founder|fundador[a]?|president[ea]?|owner)\b/i],
  [2, /\b(diretor[a]?|director[a]?|vp|vice[- ]president[ea]?)\b/i],
  [3, /\b(gestor[a]?|gerente|manager|head|jef[ea])\b/i],
  [4, /\b(coordenador[a]?|coordinador[a]?|coordinator|supervisor[a]?|lead|l[ií]der|leader)\b/i],
];

/** The level a title suggests; 5 (specialist / analyst) when nothing matches. */
export function inferLevel(title: string): OrgLevel {
  for (const [level, re] of RULES) if (re.test(title)) return level;
  return 5;
}

export const levelOf = (p: { title: string; level?: number | null }): OrgLevel =>
  (p.level && ORG_LEVELS.includes(p.level as OrgLevel) ? p.level : inferLevel(p.title)) as OrgLevel;

/** Ids of a position and everything below it (it can't report to any of these). */
export function descendants(id: string, positions: { id: string; reports_to: string | null }[]): Set<string> {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of positions) if (p.reports_to && out.has(p.reports_to) && !out.has(p.id)) { out.add(p.id); grew = true; }
  }
  return out;
}
