"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BadgeCheck, CalendarDays, ChevronDown, FolderOpen, Globe, Home, LifeBuoy, ListChecks, LogOut, Menu, Newspaper,
  ShieldCheck, UserCircle, Users, X,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { BRAND, COMPANIES, DEPARTMENTS, TOOLS } from "@/lib/intranet";
import { LOCALES, LOCALE_NAMES, type Locale } from "@/lib/i18n/locale";
import { saveLocale, useI18n } from "@/components/I18nProvider";
import { MeProvider } from "@/components/MeProvider";
import SearchBox from "@/components/SearchBox";

const LOGO = "/brand/gmx-logo-color.png";

// Maximo tool pages live under Commercial / Sales in the sidebar.
const COMMERCIAL_PATHS = TOOLS.filter(t => t.department === "commercial" && !t.external).map(t => t.href);

function NavItem({ href, icon, label, active, onNavigate }: {
  href: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-bold transition-colors ${
        active ? "text-[#00704a]" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
      }`}
      style={active ? { background: "rgba(0,159,103,0.1)" } : undefined}
    >
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
    </Link>
  );
}

function LanguagePicker() {
  const { locale, t } = useI18n();
  const router = useRouter();
  return (
    <label className="flex items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100">
      <Globe className="h-4 w-4" aria-hidden />
      <span className="sr-only">{t.nav.language}</span>
      <select
        value={locale}
        onChange={e => {
          saveLocale(e.target.value as Locale);
          router.refresh();
        }}
        className="cursor-pointer bg-transparent text-sm font-bold outline-none"
        aria-label={t.nav.language}
      >
        {LOCALES.map(l => (
          <option key={l} value={l}>{LOCALE_NAMES[l]}</option>
        ))}
      </select>
    </label>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();
  const [session, setSession] = useState<{ label: string; isAdmin: boolean }>({ label: "", isAdmin: false });
  const [menuOpen, setMenuOpen] = useState(false);
  const [deptsOpen, setDeptsOpen] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/session", { credentials: "include" })
      .then(r => (r.ok ? r.json() : {}) as Promise<{ name?: string | null; email?: string | null; isAdmin?: boolean }>)
      .then(d => {
        if (active) setSession({ label: d.name || d.email || "", isAdmin: !!d.isAdmin });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const logout = async () => {
    const supabase = getSupabase();
    if (supabase) await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const close = () => setMenuOpen(false);
  const deptActive = (id: string) =>
    pathname === `/departments/${id}` || (id === "commercial" && COMMERCIAL_PATHS.includes(pathname));
  const nav = (href: string, Icon: typeof Home, label: string) => (
    <NavItem href={href} icon={<Icon className="h-4 w-4" />} label={label} active={pathname === href || (href !== "/" && pathname.startsWith(`${href}/`))} onNavigate={close} />
  );

  const sidebar = (
    <nav className="flex min-h-full flex-col gap-1 p-4" aria-label="Main">
      <Link href="/" onClick={close} className="mb-6 block px-2 pt-1" aria-label={BRAND.name}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO} alt="GMX Group" className="h-9 w-auto" />
      </Link>

      {nav("/", Home, t.nav.home)}
      {nav("/news", Newspaper, t.nav.news)}
      {nav("/calendar", CalendarDays, t.nav.calendar)}
      {nav("/people", Users, t.nav.people)}

      <button
        type="button"
        onClick={() => setDeptsOpen(v => !v)}
        className="mt-3 flex items-center justify-between rounded-lg px-3 py-2 text-xs font-black uppercase tracking-widest text-gray-400 hover:text-gray-700"
        aria-expanded={deptsOpen}
      >
        {t.nav.departments}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${deptsOpen ? "" : "-rotate-90"}`} />
      </button>
      {deptsOpen &&
        DEPARTMENTS.map(d => {
          const Icon = d.icon;
          return (
            <NavItem
              key={d.id}
              href={`/departments/${d.id}`}
              icon={<Icon className="h-4 w-4" />}
              label={t.departments[d.id].name}
              active={deptActive(d.id)}
              onNavigate={close}
            />
          );
        })}

      <p className="mt-3 px-3 py-2 text-xs font-black uppercase tracking-widest text-gray-400">{t.nav.brands}</p>
      {COMPANIES.map(c => (
        <NavItem
          key={c.id}
          href={`/brands/${c.id}`}
          icon={<BadgeCheck className="h-4 w-4" />}
          label={c.name}
          active={pathname === `/brands/${c.id}`}
          onNavigate={close}
        />
      ))}

      <div className="mt-3" />
      {nav("/resources", FolderOpen, t.nav.resources)}
      {nav("/help", LifeBuoy, t.nav.help)}
      {nav("/onboarding", ListChecks, t.nav.onboarding)}
      {session.isAdmin && (
        <NavItem href="/profile?tab=admin" icon={<ShieldCheck className="h-4 w-4" />} label={t.nav.admin} active={false} onNavigate={close} />
      )}

      <p className="mt-auto px-3 pt-6 text-[11px] text-gray-400">{t.login.tagline}</p>
    </nav>
  );

  return (
    <MeProvider isAdmin={session.isAdmin}>
      <div className="min-h-screen bg-[#F7F8F7]">
        {/* Sidebar — fixed on desktop, a drawer on small screens */}
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 overflow-y-auto border-r border-gray-200 bg-white lg:block">{sidebar}</aside>
        {menuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button type="button" className="absolute inset-0 bg-black/30" aria-label={t.nav.closeMenu} onClick={close} />
            <aside className="absolute inset-y-0 left-0 w-72 overflow-y-auto bg-white shadow-xl">
              <button type="button" onClick={close} className="absolute right-3 top-3 rounded p-1 text-gray-500 hover:bg-gray-100" aria-label={t.nav.closeMenu}>
                <X className="h-5 w-5" />
              </button>
              {sidebar}
            </aside>
          </div>
        )}

        <div className="lg:pl-64">
          {/* Top bar */}
          <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-gray-200 bg-white/95 px-4 backdrop-blur sm:px-6">
            <button type="button" onClick={() => setMenuOpen(true)} className="rounded p-1.5 text-gray-600 hover:bg-gray-100 lg:hidden" aria-label={t.nav.openMenu}>
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0 max-w-xl flex-1">
              <SearchBox />
            </div>
            <div className="ml-auto flex items-center gap-1">
              <LanguagePicker />
              <Link
                href="/profile"
                title={t.nav.myProfile}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold transition-colors ${
                  pathname === "/profile" ? "text-[#00704a]" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                <UserCircle className="h-5 w-5" />
                <span className="hidden max-w-[160px] truncate md:inline">{session.label || t.common.profile}</span>
              </Link>
              <button
                onClick={logout}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">{t.common.signOut}</span>
              </button>
            </div>
          </header>

          <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">{children}</main>
        </div>
      </div>
    </MeProvider>
  );
}
