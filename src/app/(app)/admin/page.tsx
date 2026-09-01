import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import AdminUsers from "@/components/AdminUsers";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const auth = await requireAdmin();
  if (!auth.ok) redirect("/");

  return <AdminUsers />;
}
