import Calculator from "@/components/Calculator";

export const metadata = { title: "Retail quote · GMX Group Intranet" };

export default async function CalculatorPage({
  searchParams,
}: {
  searchParams: Promise<{ quote?: string | string[] }>;
}) {
  const { quote } = await searchParams;
  return <Calculator quoteId={typeof quote === "string" ? quote : null} />;
}
