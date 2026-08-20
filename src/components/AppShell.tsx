"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Calculator, Package, Tag, Building2 } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";

const LOGO_THERMO = "/logos/logo-thermo-black.webp";

const TABS = [
  { href: "/", label: "Calculator", icon: <Calculator className="w-4 h-4" /> },
  { href: "/inventory", label: "Inventory", icon: <Package className="w-4 h-4" /> },
  { href: "/pricing", label: "Pricing", icon: <Tag className="w-4 h-4" /> },
  { href: "/b2b", label: "B2B", icon: <Building2 className="w-4 h-4" /> },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const logout = async () => {
    const supabase = getSupabase();
    if (supabase) await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-[#F5F4F0]">
      {/* Header */}
      <header className="sticky top-0 z-50 shadow-lg" style={{ background: "#1A1A1A" }}>
        <div className="container flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={LOGO_THERMO}
              alt="Maximo Thermo"
              className="h-8 w-auto brightness-0 invert"
            />
          </div>

          {/* Navigation tabs */}
          <nav className="flex items-center gap-1 rounded-lg p-1" style={{ background: "rgba(255,255,255,0.08)" }}>
            {TABS.map(tab => {
              const active = pathname === tab.href;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-all ${
                    active
                      ? "text-black shadow-sm"
                      : "text-white/60 hover:text-white hover:bg-white/10"
                  }`}
                  style={active ? { background: "#C9A227" } : {}}
                >
                  {tab.icon}
                  {tab.label}
                </Link>
              );
            })}
          </nav>

          {/* Logout */}
          <button
            onClick={logout}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-white/60 hover:text-white hover:bg-white/10 transition-all"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      {/* Gold accent bar */}
      <div className="h-1" style={{ background: "#C9A227" }} />

      <main className="container py-8">{children}</main>
    </div>
  );
}
