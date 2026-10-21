import type { SupabaseClient, User } from "@supabase/supabase-js";
import { TIME_OFF_COLUMNS, parseHrPay, type HrPaySettings, type TimeOffRow } from "@/lib/timeOff";

export type TimeOffData = {
  /** False until migration 0024 is applied. */
  ready: boolean;
  myPersonId: string | null;
  /** My time off: pending, upcoming and the last 12 months. */
  mine: TimeOffRow[];
  /** Pending requests I can decide (I'm their manager, or HR). */
  toApprove: TimeOffRow[];
  people: { id: string; full_name: string; photo_url: string | null }[];
  hrPay: HrPaySettings;
  canEditHrPay: boolean;
  approvalKinds: string[];
};

/** Everything the Time off & Pay page shows, read with the viewer's session (RLS decides who sees what). */
export async function loadTimeOff(supabase: SupabaseClient, user: User): Promise<TimeOffData> {
  const since = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
  const [people, settings, editor] = await Promise.all([
    supabase.from("people").select("id, full_name, photo_url, user_id").eq("active", true).order("full_name"),
    supabase.from("app_settings").select("key, value").in("key", ["hr_pay", "time_off"]),
    supabase.rpc("is_hr_editor"),
  ]);
  const rows = (people.data as { id: string; full_name: string; photo_url: string | null; user_id: string | null }[] | null) ?? [];
  const me = rows.find(p => p.user_id === user.id) ?? null;
  const value = (key: string) => ((settings.data as { key: string; value: unknown }[] | null) ?? []).find(s => s.key === key)?.value;
  const kinds = (value("time_off") as { approval_kinds?: unknown } | undefined)?.approval_kinds;

  const [mine, pending] = await Promise.all([
    me
      ? supabase.from("absences").select(TIME_OFF_COLUMNS).eq("person_id", me.id).gte("ends_on", since).order("starts_on", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    supabase.from("absences").select(TIME_OFF_COLUMNS).eq("status", "pending").order("starts_on"),
  ]);
  const missing = (e: { code?: string } | null) => !!e && ["42703", "PGRST204"].includes(e.code ?? "");

  return {
    ready: !missing(mine.error) && !missing(pending.error),
    myPersonId: me?.id ?? null,
    mine: (mine.data as TimeOffRow[] | null) ?? [],
    // RLS only returns other people's pending time off to their managers and HR.
    toApprove: ((pending.data as TimeOffRow[] | null) ?? []).filter(a => a.person_id !== me?.id),
    people: rows.map(({ id, full_name, photo_url }) => ({ id, full_name, photo_url })),
    hrPay: parseHrPay(value("hr_pay")),
    canEditHrPay: editor.data === true,
    approvalKinds: Array.isArray(kinds) ? kinds.filter((k): k is string => typeof k === "string") : ["vacation"],
  };
}
