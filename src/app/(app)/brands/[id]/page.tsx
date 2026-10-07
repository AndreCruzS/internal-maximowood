import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { COMPANIES } from "@/lib/intranet";
import { getSupabaseServer } from "@/lib/supabase/server";
import BrandView, { type BrandLink } from "@/components/BrandView";

export const dynamic = "force-dynamic";

const brand = (id: string) => COMPANIES.find(c => c.id === id);

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `${brand(id)?.name ?? "Brand"} · GMX Group Intranet` };
}

export default async function BrandPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const company = brand(id);
  if (!company) notFound();

  const supabase = await getSupabaseServer();
  const { data, error } = supabase
    ? await supabase.from("brand_links").select("id, kind, platform, label, value, sort").eq("company_id", id).order("sort")
    : { data: null, error: { message: "Supabase is not configured" } };

  return <BrandView name={company.name} links={(data as BrandLink[] | null) ?? []} error={error?.message ?? null} />;
}
