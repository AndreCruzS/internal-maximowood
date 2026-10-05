"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { ArrowUpRight } from "lucide-react";
import { GROUPS, TOOLS, type Tool } from "@/lib/tools";

const GOLD = "#C9A227";

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

export default function Portal({ name, isAdmin }: { name: string; isAdmin: boolean }) {
  const greeting = useGreeting();
  const firstName = name.split("@")[0].split(" ")[0];
  const tools = TOOLS.filter(t => !t.adminOnly || isAdmin);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-black text-gray-900">
        {greeting}
        {firstName ? `, ${firstName}` : ""}
      </h1>

      {GROUPS.map(g => (
        <ToolSection key={g.id} label={g.label} note={g.note} tools={tools.filter(t => t.group === g.id)} />
      ))}
    </div>
  );
}

function ToolSection({ label, note, tools }: { label: string; note?: string; tools: Tool[] }) {
  if (tools.length === 0) return null;
  return (
    <section>
      <SectionLabel>{label}</SectionLabel>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {tools.map(tool => (
          <ToolTile key={tool.href} tool={tool} />
        ))}
      </div>
      {note && <p className="mt-3 text-sm text-gray-500">{note}</p>}
    </section>
  );
}
