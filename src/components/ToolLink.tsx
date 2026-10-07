import Link from "next/link";
import { ArrowUpRight, ChevronRight } from "lucide-react";
import { companyName, type Tool } from "@/lib/intranet";

/** A tool as a row (Quick links) or a card (department pages). */
export default function ToolLink({ tool, variant = "row" }: { tool: Tool; variant?: "row" | "card" }) {
  const Icon = tool.icon;
  const external = tool.external ? { target: "_blank", rel: "noopener noreferrer" } : {};
  const Trail = tool.external ? ArrowUpRight : ChevronRight;

  if (variant === "card") {
    return (
      <Link
        href={tool.href}
        {...external}
        className="group block rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-[#009f67] hover:shadow-md"
      >
        <div className="flex items-start justify-between">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: "rgba(0,159,103,0.1)" }}>
            <Icon className="h-5 w-5 text-[#00704a]" />
          </span>
          <Trail className="h-4 w-4 text-gray-300 group-hover:text-gray-500" aria-label={tool.external ? "Opens in a new tab" : undefined} />
        </div>
        <p className="mt-4 font-bold text-gray-900">{tool.name}</p>
        <p className="text-sm text-gray-500">{tool.description}</p>
        <p className="mt-3 text-[11px] font-bold uppercase tracking-wider text-gray-400">{companyName(tool.company)}</p>
      </Link>
    );
  }

  return (
    <Link href={tool.href} {...external} className="group flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-gray-50">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: "rgba(0,159,103,0.1)" }}>
        <Icon className="h-4 w-4 text-[#00704a]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-gray-900">{tool.name}</span>
        <span className="block truncate text-xs text-gray-500">{companyName(tool.company)}</span>
      </span>
      <Trail className="h-4 w-4 shrink-0 text-gray-300 group-hover:text-gray-500" />
    </Link>
  );
}
