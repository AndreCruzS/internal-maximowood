import Link from "next/link";

/**
 * Maximo's own tools (calculators, pricing, inventory) inside the GMX
 * intranet: same URLs as before, Maximo's typeface and gold styling kept.
 */
export default function MaximoToolsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="font-maximo">
      <p className="mb-4 text-xs text-gray-500">
        <Link href="/departments/commercial" className="hover:text-gray-900 hover:underline">
          Commercial / Sales
        </Link>
        <span className="mx-1.5">›</span>
        <span className="font-bold text-gray-700">Maximo</span>
      </p>
      {children}
    </div>
  );
}
