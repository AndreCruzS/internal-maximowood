import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { DEPARTMENTS, departmentById } from "@/lib/intranet";
import DepartmentView from "@/components/DepartmentView";

export function generateStaticParams() {
  return DEPARTMENTS.map(d => ({ id: d.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const dept = departmentById(id);
  return { title: dept ? `${dept.name} · GMX Group Intranet` : "GMX Group Intranet" };
}

export default async function DepartmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dept = departmentById(id);
  if (!dept) notFound();
  return <DepartmentView id={dept.id} />;
}
