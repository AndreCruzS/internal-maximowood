import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin";
import Profile from "@/components/Profile";
import { PROFILE_COLUMNS } from "@/lib/profile";

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
    .select(`${PROFILE_COLUMNS}, positions(department_id, sort)`)
    .eq("user_id", user.id)
    .maybeSingle();
  const positions = ((person as { positions?: { department_id: string | null; sort: number }[] } | null)?.positions ?? []).sort((a, b) => a.sort - b.sort);

  return (
    <Profile
      initialTab={isAdmin && tab === "admin" ? "admin" : "profile"}
      person={person ?? null}
      department={positions[0]?.department_id ?? null}
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
