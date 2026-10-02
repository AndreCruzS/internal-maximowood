import B2BCalculator from "@/components/B2BCalculator";

export default async function B2BPage({
  searchParams,
}: {
  searchParams: Promise<{ quote?: string | string[] }>;
}) {
  const { quote } = await searchParams;
  return <B2BCalculator quoteId={typeof quote === "string" ? quote : null} />;
}
