/** Profile covers people pick for their page (migration 0015: people.cover). */
export const COVERS: Record<string, string> = {
  forest: "linear-gradient(135deg, #00704a 0%, #009f67 100%)",
  ocean: "linear-gradient(135deg, #0b4f8a 0%, #2573f2 100%)",
  teal: "linear-gradient(135deg, #066b78 0%, #09adbe 100%)",
  sunset: "linear-gradient(135deg, #c2410c 0%, #f6b015 100%)",
  ipe: "linear-gradient(135deg, #b88a00 0%, #f6ca21 100%)",
  berry: "linear-gradient(135deg, #8a1c4a 0%, #d6336c 100%)",
  violet: "linear-gradient(135deg, #4c2a99 0%, #7b4fd6 100%)",
  night: "linear-gradient(135deg, #111827 0%, #374151 100%)",
};
export const COVER_IDS = Object.keys(COVERS);
export const coverOf = (id: string | null | undefined) => COVERS[id ?? ""] ?? COVERS.forest;

export const AVATAR_BUCKET = "avatars";
export const MAX_AVATAR_BYTES = 3 * 1024 * 1024;

/** Accepts "linkedin.com/in/x" or a full URL; null when it isn't a LinkedIn link. */
export function normalizeLinkedIn(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  const url = /^https?:\/\//i.test(v) ? v.replace(/^http:/i, "https:") : `https://${v}`;
  return /^https:\/\/([a-z]+\.)?linkedin\.com\//i.test(url) ? url : null;
}

export const PROFILE_COLUMNS =
  "id, full_name, email, phone, location, photo_url, company_id, user_id, languages, office, birth_month, birth_day, start_date, skills, start_year, nickname, nationality, companies, slack_id, headline, bio, pronouns, interests, fun_fact, cover, linkedin";
