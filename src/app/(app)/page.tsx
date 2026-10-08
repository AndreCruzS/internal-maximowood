import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin";
import Portal from "@/components/Portal";
import { getUpcomingEvents } from "@/server/calendar";

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

  // Next few weeks for "Upcoming events" (holidays + company calendar).
  const [{ events }, { data: celebrations }] = await Promise.all([
    getUpcomingEvents(),
    supabase!
      .from("people")
      .select("id, full_name, birth_month, birth_day, start_date")
      .eq("active", true)
      .or("birth_month.not.is.null,start_date.not.is.null"),
  ]);

  return (
    <Portal
      name={(user.user_metadata?.name as string | undefined) || user.email || ""}
      isAdmin={isAdminUser(user)}
      events={events}
      celebrations={celebrations ?? []}
    />
  );
}
