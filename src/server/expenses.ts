import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  FUND_COLUMNS, RECEIPT_COLUMNS, REQUEST_COLUMNS,
  type ExpenseReceipt, type FundRequest, type RampCard, type RampFund, type RampReimbursement, type RampTxn, type ReceiptRequest,
} from "@/lib/expenses";
import { listCards, listFunds, listReimbursements, listTransactions, rampConnected } from "@/server/ramp/client";
import { demoRamp } from "@/server/ramp/demo";
import { rampUserFor } from "@/server/ramp/push";
import { selectCompat } from "@/server/compat";

export type RampMode = "live" | "demo" | "unlinked" | "error";
export type RampView = {
  mode: RampMode;
  error?: string;
  cards: RampCard[];
  funds: RampFund[];
  txns: RampTxn[];
  reimbursements: RampReimbursement[];
};

type Me = { id: string; full_name: string; email: string | null; ramp_user_id: string | null };

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

/** The viewer's Ramp: their cards, limits, last 90 days of purchases and reimbursements. Sample data until Ramp is connected. */
export async function loadMyRamp(me: Me): Promise<RampView> {
  const empty = { cards: [], funds: [], txns: [], reimbursements: [] };
  if (!rampConnected()) return { mode: "demo", ...demoRamp(me.id, me.full_name) };
  const admin = getSupabaseAdmin();
  try {
    const userId = admin ? await rampUserFor(admin, me) : me.ramp_user_id;
    if (!userId) return { mode: "unlinked", ...empty };
    const cards = await listCards(userId);
    const [txns, funds, reimbursements] = await Promise.all([
      listTransactions(userId, daysAgo(90), cards),
      listFunds(userId).catch(() => [] as RampFund[]),
      listReimbursements(userId).catch(() => [] as RampReimbursement[]),
    ]);
    return { mode: "live", cards, funds, txns, reimbursements };
  } catch (e) {
    return { mode: "error", error: e instanceof Error ? e.message : String(e), ...empty };
  }
}

/** Purchases on someone's cards that still need a receipt, for whoever used the card. */
export async function cardPurchasesNeedingReceipt(person: Me): Promise<RampTxn[]> {
  const view = await loadMyRamp(person);
  return view.txns.filter(t => t.receiptCount === 0 && !["DECLINED", "ERROR"].includes(t.state)).slice(0, 30);
}

export type PersonPick = { id: string; full_name: string; photo_url: string | null };

/** Everything for /expenses. Empty lists before migration 0018. */
export async function loadExpenses(supabase: SupabaseClient, user: User) {
  const [meRes, finance, people] = await Promise.all([
    selectCompat(
      cols => supabase.from("people").select(cols).eq("user_id", user.id).maybeSingle(),
      "id, full_name, email, ramp_user_id",
      "id, full_name, email",
    ),
    supabase.rpc("is_finance"),
    supabase.from("people").select("id, full_name, photo_url").eq("active", true).order("full_name"),
  ]);
  const found = meRes.data as (Omit<Me, "ramp_user_id"> & { ramp_user_id?: string | null }) | null;
  const me: Me | null = found ? { ...found, ramp_user_id: found.ramp_user_id ?? null } : null;
  const isFinance = finance.data === true;

  const [ramp, receipts, asked, mine, funds] = await Promise.all([
    me ? loadMyRamp(me) : Promise.resolve<RampView>({ mode: "unlinked", cards: [], funds: [], txns: [], reimbursements: [] }),
    me ? supabase.from("expense_receipts").select(RECEIPT_COLUMNS).or(`uploaded_by.eq.${user.id},owner_person_id.eq.${me.id}`).order("created_at", { ascending: false }).limit(100) : null,
    me ? supabase.from("receipt_requests").select(REQUEST_COLUMNS).eq("asked_person_id", me.id).eq("status", "open").order("created_at") : null,
    me ? supabase.from("receipt_requests").select(REQUEST_COLUMNS).eq("owner_person_id", me.id).neq("status", "cancelled").order("created_at", { ascending: false }).limit(50) : null,
    me ? supabase.from("fund_requests").select(FUND_COLUMNS).eq("requester_person_id", me.id).order("created_at", { ascending: false }).limit(50) : null,
  ]);

  let financeData: Awaited<ReturnType<typeof loadFinance>> | null = null;
  if (isFinance) financeData = await loadFinance(supabase);

  return {
    me,
    isFinance,
    connected: rampConnected(),
    ramp,
    people: (people.data as PersonPick[] | null) ?? [],
    receipts: (receipts?.data as ExpenseReceipt[] | null) ?? [],
    askedOfMe: (asked?.data as ReceiptRequest[] | null) ?? [],
    myRequests: (mine?.data as ReceiptRequest[] | null) ?? [],
    fundRequests: (funds?.data as FundRequest[] | null) ?? [],
    finance: financeData,
  };
}

/** Finance: what's waiting for Ramp, fund requests, and people leaving who still have Ramp. */
async function loadFinance(supabase: SupabaseClient) {
  const [queue, funds, leaving, linked] = await Promise.all([
    supabase.from("expense_receipts").select(RECEIPT_COLUMNS).in("status", ["queued", "failed"]).order("created_at").limit(100),
    supabase.from("fund_requests").select(FUND_COLUMNS).in("status", ["submitted", "sent", "demo"]).order("created_at").limit(100),
    supabase.from("offboardings").select("id, person_id, last_day").eq("status", "requested").order("last_day"),
    supabase.from("people").select("id", { count: "exact", head: true }).not("ramp_user_id", "is", null),
  ]);
  return {
    queue: (queue.data as ExpenseReceipt[] | null) ?? [],
    funds: (funds.data as FundRequest[] | null) ?? [],
    leaving: (leaving.data as { id: string; person_id: string; last_day: string }[] | null) ?? [],
    linkedPeople: linked.count ?? 0,
  };
}

export type ExpensesData = Awaited<ReturnType<typeof loadExpenses>>;
