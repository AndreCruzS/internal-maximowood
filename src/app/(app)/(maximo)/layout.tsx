import Link from "next/link";
import { getDict } from "@/lib/i18n/server";
import { deptName, toolText } from "@/lib/i18n/text";
import { TOOLS } from "@/lib/intranet";

/**
 * Maximo's own tools (calculators, pricing, inventory) inside the GMX
 * intranet: same URLs as before, Maximo's typeface and gold styling kept.
 */
export default async function MaximoToolsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { t } = await getDict();
  const name = (href: string) => toolText(t, TOOLS.find(x => x.href === href)!).name;
  return (
    <div className="font-maximo">
      <div className="mb-4 flex items-center justify-between gap-3 text-xs text-gray-500">
      <p>
        <Link href="/departments/commercial" className="hover:text-gray-900 hover:underline">
          {deptName(t, "commercial")}
        </Link>
        <span className="mx-1.5">›</span>
        <span className="font-bold text-gray-700">Maximo</span>
      </p>
      <nav className="flex gap-3 font-bold">
        <Link href="/calculator" className="hover:text-gray-900 hover:underline">{name("/calculator")}</Link>
        <Link href="/b2b" className="hover:text-gray-900 hover:underline">{name("/b2b")}</Link>
        <Link href="/quotes" className="hover:text-gray-900 hover:underline">{name("/quotes")}</Link>
      </nav>
      </div>
      {children}
    </div>
  );
}
