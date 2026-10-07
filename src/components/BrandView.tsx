import { ArrowUpRight, AtSign, Clock, Globe, Link2, MapPin, Megaphone, Phone, Rocket } from "lucide-react";

export type BrandLink = {
  id: string;
  kind: "website" | "landing" | "social" | "phone" | "email" | "address" | "hours" | "other";
  platform: string | null;
  label: string;
  value: string;
  sort: number;
};

const SOCIAL_NAMES: Record<string, string> = {
  instagram: "Instagram", facebook: "Facebook", linkedin: "LinkedIn", youtube: "YouTube",
  tiktok: "TikTok", pinterest: "Pinterest", x: "X", whatsapp: "WhatsApp",
};

const host = (url: string) => {
  try {
    return new URL(url).host.replace(/^www\./, "") + new URL(url).pathname.replace(/\/$/, "");
  } catch {
    return url;
  }
};

function LinkList({ links }: { links: BrandLink[] }) {
  return (
    <ul className="divide-y divide-gray-100">
      {links.map(l => (
        <li key={l.id}>
          <a href={l.value} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-3 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-gray-900 group-hover:text-[#00704a]">
                {l.kind === "social" ? SOCIAL_NAMES[l.platform ?? ""] ?? l.label : l.label}
              </span>
              <span className="block truncate text-xs text-gray-400">{host(l.value)}</span>
            </span>
            <ArrowUpRight className="h-4 w-4 shrink-0 text-gray-300 group-hover:text-gray-500" />
          </a>
        </li>
      ))}
    </ul>
  );
}

function Card({ title, icon, empty, children }: { title: string; icon: React.ReactNode; empty?: boolean; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-2 flex items-center gap-2 font-black text-gray-900">
        <span className="text-[#00704a]">{icon}</span>
        {title}
      </h2>
      {empty ? <p className="py-2 text-sm text-gray-400">Nothing added yet.</p> : children}
    </section>
  );
}

/** One brand: websites, landing pages, social media, contact details, other links. */
export default function BrandView({ name, links, error }: { name: string; links: BrandLink[]; error: string | null }) {
  const of = (...kinds: BrandLink["kind"][]) => links.filter(l => kinds.includes(l.kind));
  const CONTACT_ORDER = ["email", "phone", "address", "hours"];
  const contact = of("phone", "email", "address", "hours").sort(
    (a, b) => CONTACT_ORDER.indexOf(a.kind) - CONTACT_ORDER.indexOf(b.kind) || a.sort - b.sort,
  );
  const icon = { phone: Phone, email: AtSign, address: MapPin, hours: Clock } as const;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-black uppercase tracking-widest text-gray-400">Brand</p>
        <h1 className="text-3xl font-black text-gray-900">{name}</h1>
      </div>
      {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">Couldn&apos;t load this brand: {error}</p>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Websites" icon={<Globe className="h-4 w-4" />} empty={!of("website").length}>
          <LinkList links={of("website")} />
        </Card>
        <Card title="Landing pages" icon={<Rocket className="h-4 w-4" />} empty={!of("landing").length}>
          <LinkList links={of("landing")} />
        </Card>
        <Card title="Social media" icon={<Megaphone className="h-4 w-4" />} empty={!of("social").length}>
          <LinkList links={of("social")} />
        </Card>
        <Card title="Contact" icon={<Phone className="h-4 w-4" />} empty={!contact.length}>
          <ul className="divide-y divide-gray-100">
            {contact.map(l => {
              const Icon = icon[l.kind as keyof typeof icon];
              const href = l.kind === "phone" ? `tel:${l.value.replace(/[^\d+]/g, "")}` : l.kind === "email" ? `mailto:${l.value}` : null;
              return (
                <li key={l.id} className="flex items-start gap-3 py-2.5 text-sm">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <span className="w-36 shrink-0 font-bold text-gray-700">{l.label}</span>
                  {href ? (
                    <a href={href} className="text-gray-900 hover:text-[#00704a] hover:underline">{l.value}</a>
                  ) : (
                    <span className="text-gray-900">{l.value}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      {of("other").length > 0 && (
        <Card title="Other links" icon={<Link2 className="h-4 w-4" />}>
          <LinkList links={of("other")} />
        </Card>
      )}
    </div>
  );
}
