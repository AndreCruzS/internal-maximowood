import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getDict } from "@/lib/i18n/server";
import { loadExpenses } from "@/server/expenses";
import { rampConnected } from "@/server/ramp/client";
import ExpensesView, { type ExpensesTab } from "@/components/expenses/ExpensesView";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getDict();
  return { title: `${t.expenses.title} · GMX Group Intranet` };
}

const TABS: ExpensesTab[] = ["todo", "upload", "reimbursements", "funds", "finance"];

/**
 * Expenses, connected to Ramp. Until the Ramp API is connected it runs on sample
 * data and only Finance and admins see it.
 */
export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) redirect("/login");
  if (!rampConnected() && (await supabase.rpc("is_finance")).data !== true) {
    const { t } = await getDict();
    return <p className="mx-auto max-w-xl rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center text-gray-600">{t.expenses.comingSoon}</p>;
  }
  const { tab: raw } = await searchParams;
  const data = await loadExpenses(supabase, user);
  const tab = TABS.includes(raw as ExpensesTab) && (raw !== "finance" || data.isFinance) ? (raw as ExpensesTab) : "todo";
  return <ExpensesView data={data} tab={tab} />;
}
