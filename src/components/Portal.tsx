"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { ArrowRight, ArrowUpRight, FileText } from "lucide-react";
import { useQuotes } from "@/lib/api";
import { quoteEditHref } from "@/lib/quotes";
import { GROUPS, TOOLS, type Tool } from "@/lib/tools";

const GOLD = "#C9A227";
const DARK = "#1A1A1A";
const RECENT_QUOTES = 5;

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-black uppercase tracking-widest mb-3" style={{ color: "#8a6d1a" }}>
      {children}
    </h2>
  );
}

function ToolTile({ tool }: { tool: Tool }) {
  const Icon = tool.icon;
  const body = (
    <>
      <div className="flex items-start justify-between">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "rgba(201,162,39,0.15)" }}>
          <Icon className="w-5 h-5" style={{ color: GOLD }} />
        </div>
        {tool.external && <ArrowUpRight className="w-4 h-4 text-gray-400" aria-label="Opens in a new tab" />}
      </div>
      <p className="mt-4 font-bold text-gray-900">{tool.name}</p>
      <p className="text-sm text-gray-500">{tool.description}</p>
    </>
  );
  const className =
    "block bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md hover:border-[#C9A227] transition-all";
  return tool.external ? (
    <a href={tool.href} target="_blank" rel="noopener noreferrer" className={className}>
      {body}
    </a>
  ) : (
    <Link href={tool.href} className={className}>
      {body}
    </Link>
  );
}

function RecentQuotes({ userId }: { userId: string }) {
  const { data, isLoading, error } = useQuotes();
  // Admins get everyone's quotes from the API; the portal shows your own.
  const mine = (data ?? []).filter(q => q.ownerId === userId).slice(0, RECENT_QUOTES);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {isLoading ? (
        <p className="px-5 py-4 text-sm text-gray-400">Loading your quotes…</p>
      ) : error ? (
        <p className="px-5 py-4 text-sm text-red-700">Couldn&apos;t load your quotes</p>
      ) : mine.length === 0 ? (
        <p className="px-5 py-4 text-sm text-gray-500">No saved quotes yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {mine.map(q => (
            <li key={q.id}>
              <Link href={quoteEditHref(q)} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50">
                <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                <span className="flex-1 min-w-0 truncate font-semibold text-gray-900">{q.projectName}</span>
                <span className="text-xs text-gray-400 uppercase hidden sm:inline">{q.calculator === "b2b" ? "B2B" : "Retail"}</span>
                <span className="text-sm font-bold text-gray-700">{money(q.total)}</span>
                <ArrowRight className="w-4 h-4 text-gray-400" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link href="/profile" className="block px-5 py-2.5 text-sm font-semibold text-right border-t border-gray-100 hover:bg-gray-50" style={{ color: DARK }}>
        See all in Profile →
      </Link>
    </div>
  );
}

export default function Portal({ userId, name, isAdmin }: { userId: string; name: string; isAdmin: boolean }) {
  const greeting = useGreeting();
  const firstName = name.split("@")[0].split(" ")[0];
  const tools = TOOLS.filter(t => !t.adminOnly || isAdmin);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-black text-gray-900">
        {greeting}
        {firstName ? `, ${firstName}` : ""}
      </h1>

      {GROUPS.filter(g => g.id !== "admin").map(g => (
        <ToolSection key={g.id} label={g.label} tools={tools.filter(t => t.group === g.id)} />
      ))}

      <section>
        <SectionLabel>My work</SectionLabel>
        <RecentQuotes userId={userId} />
      </section>

      {/* Admin sits last, below your own work. */}
      <ToolSection label="Admin" tools={tools.filter(t => t.group === "admin")} />
    </div>
  );
}

function ToolSection({ label, tools }: { label: string; tools: Tool[] }) {
  if (tools.length === 0) return null;
  return (
    <section>
      <SectionLabel>{label}</SectionLabel>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {tools.map(tool => (
          <ToolTile key={tool.href} tool={tool} />
        ))}
      </div>
    </section>
  );
}
