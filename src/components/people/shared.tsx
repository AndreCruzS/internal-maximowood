import type { Person } from "@/components/PeopleView";

// One color per department (Whale-style label + card strip). Leadership = GMX green.
export const DEPT_COLOR: Record<string, string> = {
  leadership: "#009f67",
  commercial: "#e8702a",
  marketing: "#d6336c",
  operations: "#3b6fd8",
  logistics: "#0f9fb0",
  finance: "#7b4fd6",
  hr: "#d99a00",
  it: "#5b6b7a",
};
export const colorOf = (dept: string | null) => DEPT_COLOR[dept ?? "leadership"] ?? "#5b6b7a";

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join("");

/** Round photo or initials. `inverse`: white disc with colored initials (for colored backgrounds). */
export function Photo({ person, size, color, inverse }: { person: Pick<Person, "full_name" | "photo_url">; size: number; color: string; inverse?: boolean }) {
  const ring = { width: size, height: size, boxShadow: inverse ? "0 0 0 3px rgba(255,255,255,0.6)" : `0 0 0 3px #fff, 0 0 0 5px ${color}` };
  return person.photo_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={person.photo_url} alt="" className="rounded-full object-cover" style={ring} />
  ) : (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-black"
      style={{ ...ring, background: inverse ? "#fff" : color, color: inverse ? color : "#fff", fontSize: size * 0.36 }}
      aria-hidden
    >
      {initials(person.full_name)}
    </span>
  );
}

/** Slack workspace (subdomain of slack.com) used for "Message on Slack" links. */
export const SLACK_WORKSPACE = process.env.NEXT_PUBLIC_SLACK_WORKSPACE ?? "";

/** Contact links: Gmail compose, Slack profile, RingCentral call. */
export const gmailLink = (email: string) => `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}`;
export const slackLink = (memberId: string) =>
  SLACK_WORKSPACE ? `https://${SLACK_WORKSPACE}.slack.com/team/${memberId}` : `https://app.slack.com/team/${memberId}`;
export const ringCentralLink = (phone: string) => `rcapp://r/call?number=${encodeURIComponent(phone.replace(/[^\d+]/g, ""))}`;
