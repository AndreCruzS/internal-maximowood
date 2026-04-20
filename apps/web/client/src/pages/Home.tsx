import Header from "@/components/Header";
import { Link } from "wouter";
import { Calculator, ArrowRight, Lock } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type SystemStatus = "active" | "coming_soon";

type System = {
  slug: string;
  name: string;
  description: string;
  href: string;
  icon: LucideIcon;
  status: SystemStatus;
  tag: string;
};

const SYSTEMS: System[] = [
  {
    slug: "maximo",
    name: "Sales Calculator",
    description:
      "Quotes, pricing simulations, inventory lookup, and PDF quote generation for the Concierge sales team.",
    href: "/maximo",
    icon: Calculator,
    status: "active",
    tag: "Sales",
  },
];

export default function Home() {
  const activeCount = SYSTEMS.filter((s) => s.status === "active").length;

  return (
    <div className="min-h-screen bg-[#F5F4F0]">
      <Header />

      <main className="container py-12">
        <section className="mb-12">
          <p className="text-xs font-bold tracking-[0.25em] uppercase text-[#C9A227] mb-3">
            Maximo Thermo · Internal Platform
          </p>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight text-[#1A1A1A] mb-4">
            Business Systems
          </h1>
          <p className="text-base md:text-lg text-[#1A1A1A]/60 max-w-2xl leading-relaxed">
            Unified access to internal tools. Select a system below to continue.
            New systems are listed here as they become available to your team.
          </p>
        </section>

        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xs font-bold tracking-[0.25em] uppercase text-[#1A1A1A]/50">
              Available systems
            </h2>
            <span className="text-xs text-[#1A1A1A]/40 tabular-nums">
              {activeCount} active
            </span>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {SYSTEMS.map((system) => (
              <SystemCard key={system.slug} system={system} />
            ))}

            <ComingSoonCard />
          </div>
        </section>

        <footer className="mt-20 pt-8 border-t border-[#1A1A1A]/10">
          <p className="text-xs text-[#1A1A1A]/40 tracking-widest uppercase text-center">
            Maximo Thermo · Internal Use Only
          </p>
        </footer>
      </main>
    </div>
  );
}

function SystemCard({ system }: { system: System }) {
  const Icon = system.icon;
  const isActive = system.status === "active";

  const cardInner = (
    <div
      className={[
        "group relative overflow-hidden rounded-xl border bg-white p-6 transition-all",
        isActive
          ? "border-[#1A1A1A]/10 hover:border-[#C9A227] hover:-translate-y-0.5 hover:shadow-xl cursor-pointer"
          : "border-[#1A1A1A]/5 opacity-60 cursor-not-allowed",
      ].join(" ")}>
      <div
        className="absolute top-0 left-0 right-0 h-1 transition-colors"
        style={{ background: isActive ? "#C9A227" : "#1A1A1A20" }}
      />

      <div className="flex items-start justify-between mb-4">
        <div
          className="flex items-center justify-center w-12 h-12 rounded-lg"
          style={{ background: isActive ? "#1A1A1A" : "#1A1A1A10" }}>
          <Icon
            className="w-6 h-6"
            style={{ color: isActive ? "#C9A227" : "#1A1A1A40" }}
          />
        </div>
        <StatusBadge status={system.status} />
      </div>

      <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-[#C9A227] mb-2">
        {system.tag}
      </p>
      <h3 className="text-xl font-black tracking-tight text-[#1A1A1A] mb-2">
        {system.name}
      </h3>
      <p className="text-sm text-[#1A1A1A]/60 leading-relaxed mb-6 min-h-[60px]">
        {system.description}
      </p>

      <div className="flex items-center justify-between pt-4 border-t border-[#1A1A1A]/5">
        <span
          className={[
            "text-xs font-bold uppercase tracking-wider",
            isActive ? "text-[#1A1A1A]" : "text-[#1A1A1A]/30",
          ].join(" ")}>
          {isActive ? "Open system" : "Unavailable"}
        </span>
        {isActive ? (
          <ArrowRight className="w-4 h-4 text-[#1A1A1A] group-hover:translate-x-1 transition-transform" />
        ) : (
          <Lock className="w-4 h-4 text-[#1A1A1A]/30" />
        )}
      </div>
    </div>
  );

  if (!isActive) return cardInner;

  return <Link href={system.href}>{cardInner}</Link>;
}

function ComingSoonCard() {
  return (
    <div className="relative overflow-hidden rounded-xl border-2 border-dashed border-[#1A1A1A]/10 bg-transparent p-6 flex flex-col items-center justify-center text-center min-h-[260px]">
      <div className="w-12 h-12 rounded-lg bg-[#1A1A1A]/5 flex items-center justify-center mb-3">
        <span className="text-[#1A1A1A]/30 text-2xl font-black">+</span>
      </div>
      <p className="text-xs font-bold tracking-[0.2em] uppercase text-[#1A1A1A]/40 mb-1">
        Coming soon
      </p>
      <p className="text-sm text-[#1A1A1A]/40 max-w-[200px]">
        New systems will appear here as they are integrated into the platform.
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: SystemStatus }) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-700 text-[10px] font-bold uppercase tracking-wider">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        Active
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#1A1A1A]/5 text-[#1A1A1A]/40 text-[10px] font-bold uppercase tracking-wider">
      Coming soon
    </span>
  );
}
