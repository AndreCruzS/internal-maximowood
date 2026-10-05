import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin";
import Portal from "@/components/Portal";

export const dynamic = "force-dynamic";

export default async function PortalPage({
  searchParams,
}: {
  searchParams: Promise<{ quote?: string | string[] }>;
}) {
  // The calculator used to live at "/" — keep old `/?quote=<id>` links working.
  const { quote } = await searchParams;
  if (typeof quote === "string") redirect(`/calculator?quote=${encodeURIComponent(quote)}`);

  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!user) redirect("/login");

  return (
    <Portal
      userId={user.id}
      name={(user.user_metadata?.name as string | undefined) || user.email || ""}
      isAdmin={isAdminUser(user)}
    />
  );
}
