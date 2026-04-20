import Header from "@/components/Header";
import { Calculator, Package, Tag, Building2 } from "lucide-react";
import { Link, useLocation } from "wouter";
import type { ReactNode } from "react";

export type Tab = "calculator" | "inventory" | "pricing" | "b2b";

type TabDef = { id: Tab; label: string; icon: ReactNode; path: string };

const TABS: TabDef[] = [
  { id: "calculator", label: "Calculator", icon: <Calculator className="w-4 h-4" />, path: "/maximo/calculator" },
  { id: "inventory", label: "Inventory", icon: <Package className="w-4 h-4" />, path: "/maximo/inventory" },
  { id: "pricing", label: "Pricing", icon: <Tag className="w-4 h-4" />, path: "/maximo/pricing" },
  { id: "b2b", label: "B2B", icon: <Building2 className="w-4 h-4" />, path: "/maximo/b2b" },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  const nav = (
    <nav
      className="flex items-center gap-1 rounded-lg p-1"
      style={{ background: "rgba(255,255,255,0.08)" }}>
      {TABS.map((tab) => {
        const isActive = location.startsWith(tab.path);
        return (
          <Link
            key={tab.id}
            href={tab.path}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-all ${
              isActive ? "text-black shadow-sm" : "text-white/60 hover:text-white hover:bg-white/10"
            }`}
            style={isActive ? { background: "#C9A227" } : {}}>
            {tab.icon}
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-[#F5F4F0]">
      <Header nav={nav} />
      <main className="container py-8">{children}</main>
    </div>
  );
}
