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

  return (
    <Profile
      initialTab={isAdmin && tab === "admin" ? "admin" : "profile"}
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
