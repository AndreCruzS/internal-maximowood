import type { SupabaseClient, User } from "@supabase/supabase-js";
import { TRAVEL_COLUMNS, type TravelEvent, type TravelFile, type TravelRequest } from "@/lib/travel";

export type TravelPolicy = { id: string; title: string; version: number; ackVersion: number } | null;
export type TravelData = {
  ready: boolean;
  me: { personId: string | null; department: string | null };
  policy: TravelPolicy;
  /** The viewer's confirmation of the current policy version, if any. */
  myAck: { version: number; acked_at: string } | null;
  /** They confirmed an older version (so they must read it again). */
  ackOutdated: boolean;
  people: { id: string; full_name: string; user_id: string | null }[];
  mine: TravelRequest[];
  isProcurement: boolean;
  queue: TravelRequest[];
  internal: Record<string, string>;
  events: TravelEvent[];
  files: TravelFile[];
};

/** The travel policy playbook set in app_settings (migration 0021). */
export async function travelPolicyId(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase.from("app_settings").select("value").eq("key", "travel_policy").maybeSingle();
  return ((data as { value: { playbook_id?: string } } | null)?.value?.playbook_id as string | undefined) ?? null;
}

export async function loadTravel(supabase: SupabaseClient, user: User): Promise<TravelData> {
  const [policyId, procurement, people, me, mine] = await Promise.all([
    travelPolicyId(supabase),
    supabase.rpc("is_procurement"),
    supabase.from("people").select("id, full_name, user_id").eq("active", true).order("full_name"),
    supabase.from("people").select("id, positions(department_id, sort)").eq("user_id", user.id).maybeSingle(),
    supabase.from("travel_requests").select(TRAVEL_COLUMNS).eq("requester_id", user.id).order("created_at", { ascending: false }).limit(100),
  ]);
  const ready = !mine.error;
  const isProcurement = procurement.data === true;

  const [policyRow, ack, anyAck, queue] = await Promise.all([
    policyId ? supabase.from("playbooks").select("id, title, version, ack_version, status").eq("id", policyId).maybeSingle() : Promise.resolve({ data: null }),
    supabase.rpc("my_travel_policy_ack"),
    policyId ? supabase.from("playbook_acks").select("version").eq("playbook_id", policyId).eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
    isProcurement
      ? supabase.from("travel_requests").select(TRAVEL_COLUMNS).order("created_at", { ascending: false }).limit(300)
      : Promise.resolve({ data: [] }),
  ]);
  const pr = policyRow.data as { id: string; title: string; version: number; ack_version: number; status: string } | null;
  const policy: TravelPolicy = pr && pr.status === "published" ? { id: pr.id, title: pr.title, version: pr.version, ackVersion: pr.ack_version } : null;
  const myAck = ((ack.data as { version: number; acked_at: string }[] | null) ?? [])[0] ?? null;

  const mineRows = (mine.data as TravelRequest[] | null) ?? [];
  const queueRows = (queue.data as TravelRequest[] | null) ?? [];
  const ids = [...new Set([...mineRows, ...queueRows].map(r => r.id))];
  const [events, files, internal] = ids.length
    ? await Promise.all([
        supabase.from("travel_request_events").select("id, request_id, kind, from_status, to_status, note, by_user, at").in("request_id", ids).order("at"),
        supabase.from("travel_request_files").select("id, request_id, kind, path, name, created_at").in("request_id", ids).order("created_at"),
        isProcurement ? supabase.from("travel_internal").select("request_id, notes").in("request_id", ids) : Promise.resolve({ data: [] }),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  const positions = ((me.data as { id: string; positions: { department_id: string | null; sort: number }[] } | null)?.positions ?? []).slice().sort((a, b) => a.sort - b.sort);
  return {
    ready,
    me: { personId: (me.data as { id: string } | null)?.id ?? null, department: positions.find(p => p.department_id)?.department_id ?? null },
    policy,
    myAck: policy ? myAck : null,
    ackOutdated: Boolean(policy && !myAck && anyAck.data),
    people: (people.data as { id: string; full_name: string; user_id: string | null }[] | null) ?? [],
    mine: mineRows,
    isProcurement,
    queue: queueRows,
    internal: Object.fromEntries(((internal.data as { request_id: string; notes: string }[] | null) ?? []).map(r => [r.request_id, r.notes])),
    events: (events.data as TravelEvent[] | null) ?? [],
    files: (files.data as TravelFile[] | null) ?? [],
  };
}
