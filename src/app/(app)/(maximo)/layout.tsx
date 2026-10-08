import Link from "next/link";

/**
 * Maximo's own tools (calculators, pricing, inventory) inside the GMX
 * intranet: same URLs as before, Maximo's typeface and gold styling kept.
 */
export default function MaximoToolsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="font-maximo">
      <div className="mb-4 flex items-center justify-between gap-3 text-xs text-gray-500">
      <p>
        <Link href="/departments/commercial" className="hover:text-gray-900 hover:underline">
          Commercial / Sales
        </Link>
        <span className="mx-1.5">›</span>
        <span className="font-bold text-gray-700">Maximo</span>
      </p>
      <nav className="flex gap-3 font-bold">
        <Link href="/calculator" className="hover:text-gray-900 hover:underline">Retail</Link>
        <Link href="/b2b" className="hover:text-gray-900 hover:underline">B2B</Link>
        <Link href="/quotes" className="hover:text-gray-900 hover:underline">My Quotes</Link>
      </nav>
      </div>
      {children}
    </div>
  );
}
