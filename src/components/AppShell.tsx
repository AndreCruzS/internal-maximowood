"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronLeft, LogOut, UserCircle } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";

const LOGO_MAXIMO = "/logos/logo-maximo-tagline-black.png";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [userLabel, setUserLabel] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/admin/session", { credentials: "include" })
      .then(r => (r.ok ? r.json() : {}) as Promise<{ name?: string | null; email?: string | null }>)
      .then(d => {
        if (!active) return;
        setUserLabel(d.name || d.email || "");
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [pathname]);

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
          {/* Logo (home = portal) + way back from a tool */}
          <div className="flex items-center gap-4">
            <Link href="/" aria-label="Maximo Internal Portal">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={LOGO_MAXIMO}
                alt="Maximo — Hardwood Tradition, Thermo Innovation"
                className="h-10 w-auto brightness-0 invert"
              />
            </Link>
            {pathname !== "/" && (
              <Link
                href="/"
                className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-bold text-white/60 hover:text-white hover:bg-white/10 transition-all"
              >
                <ChevronLeft className="w-4 h-4" />
                Portal
              </Link>
            )}
          </div>

          {/* Profile + logout */}
          <div className="flex items-center gap-1">
            <Link
              href="/profile"
              title="My profile & saved quotes"
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
                pathname === "/profile" ? "text-black" : "text-white/60 hover:text-white hover:bg-white/10"
              }`}
              style={pathname === "/profile" ? { background: "#C9A227" } : {}}
            >
              <UserCircle className="w-4 h-4" />
              <span className="hidden md:inline max-w-[160px] truncate">{userLabel || "Profile"}</span>
            </Link>
            <button
              onClick={logout}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-white/60 hover:text-white hover:bg-white/10 transition-all"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Gold accent bar */}
      <div className="h-1" style={{ background: "#C9A227" }} />

      <main className="container py-8">{children}</main>
    </div>
  );
}
