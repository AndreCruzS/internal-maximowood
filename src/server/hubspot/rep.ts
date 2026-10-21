import type { User } from "@supabase/supabase-js";

/** The signed-in rep as they appear on the email and in HubSpot. */
export function repOf(user: User): { email: string; name: string } {
  const email = (user.email ?? "").toLowerCase();
  const name = ((user.user_metadata?.name as string | undefined) ?? "").trim() || email.split("@")[0];
  return { email, name };
}
