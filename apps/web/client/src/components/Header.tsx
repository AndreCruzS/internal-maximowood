import { useLocalAuth } from "@/contexts/AuthContext";
import { LogOut } from "lucide-react";
import { Link } from "wouter";
import type { ReactNode } from "react";

const LOGO_THERMO =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663323594646/BgVSczWjokZ8ShW8VRp9Kb/logo-thermo-black_15158a6a.webp";

type Props = {
  nav?: ReactNode;
};

export default function Header({ nav }: Props) {
  const { logout, user } = useLocalAuth();

  return (
    <>
      <header className="sticky top-0 z-50 shadow-lg" style={{ background: "#1A1A1A" }}>
        <div className="container flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-3">
            <img
              src={LOGO_THERMO}
              alt="Maximo Thermo"
              className="h-8 w-auto brightness-0 invert"
            />
          </Link>

          {nav}

          <div className="flex items-center gap-3">
            {user?.email && (
              <span className="hidden md:inline text-xs text-white/40 tracking-wide">
                {user.email}
              </span>
            )}
            <button
              onClick={logout}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-white/60 hover:text-white hover:bg-white/10 transition-all">
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>
      <div className="h-1" style={{ background: "#C9A227" }} />
    </>
  );
}
