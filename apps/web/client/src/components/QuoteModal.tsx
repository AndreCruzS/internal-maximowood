import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { generateQuotePDF, type QuoteData } from "@/lib/generateQuotePDF";
import type { QuoteLineItem } from "@/lib/generateQuotePDF";
import { trpc } from "@/lib/trpc";
import { Textarea } from "@/components/ui/textarea";
import { FileText, Download, Loader2, MapPin, CheckCircle2, AlertTriangle, Package, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";

// Extended item type that includes inventory-matching keys
export type QuoteCartItem = QuoteLineItem & {
  speciesKey: string;
  profileKey: string;
  sizeKey: string;
  neededLF: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  items: QuoteCartItem[];
};

type InventoryItem = {
  specie: string;
  profile: string;
  size: string;
  branches: { branch: string; totalLF: number; lengths: { lengthFt: number | null; pieces: number | null; stockLf: number }[] }[];
  totalLF: number;
};

// ── Normalize helpers ─────────────────────────────────────────────────────────
const normalizeSpecies = (s: string): string[] => {
  const lower = s.toLowerCase();
  if (lower.includes("ayous")) return ["ayous"];
  if (lower.includes("ash")) return ["ash"];
  if (lower.includes("scandinavian")) return ["scandinavian", "pine"];
  if (lower.includes("radiata") || lower.includes("clear")) return ["radiata"];
  return [lower];
};

const normalizeProfile = (p: string): string[] => {
  const lower = p.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
  const tokens: string[] = [];
  if (lower.includes("nickel") || lower.includes("ng")) tokens.push("nickel");
  if (lower.includes("square back") || (lower.includes("square") && !lower.includes("nickel"))) tokens.push("square");
  if (lower.includes("vjoint") || lower.includes("v joint")) tokens.push("vjoint");
  if (lower.includes("s4s") || lower.includes("s4s e4e")) tokens.push("s4s");
  if (lower.includes("fluted")) tokens.push("fluted");
  if (lower.includes("end match")) tokens.push("end match");
  if (lower.includes("rough")) tokens.push("rough");
  if (tokens.length === 0) tokens.push(lower);
  return tokens;
};

const normalizeSize = (s: string): string =>
  s.toLowerCase().replace(/\s*x\s*/g, "x").replace(/\s+/g, "");

function findInventoryMatch(inventoryItems: InventoryItem[], speciesKey: string, profileKey: string, sizeKey: string): InventoryItem | null {
  const specTokens = normalizeSpecies(speciesKey);
  const profTokens = normalizeProfile(profileKey);
  const normSize = normalizeSize(sizeKey);

  let bestItem: InventoryItem | null = null;
  let bestScore = 0;

  for (const item of inventoryItems) {
    const invSpecie = item.specie.toLowerCase();
    const invProfile = item.profile.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
    const invSize = normalizeSize(item.size);

    if (invSize !== normSize) continue;
    const specScore = specTokens.filter(t => invSpecie.includes(t)).length;
    if (specScore === 0) continue;
    const profScore = profTokens.filter(t => invProfile.includes(t)).length;
    if (profScore === 0) continue;

    const totalScore = specScore * 10 + profScore;
    if (totalScore > bestScore) {
      bestScore = totalScore;
      bestItem = item;
    }
  }
  return bestItem;
}

// ── Per-item inventory row ────────────────────────────────────────────────────
function InventoryRow({ item, inventoryItems, inventoryLoading }: {
  item: QuoteCartItem;
  inventoryItems: InventoryItem[];
  inventoryLoading: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const matchedItem = useMemo(
    () => inventoryItems.length > 0 ? findInventoryMatch(inventoryItems, item.speciesKey, item.profileKey, item.sizeKey) : null,
    [inventoryItems, item.speciesKey, item.profileKey, item.sizeKey]
  );

  const totalAvailableLF = matchedItem
    ? matchedItem.branches.reduce((s, b) => s + b.totalLF, 0)
    : 0;
  const hasEnough = totalAvailableLF >= item.neededLF;

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      {/* Item header */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-50">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-[#1A1A1A] truncate">{item.species} · {item.profile} · {item.nominalSize}</p>
          <p className="text-xs text-slate-500">{item.neededLF.toLocaleString("en-US", { maximumFractionDigits: 1 })} LF needed</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          {inventoryLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />
          ) : matchedItem ? (
            <Badge
              variant="outline"
              className={`text-xs font-bold ${hasEnough ? "text-green-700 border-green-300 bg-green-50" : "text-amber-700 border-amber-300 bg-amber-50"}`}
            >
              {hasEnough ? `✓ ${totalAvailableLF.toLocaleString("en-US", { maximumFractionDigits: 0 })} LF` : `⚠ ${totalAvailableLF.toLocaleString("en-US", { maximumFractionDigits: 0 })} LF`}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs text-amber-600 border-amber-300 bg-amber-50">
              Not found
            </Badge>
          )}
          {matchedItem && (
            <button
              onClick={() => setExpanded(v => !v)}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      {/* Expanded branch details */}
      {expanded && matchedItem && (
        <div className="px-3 py-2 space-y-2 bg-white">
          {matchedItem.branches.map((branch, bi) => (
            <div key={bi} className="border border-slate-100 rounded overflow-hidden">
              <div className="flex items-center justify-between bg-slate-50 px-2 py-1">
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3 h-3 text-blue-500" />
                  <span className="text-xs font-semibold text-blue-700">{branch.branch}</span>
                </div>
                <Badge variant="outline" className="text-xs font-bold text-green-700 border-green-300">
                  {branch.totalLF.toLocaleString("en-US", { maximumFractionDigits: 0 })} LF
                </Badge>
              </div>
              <div className="px-2 py-1.5 flex flex-wrap gap-1">
                {branch.lengths
                  .filter(l => l.lengthFt != null && l.lengthFt > 0)
                  .slice()
                  .sort((a, b) => (a.lengthFt ?? 0) - (b.lengthFt ?? 0))
                  .map((l, li) => (
                    <div key={li} className="text-xs bg-white border border-slate-200 rounded px-1.5 py-0.5 text-center min-w-[52px]">
                      <div className="font-medium text-slate-700">{l.lengthFt}'</div>
                      <div className="font-bold text-green-700">{l.stockLf.toLocaleString("en-US", { maximumFractionDigits: 0 })} LF</div>
                      {l.pieces != null && <div className="text-slate-400">{l.pieces} pcs</div>}
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Modal ────────────────────────────────────────────────────────────────
export default function QuoteModal({ open, onClose, items }: Props) {
  const today = new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });

  const [companyName, setCompanyName] = useState("");
  const [contact, setContact] = useState("");
  const [project, setProject] = useState("");
  const [address, setAddress] = useState("");
  const [preparedBy, setPreparedBy] = useState("Maximo Concierge Team");
  const [tax, setTax] = useState("");
  const [shipping, setShipping] = useState("");
  const [generating, setGenerating] = useState(false);
  const [notes, setNotes] = useState("");

  // Fetch inventory
  const { data: inventoryData, isLoading: inventoryLoading } = trpc.inventory.getAll.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: open,
  });

  const inventoryItems: InventoryItem[] = (inventoryData?.items as InventoryItem[]) ?? [];

  // Compute grand total
  const grandTotal = items.reduce((sum, item) => {
    const addOnTotal = item.addOns ? item.addOns.reduce((a, ao) => a + ao.amount, 0) : 0;
    return sum + item.total + addOnTotal;
  }, 0);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const quoteData: QuoteData = {
        company: companyName,
        contact,
        project,
        address,
        preparedBy: preparedBy || "Maximo Concierge Team",
        date: today,
        tax: tax ? parseFloat(tax) : undefined,
        shipping: shipping ? parseFloat(shipping) : undefined,
        notes: notes.trim(),
        items: items.map(item => ({
          species: item.species,
          profile: item.profile,
          nominalSize: item.nominalSize,
          sqft: item.sqft,
          lf: item.lf,
          pricePerLF: item.pricePerLF,
          total: item.total,
          addOns: item.addOns,
          lengthType: item.lengthType,
        })),
      };
      await generateQuotePDF(quoteData);
      toast.success("Quote generated successfully!");
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate quote. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-yellow-600" />
            <DialogTitle>
              Generate Quote — {items.length} {items.length === 1 ? "product" : "products"}
            </DialogTitle>
          </div>
        </DialogHeader>

        {/* Items summary */}
        <div className="rounded-lg border overflow-hidden" style={{ borderColor: "#C9A22730" }}>
          <div className="px-3 py-2" style={{ background: "#1A1A1A" }}>
            <span className="text-xs font-black uppercase tracking-widest" style={{ color: "#C9A227" }}>
              Quote Items
            </span>
          </div>
          <div className="divide-y divide-[#F0EDE4]">
            {items.map((item, idx) => {
              const addOnTotal = item.addOns ? item.addOns.reduce((a, ao) => a + ao.amount, 0) : 0;
              const itemTotal = item.total + addOnTotal;
              return (
                <div key={idx} className="px-3 py-2.5 flex items-start justify-between gap-2" style={{ background: "#C9A22708" }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-[#1A1A1A]">{item.species}</p>
                    <p className="text-xs text-[#666]">{item.profile} · {item.nominalSize}</p>
                    <p className="text-xs text-[#888]">
                      {item.lf.toLocaleString("en-US", { maximumFractionDigits: 1 })} LF · {item.sqft.toLocaleString("en-US", { maximumFractionDigits: 1 })} sqft · ${item.pricePerLF.toFixed(2)}/LF
                    </p>
                    {item.addOns && item.addOns.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {item.addOns.map((ao, ai) => (
                          <p key={ai} className="text-xs text-[#888]">+ {ao.label}: ${ao.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="text-sm font-black shrink-0" style={{ color: "#C9A227" }}>
                    ${itemTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              );
            })}
          </div>
          {/* Grand total */}
          <div className="px-3 py-2.5 flex justify-between items-center" style={{ background: "#C9A227" }}>
            <span className="text-xs font-black uppercase tracking-wider text-black">Total</span>
            <span className="text-base font-black text-black">
              ${grandTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* ── Inventory Availability ── */}
        <div className="rounded-lg border overflow-hidden">
          <div className="px-3 py-2 flex items-center gap-2" style={{ background: "#1A1A1A" }}>
            <Package className="w-4 h-4" style={{ color: "#C9A227" }} />
            <span className="text-xs font-black uppercase tracking-widest" style={{ color: "#C9A227" }}>Stock Availability</span>
          </div>
          <div className="p-3 space-y-2">
            {items.map((item, idx) => (
              <InventoryRow
                key={idx}
                item={item}
                inventoryItems={inventoryItems}
                inventoryLoading={inventoryLoading}
              />
            ))}
          </div>
        </div>

        {/* Quote fields */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Company Name</Label>
              <Input placeholder="ABC Construction" value={companyName} onChange={e => setCompanyName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Contact</Label>
              <Input placeholder="John Smith" value={contact} onChange={e => setContact(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Project Name</Label>
            <Input placeholder="Residential Deck — Main St" value={project} onChange={e => setProject(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Address</Label>
            <Input placeholder="123 Main St, Boise, ID 83702" value={address} onChange={e => setAddress(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Prepared by</Label>
            <Input value={preparedBy} onChange={e => setPreparedBy(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Notes (optional)</Label>
            <Textarea
              placeholder="Write additional notes for the quote (will appear on page 2 of the PDF)..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              className="resize-none text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tax (optional)</Label>
              <Input type="number" placeholder="0.00" value={tax} onChange={e => setTax(e.target.value)} step="0.01" min="0" />
            </div>
            <div className="space-y-1.5">
              <Label>Shipping (optional)</Label>
              <Input type="number" placeholder="0.00" value={shipping} onChange={e => setShipping(e.target.value)} step="0.01" min="0" />
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={generating}
            className="flex-1 font-bold gap-2 text-black"
            style={{ background: "#C9A227" }}
          >
            {generating ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</>
            ) : (
              <><Download className="w-4 h-4" /> Download Quote PDF</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
