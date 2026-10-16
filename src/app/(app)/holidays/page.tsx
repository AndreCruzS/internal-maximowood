import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getDict } from "@/lib/i18n/server";
import { loadHolidays } from "@/server/holidays";
import { todayIn } from "@/lib/holidays";
import HolidaysView from "@/components/holidays/HolidaysView";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getDict();
  return { title: `${t.holidays.title} · GMX Group Intranet` };
}

/** HR tool: each office's holidays and opening hours, the next holiday, and the month's time off. */
export default async function HolidaysPage({ searchParams }: { searchParams: Promise<{ month?: string; calendar?: string }> }) {
  const { month: raw, calendar } = await searchParams;
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) redirect("/login");
  const month = raw && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : todayIn("America/New_York").slice(0, 7);
  const data = await loadHolidays(supabase, user, month);
  if (!data.ready) {
    const { t } = await getDict();
    return <p className="mx-auto max-w-xl rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center text-gray-600">{t.home.comingSoon}</p>;
  }
  return <HolidaysView data={data} initialCalendar={calendar ?? null} />;
}
