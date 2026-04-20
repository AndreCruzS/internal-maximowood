import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Search, RefreshCw, Tag, DollarSign } from "lucide-react";

type PriceTier = "distributor" | "distributor_fixed" | "dealer" | "dealer_fixed" | "end_customer" | "end_customer_fixed";

const TIER_LABELS: Record<PriceTier, { label: string; badge: string; color: string }> = {
  distributor:          { label: "Distributor RL (Base)",          badge: "Base",     color: "#2563EB" },
  distributor_fixed:    { label: "Distributor Fixed (25% margin)", badge: "25% mgn",  color: "#1D4ED8" },
  dealer:               { label: "Dealer RL (23% margin)",         badge: "23% mgn",  color: "#7C3AED" },
  dealer_fixed:         { label: "Dealer Fixed (25% margin)",      badge: "25% mgn",  color: "#6D28D9" },
  end_customer:         { label: "End Customer RL (40% margin)",   badge: "40% mgn",  color: "#C9A227" },
  end_customer_fixed:   { label: "End Customer Fixed (25% margin)",badge: "25% mgn",  color: "#B8861A" },
};

const CATEGORY_COLORS: Record<string, string> = {
  THERMO:   "#C9A227",
  HARDWOOD: "#2D6A4F",
  ACCOYA:   "#4A90D9",
};

export default function Pricing() {
  const { data: rows, isLoading, error, refetch } = trpc.pricing.getAll.useQuery(undefined, {
    staleTime: 5 * 60 * 1000, // 5 min cache
  });

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [selectedTier, setSelectedTier] = useState<PriceTier>("distributor");

  const categories = useMemo(() => {
    if (!rows) return [];
    return ["ALL", ...Array.from(new Set(rows.map((r) => r.category)))];
  }, [rows]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    return rows.filter((r) => {
      const matchCat = selectedCategory === "ALL" || r.category === selectedCategory;
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        r.species.toLowerCase().includes(q) ||
        r.profile.toLowerCase().includes(q) ||
        r.nominalSize.toLowerCase().includes(q) ||
        r.application.toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [rows, search, selectedCategory]);

  // Group by species
  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const row of filtered) {
      const key = `${row.category}::${row.species}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    }
    return map;
  }, [filtered]);

  const getPriceForTier = (row: (typeof filtered)[0]): number | null => {
    switch (selectedTier) {
      case "distributor":        return row.priceDistributor;
      case "distributor_fixed":  return row.priceDistributorFixed;
      case "dealer":             return row.priceDealer;
      case "dealer_fixed":       return row.priceDealerFixed;
      case "end_customer":       return row.priceEndCustomer;
      case "end_customer_fixed": return row.priceEndCustomerFixed;
    }
  };

  const tierInfo = TIER_LABELS[selectedTier];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-[#1A1A1A]" style={{ fontFamily: "'Anybody', sans-serif" }}>
            Pricing Reference
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Live from pricing sheet · {rows ? `${rows.length} products` : "Loading..."}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white transition-all hover:opacity-90"
          style={{ background: "#1A1A1A" }}
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Price Tier Selector */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Tag className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-bold text-gray-700">Price Tier</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {(Object.entries(TIER_LABELS) as [PriceTier, typeof TIER_LABELS[PriceTier]][]).map(([tier, info]) => (
            <button
              key={tier}
              onClick={() => setSelectedTier(tier)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                selectedTier === tier
                  ? "text-white border-transparent shadow-sm"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
              }`}
              style={selectedTier === tier ? { background: info.color, borderColor: info.color } : {}}
            >
              {info.label}
            </button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search species, profile, size..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-transparent bg-white"
            style={{ "--tw-ring-color": "#C9A227" } as React.CSSProperties}
          />
        </div>

        {/* Category filter */}
        <div className="flex gap-1 bg-white rounded-lg border border-gray-200 p-1">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                selectedCategory === cat
                  ? "text-white shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
              style={
                selectedCategory === cat
                  ? { background: cat === "ALL" ? "#1A1A1A" : CATEGORY_COLORS[cat] || "#1A1A1A" }
                  : {}
              }
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Loading / Error */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-gray-200 rounded-full animate-spin" style={{ borderTopColor: "#C9A227" }} />
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
          Failed to load pricing data. Please try refreshing.
        </div>
      )}

      {/* Price Tables */}
      {!isLoading && !error && (
        <div className="space-y-6">
          {grouped.size === 0 && (
            <div className="text-center py-16 text-gray-400">
              No products match your search.
            </div>
          )}

          {Array.from(grouped.entries()).map(([key, speciesRows]) => {
            const [category, species] = key.split("::");
            const catColor = CATEGORY_COLORS[category] || "#1A1A1A";

            return (
              <div key={key} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {/* Species header */}
                <div
                  className="flex items-center justify-between px-5 py-3"
                  style={{ background: catColor }}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-white/70 uppercase tracking-wider">{category}</span>
                    <span className="text-white font-black text-sm" style={{ fontFamily: "'Anybody', sans-serif" }}>
                      {species}
                    </span>
                  </div>
                  <div
                    className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold"
                    style={{ background: "rgba(255,255,255,0.2)", color: "white" }}
                  >
                    <DollarSign className="w-3 h-3" />
                    {tierInfo.label}
                  </div>
                </div>

                {/* Price table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Profile</th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Size</th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Length</th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Application</th>
                        {speciesRows[0]?.exposedFace && (
                          <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Exp. Face</th>
                        )}
                        {speciesRows[0]?.piecesPerPkg && (
                          <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Pcs/Pkg</th>
                        )}
                        <th className="text-right px-5 py-3 text-xs font-bold uppercase tracking-wider" style={{ color: tierInfo.color }}>
                          {tierInfo.badge} $/LF
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {speciesRows.map((row, idx) => {
                        const price = getPriceForTier(row);
                        return (
                          <tr
                            key={idx}
                            className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                              idx === speciesRows.length - 1 ? "border-b-0" : ""
                            }`}
                          >
                            <td className="px-5 py-3 font-semibold text-gray-800">{row.profile}</td>
                            <td className="px-4 py-3 text-gray-600">{row.nominalSize}</td>
                            <td className="px-4 py-3 text-gray-500 text-xs">{row.length}</td>
                            <td className="px-4 py-3 text-gray-500 text-xs">{row.application}</td>
                            {row.exposedFace && (
                              <td className="px-4 py-3 text-gray-500 text-xs">{row.exposedFace}</td>
                            )}
                            {row.piecesPerPkg && (
                              <td className="px-4 py-3 text-gray-500 text-xs">{row.piecesPerPkg}</td>
                            )}
                            <td className="px-5 py-3 text-right">
                              {price != null ? (
                                <span
                                  className="font-black text-base"
                                  style={{ color: tierInfo.color, fontFamily: "'Anybody', sans-serif" }}
                                >
                                  ${price.toFixed(2)}
                                </span>
                              ) : (
                                <span className="text-gray-300 text-xs">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
