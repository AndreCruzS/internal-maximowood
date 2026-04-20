import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, Package, Search, AlertCircle, MapPin, Database, CloudOff } from "lucide-react";
import { toast } from "sonner";

const GOLD = "#C9A227";
const BLACK = "#1A1A1A";

type LengthEntry = {
  lengthFt: number | null;
  pieces: number | null;
  stockLf: number;
};

type BranchStock = {
  branch: string;
  totalLF: number;
  lengths: LengthEntry[];
};

type InventoryItem = {
  specie: string;
  profile: string;
  size: string;
  branches: BranchStock[];
  totalLF: number;
};

export default function Inventory() {
  const [filterSpecie, setFilterSpecie] = useState("all");
  const [filterBranch, setFilterBranch] = useState("all");
  const [filterSearch, setFilterSearch] = useState("");

  const utils = trpc.useUtils();

  const { data, isLoading, error, refetch, isFetching } = trpc.inventory.getAll.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const syncMutation = trpc.inventory.syncNow.useMutation({
    onSuccess: (result) => {
      toast.success(`Sync complete! ${result.rowsUpserted} products updated.`);
      utils.inventory.getAll.invalidate();
    },
    onError: (err) => {
      toast.error(`Sync error: ${err.message}`);
    },
  });

  const filtered = useMemo(() => {
    if (!data?.items) return [] as InventoryItem[];
    return (data.items as InventoryItem[]).filter(item => {
      const matchSpecie = filterSpecie === "all" || item.specie === filterSpecie;
      const search = filterSearch.toLowerCase();
      const matchSearch = !search ||
        item.specie.toLowerCase().includes(search) ||
        item.profile.toLowerCase().includes(search) ||
        item.size.toLowerCase().includes(search);
      const matchBranch = filterBranch === "all" ||
        item.branches.some(b => b.branch === filterBranch);
      return matchSpecie && matchSearch && matchBranch;
    });
  }, [data, filterSpecie, filterBranch, filterSearch]);

  const totalLF = useMemo(() => filtered.reduce((sum, i) => sum + i.totalLF, 0), [filtered]);

  const isSyncing = syncMutation.isPending || isFetching;
  const source = data?.source;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black uppercase tracking-wide text-[#1A1A1A]">Current Stock</h2>
          <div className="flex items-center gap-2 mt-0.5">
            {source === "supabase" && (
              <span className="flex items-center gap-1 text-xs text-[#888]">
                <Database className="w-3 h-3" style={{ color: GOLD }} />
                Supabase · Last synced{" "}
                {data?.lastUpdated
                  ? new Date(data.lastUpdated).toLocaleString("en-US", {
                      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                    })
                  : "—"}
              </span>
            )}
            {source === "syncing" && (
              <span className="flex items-center gap-1 text-xs text-amber-600">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Syncing for the first time...
              </span>
            )}
            {source === "none" && (
              <span className="flex items-center gap-1 text-xs text-red-500">
                <CloudOff className="w-3 h-3" />
                Database unavailable
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => refetch()}
            disabled={isSyncing}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold border-2 border-[#E0DDD4] bg-white text-[#555] hover:border-[#C9A227]/50 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </button>

          <button
            onClick={() => syncMutation.mutate()}
            disabled={isSyncing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all disabled:opacity-50"
            style={{
              background: isSyncing ? `${GOLD}80` : GOLD,
              color: BLACK,
            }}
          >
            <Database className={`w-4 h-4 ${syncMutation.isPending ? "animate-pulse" : ""}`} />
            {syncMutation.isPending ? "Syncing..." : "Sync Supabase"}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#aaa]" />
          <Input
            placeholder="Search by species, profile or size..."
            value={filterSearch}
            onChange={e => setFilterSearch(e.target.value)}
            className="pl-9 h-11 border-[#E0DDD4] focus:ring-[#C9A227] focus:border-[#C9A227]"
          />
        </div>
        <Select value={filterSpecie} onValueChange={setFilterSpecie}>
          <SelectTrigger className="w-full sm:w-48 h-11 border-[#E0DDD4] focus:ring-[#C9A227] focus:border-[#C9A227]">
            <SelectValue placeholder="Species" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All species</SelectItem>
            {(data?.species ?? []).map((s: string) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterBranch} onValueChange={setFilterBranch}>
          <SelectTrigger className="w-full sm:w-48 h-11 border-[#E0DDD4] focus:ring-[#C9A227] focus:border-[#C9A227]">
            <SelectValue placeholder="Location" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All locations</SelectItem>
            {(data?.branches ?? []).map((b: string) => (
              <SelectItem key={b} value={b}>{b}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary stats */}
      {!isLoading && !error && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-[#E8E5DC] p-4">
            <p className="text-xs font-black uppercase tracking-widest text-[#888] mb-1">Products</p>
            <p className="text-3xl font-black" style={{ color: BLACK }}>{filtered.length}</p>
          </div>
          <div
            className="rounded-xl border p-4"
            style={{ borderColor: `${GOLD}40`, background: `${GOLD}10` }}
          >
            <p className="text-xs font-black uppercase tracking-widest mb-1" style={{ color: GOLD }}>Total LF</p>
            <p className="text-3xl font-black" style={{ color: BLACK }}>
              {totalLF.toLocaleString("en-US", { maximumFractionDigits: 0 })}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-[#E8E5DC] p-4">
            <p className="text-xs font-black uppercase tracking-widest text-[#888] mb-1">Locations</p>
            <p className="text-3xl font-black" style={{ color: BLACK }}>
              {(data?.branches ?? []).length}
            </p>
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <RefreshCw className="w-8 h-8 animate-spin" style={{ color: GOLD }} />
          <p className="text-[#666]">Loading inventory...</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
            <div>
              <p className="font-bold text-red-800">Error loading inventory</p>
              <p className="text-sm text-red-600 mt-1">{error.message}</p>
              <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-3 border-red-300 text-red-700">
                Try again
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Syncing for first time */}
      {!isLoading && !error && source === "syncing" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-amber-500" />
          <p className="font-bold text-amber-800">Syncing inventory for the first time...</p>
          <p className="text-sm text-amber-600 mt-1">Wait a few seconds then click Refresh.</p>
        </div>
      )}

      {/* Empty */}
      {!isLoading && !error && source !== "syncing" && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ background: `${GOLD}15` }}
          >
            <Package className="w-8 h-8" style={{ color: GOLD }} />
          </div>
          <p className="text-[#666] font-medium">No products found with the selected filters.</p>
        </div>
      )}

      {/* Inventory cards */}
      {!isLoading && !error && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map((item, idx) => {
            const visibleBranches = filterBranch === "all"
              ? item.branches
              : item.branches.filter(b => b.branch === filterBranch);
            const visibleLF = visibleBranches.reduce((s, b) => s + b.totalLF, 0);

            return (
              <div key={idx} className="bg-white rounded-xl border border-[#E8E5DC] overflow-hidden shadow-sm">
                {/* Product header */}
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-[#E8E5DC] bg-[#FAFAF7]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-black text-sm text-[#1A1A1A]">{item.specie}</span>
                    {item.profile && (
                      <>
                        <span className="text-[#ccc]">·</span>
                        <span className="text-sm text-[#555]">{item.profile}</span>
                      </>
                    )}
                    {item.size && (
                      <>
                        <span className="text-[#ccc]">·</span>
                        <span
                          className="text-xs font-mono font-bold px-2 py-0.5 rounded"
                          style={{ background: `${GOLD}20`, color: "#8a6d10" }}
                        >
                          {item.size}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-[#888]">Total:</span>
                    <span className="font-black text-base" style={{ color: GOLD }}>
                      {visibleLF.toLocaleString("en-US", { maximumFractionDigits: 0 })} LF
                    </span>
                  </div>
                </div>

                {/* Branch rows */}
                <div className="divide-y divide-[#F5F3EE]">
                  {visibleBranches
                    .sort((a, b) => b.totalLF - a.totalLF)
                    .map((branch, bi) => {
                      const sortedLengths = branch.lengths
                        ? [...branch.lengths]
                            .filter(l => l.lengthFt != null)
                            .sort((a, b) => (b.lengthFt ?? 0) - (a.lengthFt ?? 0))
                        : [];
                      const branchLF = branch.lengths
                        ? branch.lengths.reduce((s, l) => s + l.stockLf, 0)
                        : branch.totalLF;

                      return (
                        <div key={bi}>
                          {/* Branch name + total LF */}
                          <div className="flex items-center justify-between px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <MapPin className="w-3.5 h-3.5 shrink-0" style={{ color: GOLD }} />
                              <span className="text-sm font-bold text-[#333]">{branch.branch}</span>
                            </div>
                            <span className="text-sm font-black" style={{ color: BLACK }}>
                              {branchLF.toLocaleString("en-US", { maximumFractionDigits: 0 })} LF
                            </span>
                          </div>

                          {/* Per-length rows — always visible */}
                          {sortedLengths.length > 0 && (
                            <div className="px-4 pb-3 space-y-1">
                              {sortedLengths.map((l, li) => (
                                <div
                                  key={li}
                                  className="flex items-center justify-between pl-5 py-1 rounded-lg text-xs"
                                  style={{ background: `${GOLD}06` }}
                                >
                                  <div className="flex items-center gap-3">
                                    <span
                                      className="font-black text-sm w-8 text-right"
                                      style={{ color: BLACK }}
                                    >
                                      {l.lengthFt}'
                                    </span>
                                    {l.pieces != null && (
                                      <span className="text-[#888]">
                                        {l.pieces.toLocaleString("en-US")} pcs
                                      </span>
                                    )}
                                  </div>
                                  <span className="font-black pr-2" style={{ color: GOLD }}>
                                    {l.stockLf.toLocaleString("en-US")} LF
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
