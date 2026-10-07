import Link from "next/link";
import type { LucideIcon } from "lucide-react";

/** Placeholder for intranet sections that are planned but not built yet. */
export default function ComingSoon({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "rgba(0,159,103,0.1)" }}>
        <Icon className="h-6 w-6 text-[#00704a]" />
      </span>
      <h1 className="mt-4 text-2xl font-black text-gray-900">{title}</h1>
      <p className="mt-2 text-gray-500">{text}</p>
      <Link href="/" className="mt-6 inline-block text-sm font-bold text-[#00704a] hover:underline">
        ← Back to home
      </Link>
    </div>
  );
}
