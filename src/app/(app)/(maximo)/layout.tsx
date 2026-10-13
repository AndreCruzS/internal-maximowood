import SalesTabs, { SalesCrumbs } from "@/components/sales/SalesTabs";

/** Maximo's sales tools (Quote Builder, Tally Calculator, pricing, inventory) inside the GMX intranet, in GMX branding. */
export default function MaximoToolsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <SalesCrumbs />
        <SalesTabs />
      </div>
      {children}
    </div>
  );
}
