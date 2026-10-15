import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { selectCompat } from "@/server/compat";
import { cardPurchasesNeedingReceipt } from "@/server/expenses";

export const dynamic = "force-dynamic";

/**
 * For someone who used a colleague's card: that card's purchases still missing a
 * receipt (merchant, amount, date only), so they can pick the right one.
 */
export async function GET(request: NextRequest) {
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = request.nextUrl.searchParams.get("person") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const { data } = await selectCompat(
    cols => supabase.from("people").select(cols).eq("id", id).eq("active", true).maybeSingle(),
    "id, full_name, email, ramp_user_id",
    "id, full_name, email",
  );
  const p = data as { id: string; full_name: string; email: string | null; ramp_user_id?: string | null } | null;
  if (!p) return NextResponse.json({ purchases: [] });
  const purchases = await cardPurchasesNeedingReceipt({ ...p, ramp_user_id: p.ramp_user_id ?? null });
  return NextResponse.json({
    purchases: purchases.map(t => ({ id: t.id, merchant: t.merchant, amount: t.amount, currency: t.currency, at: t.at, cardLast4: t.cardLast4 })),
  });
}
