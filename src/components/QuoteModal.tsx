"use client";

import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { generateQuotePDF } from "@/lib/generateQuotePDF";
import type { QuoteLineItem } from "@/lib/generateQuotePDF";
import { ApiError, createQuote, updateQuote, useInventory } from "@/lib/api";
import {
  DEFAULT_PREPARED_BY,
  toQuoteData,
  type QuoteCalculator,
  type QuoteInput,
  type SavedQuote,
} from "@/lib/quotes";
import { Textarea } from "@/components/ui/textarea";
import { FileText, Download, Loader2, MapPin, CheckCircle2, AlertTriangle, Package, ChevronDown, ChevronUp, Save } from "lucide-react";
import { toast } from "sonner";
import QuoteItemRow from "@/components/QuoteItemRow";
import { findInventoryMatch, type InventoryItem, type LengthEntry } from "@/lib/inventoryMatch";
import { useQueryClient } from "@tanstack/react-query";

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
  calculator: QuoteCalculator;
  /** The saved quote being edited, if any — saving then updates it in place. */
  savedQuote?: SavedQuote | null;
  onSaved?: (quote: SavedQuote) => void;
  /** Lets the quote lines be edited (quantity, price, add-ons) or removed. */
  onItemsChange?: (items: QuoteCartItem[]) => void;
};

