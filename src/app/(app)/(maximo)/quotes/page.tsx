import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin";
import MyQuotes from "@/components/MyQuotes";

export const dynamic = "force-dynamic";
export const metadata = { title: "My Quotes · GMX Group Intranet" };

/** Saved calculator quotes — part of the Maximo tools, not the personal profile. */
export default async function QuotesPage() {
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!user) redirect("/login");
  return (
    <MyQuotes
      account={{
        id: user.id,
        email: user.email ?? "",
        name: (user.user_metadata?.name as string | undefined) ?? "",
        createdAt: user.created_at,
        lastSignInAt: user.last_sign_in_at ?? null,
        isAdmin: isAdminUser(user),
      }}
    />
  );
}
