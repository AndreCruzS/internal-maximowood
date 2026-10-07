"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { ArrowRight, CalendarDays, LifeBuoy, Newspaper } from "lucide-react";
import { BRAND, DEPARTMENTS, TOOLS, toolsFor } from "@/lib/intranet";
import ToolLink from "@/components/ToolLink";

// Greeting depends on the viewer's clock; the server (UTC) renders a neutral one.
const noSubscribe = () => () => {};
function useGreeting() {
  return useSyncExternalStore(
    noSubscribe,
    () => {
      const h = new Date().getHours();
      return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
    },
    () => "Welcome",
  );
}

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-black text-gray-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center text-sm text-gray-400">
      {icon}
      {text}
    </div>
  );
}

/** GMX intranet home: greeting, featured message, quick links, news, events, departments, help. */
export default function Portal({ name }: { name: string; isAdmin: boolean }) {
  const greeting = useGreeting();
  const firstName = name.split("@")[0].split(/[ .]/)[0];
  const first = firstName ? firstName.charAt(0).toUpperCase() + firstName.slice(1) : "";
  const quickLinks = TOOLS.filter(t => t.pinned);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-gray-900">
          {greeting}
          {first ? `, ${first}` : ""}
        </h1>
        <p className="text-gray-500">Welcome to the {BRAND.name}</p>
      </div>

      {/* Featured + Quick links */}
      <div className="grid gap-6 lg:grid-cols-3">
        <section
          className="relative overflow-hidden rounded-xl p-8 text-white shadow-sm lg:col-span-2"
          style={{ background: `linear-gradient(135deg, ${BRAND.greenDark} 0%, ${BRAND.green} 100%)` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/gmx-symbol.png" alt="" aria-hidden className="pointer-events-none absolute -right-10 -top-6 h-72 w-72 opacity-15 brightness-0 invert" />
          <p className="text-xs font-bold uppercase tracking-widest text-white/80">GMX Group</p>
          <h2 className="mt-2 max-w-md text-3xl font-black leading-tight">One place for every company and department</h2>
          <p className="mt-3 max-w-md text-white/85">
            Tools, documents and news for Maximo, Lumber Plus and US4 — organized by department.
          </p>
          <a href="#departments" className="mt-6 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-bold text-[#00704a] hover:bg-white/90">
            Explore departments <ArrowRight className="h-4 w-4" />
          </a>
        </section>

        <Panel title="Quick links">
          <div className="-mx-2">
            {quickLinks.map(t => (
              <ToolLink key={t.href} tool={t} />
            ))}
          </div>
        </Panel>
      </div>

      {/* News + Events */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Recent news" action={<Link href="/news" className="text-sm font-bold text-[#00704a] hover:underline">See all</Link>}>
          <EmptyState icon={<Newspaper className="h-6 w-6" />} text="No announcements yet." />
        </Panel>
        <Panel title="Upcoming events">
          <EmptyState icon={<CalendarDays className="h-6 w-6" />} text="Company events will appear here." />
        </Panel>
      </div>

      {/* Departments */}
      <section id="departments" className="scroll-mt-24">
        <h2 className="mb-3 font-black text-gray-900">Departments</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {DEPARTMENTS.map(d => {
            const Icon = d.icon;
            const count = toolsFor(d.id).length;
            return (
              <Link
                key={d.id}
                href={`/departments/${d.id}`}
                className="group rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-[#009f67] hover:shadow-md"
              >
                <Icon className="h-5 w-5 text-[#00704a]" />
                <p className="mt-3 font-bold text-gray-900">{d.name}</p>
                <p className="text-xs text-gray-500">{count ? `${count} tool${count === 1 ? "" : "s"}` : "Coming soon"}</p>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Help */}
      <section className="flex flex-col items-start gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-full" style={{ background: "rgba(0,159,103,0.1)" }}>
          <LifeBuoy className="h-5 w-5 text-[#00704a]" />
        </span>
        <div className="flex-1">
          <p className="font-bold text-gray-900">Have a question or need help?</p>
          <p className="text-sm text-gray-500">Reach the IT team or browse the resources.</p>
        </div>
        <Link href="/departments/it" className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-bold text-gray-800 hover:bg-gray-50">
          Get help
        </Link>
      </section>
    </div>
  );
}
