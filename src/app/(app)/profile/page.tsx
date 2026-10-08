import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin";
import Profile from "@/components/Profile";

export const dynamic = "force-dynamic";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { tab } = await searchParams;
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!user) redirect("/login");

  const isAdmin = isAdminUser(user);
  const { data: person } = await supabase!
    .from("people")
    .select("id, full_name, phone, languages, office, birth_month, birth_day, start_date, skills")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <Profile
      initialTab={isAdmin && tab === "admin" ? "admin" : "profile"}
      person={person ?? null}
      account={{
        id: user.id,
        email: user.email ?? "",
        name: (user.user_metadata?.name as string | undefined) ?? "",
        createdAt: user.created_at,
        lastSignInAt: user.last_sign_in_at ?? null,
        isAdmin,
      }}
    />
  );
}
