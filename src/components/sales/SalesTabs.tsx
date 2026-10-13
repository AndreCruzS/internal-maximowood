"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Calculator, FileText } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";

/** One switcher for Maximo's quoting: the retail and B2B calculators and the saved quotes. */
export default function SalesTabs() {
  const { t } = useI18n();
  const path = usePathname();
  const tabs = [
    { href: "/calculator", label: t.sales.retail, icon: Calculator },
    { href: "/b2b", label: t.sales.b2b, icon: Building2 },
    { href: "/quotes", label: t.sales.saved, icon: FileText },
  ];
  if (!tabs.some(x => x.href === path)) return null;
  return (
    <nav aria-label={t.sales.label} className="flex w-full rounded-full border border-gray-200 bg-gray-100 p-1 sm:w-auto">
      {tabs.map(x => {
        const on = path === x.href;
        return (
          <Link key={x.href} href={x.href} aria-current={on ? "page" : undefined}
            className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 py-2 text-xs font-black uppercase tracking-wide transition-all sm:flex-none sm:px-5 sm:text-sm ${
              on ? "bg-[#009f67] text-white shadow-sm" : "text-gray-500 hover:bg-white hover:text-gray-900"
            }`}>
            <x.icon className="hidden h-4 w-4 sm:block" /> {x.label}
          </Link>
        );
      })}
    </nav>
  );
}