// ── Per-item inventory row ────────────────────────────────────────────────────
function InventoryRow({ item, inventoryItems, inventoryLoading, inventoryError }: {
  item: QuoteCartItem;
  inventoryItems: InventoryItem[];
  inventoryLoading: boolean;
  inventoryError: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const matchedItem = useMemo(
    () => inventoryItems.length > 0 ? findInventoryMatch(inventoryItems, item.speciesKey, item.profileKey, item.sizeKey) : null,
    [inventoryItems, item.speciesKey, item.profileKey, item.sizeKey]
  );

  const totalAvailableLF = matchedItem
    ? (matchedItem.branches ?? []).reduce((s, b) => s + (b.totalLF ?? 0), 0)
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
          ) : inventoryError ? (
            <Badge variant="outline" className="text-xs text-slate-500 border-slate-300 bg-white">
              Couldn&apos;t check
            </Badge>
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
          {(matchedItem.branches ?? []).map((branch, bi) => (
            <div key={bi} className="border border-slate-100 rounded overflow-hidden">
              <div className="flex items-center justify-between bg-slate-50 px-2 py-1">
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3 h-3 text-blue-500" />
                  <span className="text-xs font-semibold text-blue-700">{branch.branch}</span>
                </div>
                <Badge variant="outline" className="text-xs font-bold text-green-700 border-green-300">
                  {(branch.totalLF ?? 0) > 0
                    ? `${(branch.totalLF ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 })} LF`
                    : "—"}
                </Badge>
              </div>
              {(branch.lengths ?? []).length > 0 && (
                <div className="px-2 py-1.5 flex flex-wrap gap-1">
                  {[...(branch.lengths ?? [])]
                    .filter((l: LengthEntry) => l.lengthFt != null || (l.pieces ?? 0) > 0)
                    .sort((a: LengthEntry, b: LengthEntry) => (b.lengthFt ?? 0) - (a.lengthFt ?? 0))
                    .map((l: LengthEntry, li: number) => (
                      <div key={li} className="text-xs bg-white border border-slate-200 rounded px-1.5 py-0.5 text-center min-w-[36px]">
                        <div className="font-medium text-slate-700">{l.lengthFt != null ? `${l.lengthFt}'` : "—"}</div>
                        {l.pieces != null && <div className="text-slate-400">{l.pieces} pcs</div>}
                      </div>
                    ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Modal ────────────────────────────────────────────────────────────────
// Parents remount this with `key` when a different saved quote is opened, so
// the fields initialise from `savedQuote` once.
export default function QuoteModal({ open, onClose, items, calculator, savedQuote, onSaved, onItemsChange }: Props) {
  const queryClient = useQueryClient();

  const [companyName, setCompanyName] = useState(savedQuote?.company ?? "");
  const [contact, setContact] = useState(savedQuote?.contact ?? "");
  const [project, setProject] = useState(savedQuote?.projectName ?? "");
  const [address, setAddress] = useState(savedQuote?.address ?? "");
  const [preparedBy, setPreparedBy] = useState(savedQuote?.preparedBy || DEFAULT_PREPARED_BY);
  const [tax, setTax] = useState(savedQuote?.tax != null ? String(savedQuote.tax) : "");
  const [shipping, setShipping] = useState(savedQuote?.shipping != null ? String(savedQuote.shipping) : "");
  const [notes, setNotes] = useState(savedQuote?.notes ?? "");
  const [busy, setBusy] = useState<"save" | "download" | null>(null);
  const [projectError, setProjectError] = useState("");
  // Saving a new quote under a project name that's already taken.
  const [conflict, setConflict] = useState<{ existingId: string; message: string; download: boolean } | null>(null);

  // Fetch inventory
  const {
    data: inventoryData,
    isLoading: inventoryLoading,
    isError: inventoryError,
    refetch: refetchInventory,
  } = useInventory({ enabled: open });

  const inventoryItems: InventoryItem[] = (inventoryData?.items as InventoryItem[]) ?? [];

  // Compute grand total
  const grandTotal = items.reduce((sum, item) => {
    const addOnTotal = item.addOns ? item.addOns.reduce((a, ao) => a + ao.amount, 0) : 0;
    return sum + item.total + addOnTotal;
  }, 0);

  const buildInput = (): QuoteInput => ({
    projectName: project.trim(),
    calculator,
    company: companyName.trim(),
    contact: contact.trim(),
    address: address.trim(),
    preparedBy: preparedBy.trim() || DEFAULT_PREPARED_BY,
    notes: notes.trim(),
    tax: tax ? parseFloat(tax) : null,
    shipping: shipping ? parseFloat(shipping) : null,
    items,
  });

  /**
   * Save (create, or update `targetId`), then optionally download the PDF.
   * Saving is keyed by project name: a new quote whose project already exists
   * stops at a "replace it?" prompt instead of creating a duplicate.
   */
  const save = async (download: boolean, targetId = savedQuote?.id) => {
    if (!project.trim()) {
      setProjectError("Give the quote a project name — it's how the quote is saved.");
      return;
    }
    setProjectError("");
    setConflict(null);
    setBusy(download ? "download" : "save");
    const input = buildInput();
    let saved: SavedQuote;
    try {
      saved = targetId ? await updateQuote(targetId, input) : await createQuote(input);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && typeof err.body.existingId === "string") {
        setConflict({ existingId: err.body.existingId, message: err.message, download });
      } else {
        toast.error(err instanceof Error ? err.message : "Couldn't save the quote. Please try again.");
      }
      setBusy(null);
      return;
    }

    void queryClient.invalidateQueries({ queryKey: ["quotes"] });
    toast.success(targetId ? `Quote "${saved.projectName}" updated` : `Quote "${saved.projectName}" saved`);

    let pdfFailed = false;
    if (download) {
      try {
        await generateQuotePDF(toQuoteData(input));
      } catch (err) {
        console.error(err);
        pdfFailed = true;
        toast.error("The quote was saved, but the PDF failed to generate. Please try again.");
      }
    }
    setBusy(null);
    // Last: the parent may re-key (remount) this modal for the saved quote.
    onSaved?.(saved);
    if (!pdfFailed) onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-yellow-600" />
            <DialogTitle>
              {savedQuote ? "Update Quote" : "Generate Quote"} — {items.length} {items.length === 1 ? "product" : "products"}
            </DialogTitle>
          </div>
          {savedQuote && (
            <p className="text-xs text-[#888]">
              Saved quote · last updated{" "}
              {new Date(savedQuote.updatedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
            </p>
          )}
        </DialogHeader>

        {/* Items summary */}
        <div className="rounded-lg border overflow-hidden" style={{ borderColor: "#C9A22730" }}>
          <div className="px-3 py-2" style={{ background: "#1A1A1A" }}>
            <span className="text-xs font-black uppercase tracking-widest" style={{ color: "#C9A227" }}>
              Quote Items
            </span>
            {onItemsChange && (
              <span className="ml-2 text-[10px] font-semibold text-white/50">Use ✎ to change quantity, price or add-ons</span>
            )}
          </div>
          <div className="divide-y divide-[#F0EDE4]">
            {items.map((item, idx) => (
              <QuoteItemRow
                key={idx}
                item={item}
                onChange={onItemsChange ? next => onItemsChange(items.map((it, i) => (i === idx ? next : it))) : undefined}
                onRemove={onItemsChange && items.length > 1 ? () => onItemsChange(items.filter((_, i) => i !== idx)) : undefined}
              />
            ))}
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
            {inventoryError && (
              <div className="flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <span>Live stock couldn&apos;t be loaded, so availability is unknown.</span>
                <button type="button" onClick={() => void refetchInventory()} className="font-bold underline shrink-0">
                  Try again
                </button>
              </div>
            )}
            {items.map((item, idx) => (
              <InventoryRow
                key={idx}
                item={item}
                inventoryItems={inventoryItems}
                inventoryLoading={inventoryLoading}
                inventoryError={inventoryError}
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
            <Label htmlFor="quote-project">
              Project Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="quote-project"
              placeholder="Residential Deck — Main St"
              value={project}
              onChange={e => {
                setProject(e.target.value);
                setProjectError("");
                setConflict(null);
              }}
              aria-invalid={!!projectError}
            />
            {projectError ? (
              <p className="text-xs text-red-600">{projectError}</p>
            ) : (
              <p className="text-xs text-[#888]">The quote is saved under this name — reopen it from your Profile to make changes.</p>
            )}
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
            <Label>Internal notes (optional)</Label>
            <Textarea
              placeholder="Notes for your team — saved with the quote, not printed on the PDF..."
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

        {conflict && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold">{conflict.message}.</p>
                <p className="text-xs mt-0.5">Replace it with this version, or change the project name to save a separate quote.</p>
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => void save(conflict.download, conflict.existingId)}
                    disabled={busy !== null}
                    className="font-bold text-black"
                    style={{ background: "#C9A227" }}
                  >
                    Replace existing quote
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setConflict(null);
                      document.getElementById("quote-project")?.focus();
                    }}
                    disabled={busy !== null}
                  >
                    Change project name
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-3 pt-2">
          <Button variant="outline" onClick={onClose} className="flex-1" disabled={busy !== null}>
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={() => void save(false)}
            disabled={busy !== null}
            className="flex-1 font-bold gap-2"
          >
            {busy === "save" ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
            ) : (
              <><Save className="w-4 h-4" /> {savedQuote ? "Update Quote" : "Save Quote"}</>
            )}
          </Button>
          <Button
            onClick={() => void save(true)}
            disabled={busy !== null}
            className="flex-[1.4] font-bold gap-2 text-black"
            style={{ background: "#C9A227" }}
          >
            {busy === "download" ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</>
            ) : (
              <><Download className="w-4 h-4" /> {savedQuote ? "Update & Download PDF" : "Save & Download PDF"}</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
