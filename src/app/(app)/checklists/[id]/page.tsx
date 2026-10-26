import ChecklistEditor from "@/components/checklist/ChecklistEditor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Checklist · Maximo" };

export default async function ChecklistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ChecklistEditor id={id} />;
}
