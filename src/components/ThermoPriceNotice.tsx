import { CalendarClock, ExternalLink } from "lucide-react";
import { THERMO_2027_SHEET_URL, thermo2027InEffect } from "@/lib/thermoPriceList";

/** The Thermowood distributor price list update (Sep 21), valid from Dec 21. */
export default function ThermoPriceNotice() {
  const live = thermo2027InEffect();
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <CalendarClock className="h-4 w-4 shrink-0" />
      <p className="flex-1 min-w-[200px]">
        {live
          ? <>New Thermowood distributor price list in effect since <b>Dec 21, 2026</b>. Thermo prices here use it.</>
          : <>On <b>Sep 21</b> we updated the Thermowood distributor price list. The new prices are valid from <b>Dec 21, 2026</b>; until then, current prices apply.</>}
      </p>
      <a href={THERMO_2027_SHEET_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold underline">
        New price sheet <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}
