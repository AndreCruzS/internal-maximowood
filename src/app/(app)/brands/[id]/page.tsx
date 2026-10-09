import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { COMPANIES, TOOLS } from "@/lib/intranet";
import { getSupabaseServer } from "@/lib/supabase/server";
import { LINK_COLUMNS } from "@/server/links";
import { NEWS_COLUMNS, type NewsItem } from "@/server/intranet";
import { PLAYBOOK_COLUMNS, type Playbook } from "@/server/playbooks";
import BrandView, { type BrandLink, type BrandPerson } from "@/components/BrandView";
import type { LinkRow } from "@/components/resources/ResourceList";

export const dynamic = "force-dynamic";

const brand = (id: string) => COMPANIES.find(c => c.id === id);

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `${brand(id)?.name ?? "Brand"} · GMX Group Intranet` };
}

/**
 * A brand hub. Only the tagline/about and the channels & contact list are kept
 * by hand; everything else is whatever departments tag with this brand
 * (documents, brand-kit files, tools, playbooks, news) and the people who list it.
 */
export default async function BrandPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const company = brand(id);
  if (!company) notFound();

  const supabase = await getSupabaseServer();
  if (!supabase) return <BrandView brand={company} page={null} links={[]} docs={[]} tools={[]} playbooks={[]} news={[]} people={[]} error="Supabase is not configured" />;

  const [brandLinks, page, docs, playbooks, news, people] = await Promise.all([
    supabase.from("brand_links").select("id, kind, platform, label, value, sort").eq("company_id", id).order("sort"),
    supabase.from("brand_pages").select("tagline, about").eq("company_id", id).maybeSingle(),
    supabase.from("links").select(LINK_COLUMNS).eq("company_id", id).order("title"),
    supabase.from("playbooks").select(PLAYBOOK_COLUMNS).eq("company_id", id).eq("status", "published").order("title"),
    supabase.from("news").select(NEWS_COLUMNS).eq("company_id", id).order("published_at", { ascending: false }).limit(4),
    supabase
      .from("people")
      .select("id, full_name, photo_url, positions(title, department_id, sort)")
      .eq("active", true)
      .or(`company_id.eq.${id},companies.cs.{${id}}`)
      .order("full_name"),
  ]);

  const docRows = (docs.data as LinkRow[] | null) ?? [];
  return (
    <BrandView
      brand={company}
      page={(page.data as { tagline: string; about: string } | null) ?? null}
      links={(brandLinks.data as BrandLink[] | null) ?? []}
      docs={docRows.filter(l => l.kind !== "web_app")}
      tools={[
        ...TOOLS.filter(x => x.company === id).map(x => ({ name: x.name, description: x.description, href: x.href, department: x.department as string, external: !!x.external })),
        ...docRows.filter(l => l.kind === "web_app").map(l => ({ name: l.title, description: l.description, href: l.url, department: l.department_id ?? "", external: true })),
      ]}
      playbooks={(playbooks.data as Playbook[] | null) ?? []}
      news={(news.data as NewsItem[] | null) ?? []}
      people={(people.data as unknown as BrandPerson[] | null) ?? []}
      error={brandLinks.error?.message ?? null}
    />
  );
}
