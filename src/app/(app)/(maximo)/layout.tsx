import Link from "next/link";
import { getDict } from "@/lib/i18n/server";
import { deptName } from "@/lib/i18n/text";
import SalesTabs from "@/components/sales/SalesTabs";

/** Maximo's sales tools (quotes, pricing, inventory) inside the GMX intranet, in GMX branding. */
export default async function MaximoToolsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { t } = await getDict();
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-gray-500">
          <Link href="/departments/commercial" className="hover:text-gray-900 hover:underline">
            {deptName(t, "commercial")}
          </Link>
          <span className="mx-1.5">›</span>
          <span className="font-bold text-gray-700">Maximo</span>
        </p>
        <SalesTabs />
      </div>
      {children}
    </div>
  );
}
