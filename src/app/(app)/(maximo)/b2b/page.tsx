import B2BCalculator from "@/components/B2BCalculator";

export const metadata = { title: "B2B quote · GMX Group Intranet" };

export default async function B2BPage({
  searchParams,
}: {
  searchParams: Promise<{ quote?: string | string[] }>;
}) {
  const { quote } = await searchParams;
  return <B2BCalculator quoteId={typeof quote === "string" ? quote : null} />;
}
