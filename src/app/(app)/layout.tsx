import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import ErrorBoundary from "@/components/ErrorBoundary";
import { getSupabaseServer } from "@/lib/supabase/server";

export default async function AppGroupLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // First sign-in: the welcome questionnaire comes before the portal.
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (supabase && user) {
    await supabase.rpc("ensure_my_profile");
    const { data, error } = await supabase.from("profiles").select("onboarded_at").eq("user_id", user.id).maybeSingle();
    // Fails open (e.g. before the 0007 migration) so the portal never locks people out.
    if (!error && data && !data.onboarded_at) redirect("/welcome");
  }
  return (
    <ErrorBoundary>
      <AppShell>{children}</AppShell>
    </ErrorBoundary>
  );
}
