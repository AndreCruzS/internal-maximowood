import type { SupabaseClient, User } from "@supabase/supabase-js";
import { REFERRAL_COLUMNS, ROLE_COLUMNS, type OpenRole, type Referral } from "@/lib/referrals";

export type ReferData = {
  ready: boolean;
  program: { reward: string; review: string };
  roles: OpenRole[];
  mine: Referral[];
  isRecruiting: boolean;
  all: Referral[];
  notes: Record<string, string>;
  names: Record<string, string>;
};

export async function loadReferrals(supabase: SupabaseClient, user: User): Promise<ReferData> {
  const [settings, roles, mine, recruiting, people] = await Promise.all([
    supabase.from("app_settings").select("value").eq("key", "referral_program").maybeSingle(),
    supabase.from("open_roles").select(ROLE_COLUMNS).order("sort").order("title"),
    supabase.from("referrals").select(REFERRAL_COLUMNS).eq("referrer_id", user.id).order("created_at", { ascending: false }),
    supabase.rpc("is_recruiting"),
    supabase.from("people").select("id, full_name"),
  ]);
  const isRecruiting = recruiting.data === true;
  const [all, notes] = isRecruiting
    ? await Promise.all([
        supabase.from("referrals").select(REFERRAL_COLUMNS).order("created_at", { ascending: false }).limit(500),
        supabase.from("referral_internal").select("referral_id, notes"),
      ])
    : [{ data: [] }, { data: [] }];
  const program = (settings.data as { value: { reward?: string; review?: string } } | null)?.value ?? {};
  return {
    ready: !mine.error,
    program: { reward: program.reward ?? "", review: program.review ?? "" },
    roles: (roles.data as OpenRole[] | null) ?? [],
    mine: (mine.data as Referral[] | null) ?? [],
    isRecruiting,
    all: (all.data as Referral[] | null) ?? [],
    notes: Object.fromEntries(((notes.data as { referral_id: string; notes: string }[] | null) ?? []).map(n => [n.referral_id, n.notes])),
    names: Object.fromEntries(((people.data as { id: string; full_name: string }[] | null) ?? []).map(p => [p.id, p.full_name])),
  };
}
