import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  getSpecies,
  getNominalSizes,
  getProfiles,
  findProduct,
  getPrice,
  parseExposedFaceInches,
  lfToSqft,
  sqftToLf,
  COATING_OPTIONS,
  calculateCoatingNeeded,
  PRE_FINISH_COLOR_OPTIONS,
  PRE_FINISH_TEXTURE_PRICE_PER_LF,
  MILLING_PRICE_PER_LF,
  calculateAddOnCost,
  WASTE_OPTIONS,
  applyWaste,
  type LengthType,
  type CoatingId,
  type PreFinishColorType,
  type WasteId,
  type AddOnConfig,
} from "@/lib/products";
import { Calculator as CalculatorIcon, Droplet, RotateCcw, Wrench, FileText, ChevronRight, Plus, Trash2, ShoppingCart, Ruler } from "lucide-react";
import QuoteModal, { type QuoteCartItem } from "@/components/QuoteModal";
import type { QuoteLineItem } from "@/lib/generateQuotePDF";

type InputMode = "lf" | "sqft";

type Results = {
  rawLF: number;
  rawSqft: number;
  wastedLF: number;
  wastedSqft: number;
  wastePercent: string;
  pricePerLF: number;
  materialCost: number;
  addOnCost: number;
  totalCost: number;
  coatingCans: number | null;
  coatingLabel: string;
  addOnBreakdown: { label: string; amount: number }[];
  // Piece length calculation
  pieceLengthResult: {
    selectedLengths: number[];   // ft values chosen by rep
    piecesEach: number;          // ceil(wastedLF / sum(selectedLengths))
    totalPieces: number;         // piecesEach * selectedLengths.length
    actualLF: number;            // piecesEach * sum(selectedLengths)
    breakdown: { length: number; pieces: number; lf: number }[];
  } | null;
};

// Use QuoteCartItem from QuoteModal (already has all needed fields)
type CartItem = QuoteCartItem;

// ── Design tokens ─────────────────────────────────────────────────────────────
const GOLD = "#C9A227";
const BLACK = "#1A1A1A";

// ── Step card wrapper ─────────────────────────────────────────────────────────
function StepCard({
  step,
  title,
  icon,
  children,
}: {
  step: number;
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-[#E8E5DC] shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-[#E8E5DC] bg-[#FAFAF7]">
        <span
          className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0"
          style={{ background: BLACK }}
        >
          {step}
        </span>
        {icon && <span className="text-[#C9A227]">{icon}</span>}
        <span className="font-bold text-sm text-[#1A1A1A] uppercase tracking-wide">{title}</span>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ── Toggle button ─────────────────────────────────────────────────────────────
function ToggleBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold border-2 transition-all ${
        active
          ? "text-black border-transparent shadow-md"
          : "bg-white text-[#555] border-[#E0DDD4] hover:border-[#C9A227]/50"
      }`}
      style={active ? { background: GOLD, borderColor: GOLD } : {}}
    >
      {children}
    </button>
  );
}

// ── Result metric card ────────────────────────────────────────────────────────
function MetricCard({
  label,
  value,
  unit,
  sub,
  accent,
}: {
  label: string;
  value: string;
  unit: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div
      className="rounded-xl p-4 border"
      style={{ borderColor: accent ? `${accent}40` : "#E8E5DC", background: accent ? `${accent}10` : "#FAFAF7" }}
    >
      <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: accent || "#888" }}>
        {label}
      </p>
      {sub && <p className="text-xs mb-1" style={{ color: accent || "#aaa" }}>{sub}</p>}
      <p className="text-4xl font-black leading-none" style={{ color: accent || BLACK }}>
        {value}
      </p>
      <p className="text-xs mt-1 font-medium" style={{ color: accent || "#666" }}>{unit}</p>
    </div>
  );
}

export default function Calculator() {
  // Step 1 – product selection
  const [selectedSpecies, setSelectedSpecies] = useState("");
  const [selectedSize, setSelectedSize] = useState("");
  const [selectedProfile, setSelectedProfile] = useState("");

  // Step 2 – length type
  const [lengthType, setLengthType] = useState<LengthType>("RL");

  // Step 3 – quantity
  const [quantity, setQuantity] = useState("");
  const [inputMode, setInputMode] = useState<InputMode>("lf");

  // Step 4 – waste
  const [wasteId, setWasteId] = useState<WasteId>("none");

  // Step 5 – add-ons
  const [includeMilling, setIncludeMilling] = useState(false);
  const [includePreFinishColor, setIncludePreFinishColor] = useState(false);
  const [preFinishColorType, setPreFinishColorType] = useState<PreFinishColorType>("regular");
  const [includePreFinishTexture, setIncludePreFinishTexture] = useState(false);

  // Step 6 – coating
  const [includeCoating, setIncludeCoating] = useState(false);
  const [selectedCoating, setSelectedCoating] = useState<CoatingId>("saicos_2_5L");

  // Step 7 – piece lengths (multi-select)
  const [selectedLengths, setSelectedLengths] = useState<number[]>([]);
  const [customLengthInput, setCustomLengthInput] = useState<string>("");

  const COMMON_LENGTHS = [7, 8, 9, 10, 12, 14, 16];

  const toggleLength = (ft: number) => {
    setSelectedLengths(prev =>
      prev.includes(ft) ? prev.filter(l => l !== ft) : [...prev, ft].sort((a, b) => a - b)
    );
  };

  const addCustomLength = () => {
    const val = parseFloat(customLengthInput);
    if (!isNaN(val) && val > 0 && !selectedLengths.includes(val)) {
      setSelectedLengths(prev => [...prev, val].sort((a, b) => a - b));
    }
    setCustomLengthInput("");
  };

  const [results, setResults] = useState<Results | null>(null);
  const [error, setError] = useState("");
  const [quoteOpen, setQuoteOpen] = useState(false);

  // ── Quote cart ───────────────────────────────────────────────────────────────
  const [cartItems, setCartItems] = useState<CartItem[]>([]);

  // Derived lists
  const speciesList = useMemo(() => getSpecies(), []);
  const sizeList = useMemo(() => getNominalSizes(selectedSpecies), [selectedSpecies]);
  const profileList = useMemo(() => getProfiles(selectedSpecies, selectedSize), [selectedSpecies, selectedSize]);
  const selectedProduct = useMemo(
    () => findProduct(selectedSpecies, selectedSize, selectedProfile),
    [selectedSpecies, selectedSize, selectedProfile]
  );
  const currentPrice = useMemo(
    () => (selectedProduct ? getPrice(selectedProduct, lengthType) : null),
    [selectedProduct, lengthType]
  );

  // Reset cascades
  const handleSpeciesChange = (v: string) => { setSelectedSpecies(v); setSelectedSize(""); setSelectedProfile(""); setResults(null); };
  const handleSizeChange = (v: string) => { setSelectedSize(v); setSelectedProfile(""); setResults(null); };

  const handleCalculate = () => {
    setError("");
    if (!selectedProduct) { setError("Please select species, size and profile."); return; }
    if (!quantity || isNaN(parseFloat(quantity)) || parseFloat(quantity) <= 0) {
      setError("Please enter a valid quantity."); return;
    }

    const exposedIn = parseExposedFaceInches(selectedProduct.exposedFace);
    const qty = parseFloat(quantity);
    const pricePerLF = getPrice(selectedProduct, lengthType);

    let rawLF: number, rawSqft: number;
    if (inputMode === "lf") {
      rawLF = qty;
      rawSqft = lfToSqft(rawLF, exposedIn);
    } else {
      rawSqft = qty;
      rawLF = sqftToLf(rawSqft, exposedIn);
    }

    const wastedLF = applyWaste(rawLF, wasteId);
    const wastedSqft = applyWaste(rawSqft, wasteId);
    const wasteOpt = WASTE_OPTIONS.find((w) => w.id === wasteId);
    const wastePercent = wasteOpt && wasteOpt.id !== "none" ? wasteOpt.label : "No waste";

    const materialCost = wastedLF * pricePerLF;

    const addOnConfig: AddOnConfig = {
      milling: includeMilling,
      preFinishColor: includePreFinishColor,
      preFinishColorType,
      preFinishTexture: includePreFinishTexture,
    };
    const addOnCost = calculateAddOnCost(wastedLF, addOnConfig);

    const addOnBreakdown: { label: string; amount: number }[] = [];
    if (includeMilling) {
      addOnBreakdown.push({ label: `Milling ($${MILLING_PRICE_PER_LF.toFixed(2)}/LF)`, amount: wastedLF * MILLING_PRICE_PER_LF });
    }
    if (includePreFinishColor) {
      const opt = PRE_FINISH_COLOR_OPTIONS.find((o) => o.id === preFinishColorType);
      if (opt) addOnBreakdown.push({ label: `Pre-Finish Color: ${opt.label} ($${opt.pricePerLF.toFixed(2)}/LF)`, amount: wastedLF * opt.pricePerLF });
    }
    if (includePreFinishTexture) {
      addOnBreakdown.push({ label: `Pre-Finish Texture ($${PRE_FINISH_TEXTURE_PRICE_PER_LF.toFixed(2)}/LF)`, amount: wastedLF * PRE_FINISH_TEXTURE_PRICE_PER_LF });
    }

    const totalCost = materialCost + addOnCost;

    let coatingCans: number | null = null;
    let coatingLabel = "";
    if (includeCoating) {
      coatingCans = calculateCoatingNeeded(wastedSqft, selectedCoating);
      const opt = COATING_OPTIONS.find((c) => c.id === selectedCoating);
      coatingLabel = opt ? opt.label : "";
    }

    // Piece length calculation (multi-length equal distribution)
    let pieceLengthResult: Results["pieceLengthResult"] = null;
    if (selectedLengths.length > 0) {
      const sumLengths = selectedLengths.reduce((a, b) => a + b, 0);
      const piecesEach = Math.ceil(wastedLF / sumLengths);
      const totalPieces = piecesEach * selectedLengths.length;
      const actualLF = piecesEach * sumLengths;
      const breakdown = selectedLengths.map(l => ({ length: l, pieces: piecesEach, lf: piecesEach * l }));
      pieceLengthResult = { selectedLengths, piecesEach, totalPieces, actualLF, breakdown };
    }

    setResults({
      rawLF: Math.round(rawLF * 100) / 100,
      rawSqft: Math.round(rawSqft * 100) / 100,
      wastedLF: Math.round(wastedLF * 100) / 100,
      wastedSqft: Math.round(wastedSqft * 100) / 100,
      wastePercent,
      pricePerLF,
      materialCost: Math.round(materialCost * 100) / 100,
      addOnCost: Math.round(addOnCost * 100) / 100,
      totalCost: Math.round(totalCost * 100) / 100,
      coatingCans,
      coatingLabel,
      addOnBreakdown,
      pieceLengthResult,
    });
  };

  // ── Add current result to cart ───────────────────────────────────────────────
  const handleAddToCart = () => {
    if (!results || !selectedProduct) return;
    const newItem: CartItem = {
      species: `THERMO® ${selectedSpecies}`,
      profile: selectedProfile,
      nominalSize: selectedSize,
      sqft: results.wastedSqft,
      lf: results.wastedLF,
      pricePerLF: results.pricePerLF,
      total: results.materialCost,
      addOns: results.addOnBreakdown,
      lengthType,
      speciesKey: selectedSpecies,
      profileKey: selectedProfile,
      sizeKey: selectedSize,
      neededLF: results.wastedLF,
    };
    setCartItems(prev => [...prev, newItem]);
    // Reset form for next item
    handleResetForm();
  };

  const handleRemoveCartItem = (index: number) => {
    setCartItems(prev => prev.filter((_, i) => i !== index));
  };

  const cartTotal = cartItems.reduce((sum, item) => {
    const addOnTotal = item.addOns ? item.addOns.reduce((a, ao) => a + ao.amount, 0) : 0;
    return sum + item.total + addOnTotal;
  }, 0);

  const handleResetForm = () => {
    setSelectedSpecies("");
    setSelectedSize("");
    setSelectedProfile("");
    setQuantity("");
    setWasteId("none");
    setIncludeMilling(false);
    setIncludePreFinishColor(false);
    setPreFinishColorType("regular");
    setIncludePreFinishTexture(false);
    setIncludeCoating(false);
    setSelectedLengths([]);
    setCustomLengthInput("");
    setResults(null);
    setError("");
  };

  const handleReset = () => {
    handleResetForm();
    setCartItems([]);
  };

  // Primary quote item for single-item flow (used when cart is empty)
  const primaryLineItem: QuoteLineItem | null = results && selectedProduct ? {
    species: `THERMO® ${selectedSpecies}`,
    profile: selectedProfile,
    nominalSize: selectedSize,
    sqft: results.wastedSqft,
    lf: results.wastedLF,
    pricePerLF: results.pricePerLF,
    total: results.materialCost,
    addOns: results.addOnBreakdown,
    lengthType,
  } : null;

  // All items to pass to the modal (cart items OR current result if cart empty)
  const quoteItems: CartItem[] = cartItems.length > 0
    ? cartItems
    : (primaryLineItem && selectedProduct ? [{
        ...primaryLineItem,
        speciesKey: selectedSpecies,
        profileKey: selectedProfile,
        sizeKey: selectedSize,
        neededLF: results!.wastedLF,
      }] : []);

  const canOpenQuote = quoteItems.length > 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

      {/* ── Left: Form ── */}
      <div className="lg:col-span-2 space-y-4">

        {/* Step 1 – Product Selection */}
        <StepCard step={1} title="Select Product">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-[#888]">Species</Label>
              <Select value={selectedSpecies} onValueChange={handleSpeciesChange}>
                <SelectTrigger className="h-11 border-[#E0DDD4] focus:ring-[#C9A227] focus:border-[#C9A227]">
                  <SelectValue placeholder="Select species..." />
                </SelectTrigger>
                <SelectContent>
                  {speciesList.map((s) => (
                    <SelectItem key={s} value={s}>
                      <span className="font-semibold text-[#C9A227]">THERMO®</span>
                      <span className="ml-1 text-[#1A1A1A]">{s}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-[#888]">Nominal Size</Label>
              <Select value={selectedSize} onValueChange={handleSizeChange} disabled={!selectedSpecies}>
                <SelectTrigger className="h-11 border-[#E0DDD4] focus:ring-[#C9A227] focus:border-[#C9A227]">
                  <SelectValue placeholder={selectedSpecies ? "Select size..." : "Select species first"} />
                </SelectTrigger>
                <SelectContent>
                  {sizeList.map((sz) => (
                    <SelectItem key={sz} value={sz}>{sz}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-[#888]">Profile</Label>
              <Select value={selectedProfile} onValueChange={setSelectedProfile} disabled={!selectedSize}>
                <SelectTrigger className="h-11 border-[#E0DDD4] focus:ring-[#C9A227] focus:border-[#C9A227]">
                  <SelectValue placeholder={selectedSize ? "Select profile..." : "Select size first"} />
                </SelectTrigger>
                <SelectContent>
                  {profileList.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {currentPrice !== null && (
              <div
                className="flex items-center justify-between px-4 py-3 rounded-lg"
                style={{ background: `${GOLD}15`, border: `1px solid ${GOLD}30` }}
              >
                <span className="text-sm font-semibold text-[#555]">Base price</span>
                <span className="text-lg font-black" style={{ color: GOLD }}>${currentPrice.toFixed(2)}/LF</span>
              </div>
            )}
          </div>
        </StepCard>

        {/* Step 2 – Length Type */}
        <StepCard step={2} title="Length Type">
          <div className="flex gap-2">
            <ToggleBtn active={lengthType === "RL"} onClick={() => setLengthType("RL")}>
              Random Lengths (RL)
            </ToggleBtn>
            <ToggleBtn active={lengthType === "Fixed"} onClick={() => setLengthType("Fixed")}>
              Fixed Lengths
            </ToggleBtn>
          </div>
          {lengthType === "Fixed" && currentPrice !== null && (
            <p className="text-xs mt-2 font-medium" style={{ color: GOLD }}>
              Fixed Length price: ${currentPrice.toFixed(2)}/LF
            </p>
          )}
        </StepCard>

        {/* Step 3 – Piece Lengths (multi-select) */}
        <StepCard step={3} title="Piece Lengths (optional)" icon={<Ruler className="w-4 h-4" />}>
          <p className="text-sm text-[#888] mb-3">
            Select one or more lengths. Pieces are distributed equally across all selected lengths.
            The price does not change — only the piece count.
          </p>
          {/* Common length toggles */}
          <div className="flex flex-wrap gap-2 mb-3">
            {COMMON_LENGTHS.map((ft) => (
              <button
                key={ft}
                type="button"
                onClick={() => toggleLength(ft)}
                className={`py-2 px-4 rounded-lg text-sm font-semibold border-2 transition-all ${
                  selectedLengths.includes(ft)
                    ? "text-black shadow-md"
                    : "bg-white text-[#555] border-[#E0DDD4] hover:border-[#C9A227]/50"
                }`}
                style={selectedLengths.includes(ft) ? { background: GOLD, borderColor: GOLD } : {}}
              >
                {ft}'
              </button>
            ))}
          </div>
          {/* Custom length input */}
          <div className="flex items-center gap-2 mb-2">
            <Input
              type="number"
              min="1"
              max="40"
              step="1"
              placeholder="Custom length (ft)..."
              value={customLengthInput}
              onChange={(e) => setCustomLengthInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomLength(); } }}
              className="h-10 border-[#E0DDD4] focus:ring-[#C9A227] focus:border-[#C9A227]"
            />
            <button
              type="button"
              onClick={addCustomLength}
              className="h-10 px-4 rounded-lg text-sm font-bold border-2 border-[#E0DDD4] bg-white text-[#555] hover:border-[#C9A227]/50 transition-all shrink-0"
            >
              + Add
            </button>
          </div>
          {/* Selected lengths summary */}
          {selectedLengths.length > 0 ? (
            <div
              className="mt-2 p-3 rounded-lg flex flex-wrap gap-2 items-center"
              style={{ background: `${GOLD}12`, border: `1px solid ${GOLD}30` }}
            >
              <span className="text-xs font-bold text-[#888] shrink-0">Selected:</span>
              {selectedLengths.map(l => (
                <span
                  key={l}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold text-black"
                  style={{ background: GOLD }}
                >
                  {l}'
                  <button
                    type="button"
                    onClick={() => toggleLength(l)}
                    className="ml-0.5 text-black/60 hover:text-black"
                  >
                    ×
                  </button>
                </span>
              ))}
              <button
                type="button"
                onClick={() => setSelectedLengths([])}
                className="ml-auto text-xs text-[#888] hover:text-red-500 transition-colors"
              >
                Clear all
              </button>
            </div>
          ) : (
            <p className="text-xs text-[#aaa] mt-1">No lengths selected — piece count will be skipped.</p>
          )}
        </StepCard>

        {/* Step 4 – Quantity */}
        <StepCard step={4} title="Quantity">
          <div className="space-y-3">
            <div className="flex gap-2">
              <ToggleBtn active={inputMode === "lf"} onClick={() => setInputMode("lf")}>
                Linear Feet (LF)
              </ToggleBtn>
              <ToggleBtn active={inputMode === "sqft"} onClick={() => setInputMode("sqft")}>
                Square Feet (sqft)
              </ToggleBtn>
            </div>
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder={inputMode === "lf" ? "Ex: 500 LF" : "Ex: 250 sqft"}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="h-12 text-lg font-semibold border-[#E0DDD4] focus:ring-[#C9A227] focus:border-[#C9A227]"
            />
          </div>
        </StepCard>

        {/* Step 5 – Material Waste */}
        <StepCard step={5} title="Material Waste">
          <p className="text-sm text-[#888] mb-3">Add a waste allowance to the project total.</p>
          <div className="grid grid-cols-4 gap-2">
            {WASTE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setWasteId(opt.id)}
                className={`py-2.5 px-3 rounded-lg text-sm font-semibold border-2 transition-all ${
                  wasteId === opt.id
                    ? "text-black shadow-md"
                    : "bg-white text-[#555] border-[#E0DDD4] hover:border-[#C9A227]/50"
                }`}
                style={wasteId === opt.id ? { background: GOLD, borderColor: GOLD } : {}}
              >
                {opt.id === "none" ? "None" : opt.label}
              </button>
            ))}
          </div>
          {wasteId !== "none" && (
            <p className="text-xs mt-2 font-medium" style={{ color: GOLD }}>
              Quantity divided by {WASTE_OPTIONS.find(w => w.id === wasteId)?.divisor} to cover {wasteId}% waste.
            </p>
          )}
        </StepCard>

        {/* Step 6 – Add-ons */}
        <StepCard step={6} title="Add-ons" icon={<Wrench className="w-4 h-4" />}>
          <div className="space-y-3">
            {/* Milling */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-[#E0DDD4] bg-[#FAFAF7]">
              <div>
                <p className="font-semibold text-sm text-[#1A1A1A]">Milling</p>
                <p className="text-xs text-[#888]">+${MILLING_PRICE_PER_LF.toFixed(2)}/LF</p>
              </div>
              <Switch
                id="milling-toggle"
                checked={includeMilling}
                onCheckedChange={setIncludeMilling}
                className="data-[state=checked]:bg-[#C9A227]"
              />
            </div>

            {/* Pre-Finish: Color */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-[#E0DDD4] bg-[#FAFAF7]">
              <div>
                <p className="font-semibold text-sm text-[#1A1A1A]">Pre-Finish — Color</p>
                <p className="text-xs text-[#888]">Price varies by type</p>
              </div>
              <Switch
                id="prefinish-color-toggle"
                checked={includePreFinishColor}
                onCheckedChange={setIncludePreFinishColor}
                className="data-[state=checked]:bg-[#C9A227]"
              />
            </div>
            {includePreFinishColor && (
              <div className="pl-3 space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-[#888]">Color Type</Label>
                <div className="flex gap-2">
                  {PRE_FINISH_COLOR_OPTIONS.map((opt) => (
                    <ToggleBtn
                      key={opt.id}
                      active={preFinishColorType === opt.id}
                      onClick={() => setPreFinishColorType(opt.id)}
                    >
                      {opt.label} (${opt.pricePerLF.toFixed(2)}/LF)
                    </ToggleBtn>
                  ))}
                </div>
              </div>
            )}

            {/* Pre-Finish: Texture */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-[#E0DDD4] bg-[#FAFAF7]">
              <div>
                <p className="font-semibold text-sm text-[#1A1A1A]">Pre-Finish — Texture</p>
                <p className="text-xs text-[#888]">+${PRE_FINISH_TEXTURE_PRICE_PER_LF.toFixed(2)}/LF</p>
              </div>
              <Switch
                id="prefinish-texture-toggle"
                checked={includePreFinishTexture}
                onCheckedChange={setIncludePreFinishTexture}
                className="data-[state=checked]:bg-[#C9A227]"
              />
            </div>
          </div>
        </StepCard>

        {/* Step 7 – Coating */}
        <StepCard step={7} title="Coating SAICOS" icon={<Droplet className="w-4 h-4" />}>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg border border-[#E0DDD4] bg-[#FAFAF7]">
              <div>
                <p className="font-semibold text-sm text-[#1A1A1A]">Include coating estimate</p>
                <p className="text-xs text-[#888]">Estimated SAICOS cans needed</p>
              </div>
              <Switch
                id="coating-toggle"
                checked={includeCoating}
                onCheckedChange={setIncludeCoating}
                className="data-[state=checked]:bg-[#C9A227]"
              />
            </div>
            {includeCoating && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-[#888]">Can Size</Label>
                <Select value={selectedCoating} onValueChange={(v) => setSelectedCoating(v as CoatingId)}>
                  <SelectTrigger className="h-11 border-[#E0DDD4] focus:ring-[#C9A227] focus:border-[#C9A227]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="saicos_2_5L">SAICOS 2.5L — Coverage: 170 sqft/can</SelectItem>
                    <SelectItem value="saicos_10L">SAICOS 10L — Coverage: 680 sqft/can</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </StepCard>

        {/* Action buttons */}
        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 font-medium">
            {error}
          </div>
        )}
        <div className="flex gap-3">
          <button
            onClick={handleCalculate}
            disabled={!selectedProduct || !quantity}
            className="flex-1 h-12 rounded-xl font-black text-sm uppercase tracking-widest text-black transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-md hover:shadow-lg active:scale-[0.98]"
            style={{ background: GOLD }}
          >
            <CalculatorIcon className="w-4 h-4" />
            Calculate
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={handleReset}
            className="h-12 px-5 rounded-xl font-semibold text-sm border-2 border-[#E0DDD4] bg-white text-[#555] hover:border-[#C9A227]/50 transition-all flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
        </div>
      </div>

      {/* ── Right: Results + Cart ── */}
      <div className="lg:col-span-1 space-y-4">

        {/* ── Quote Cart ── */}
        {cartItems.length > 0 && (
          <div className="bg-white rounded-xl border-2 overflow-hidden" style={{ borderColor: GOLD }}>
            {/* Cart header */}
            <div className="flex items-center justify-between px-4 py-3" style={{ background: BLACK }}>
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-4 h-4" style={{ color: GOLD }} />
                <span className="text-xs font-black uppercase tracking-widest" style={{ color: GOLD }}>
                  Quote — {cartItems.length} {cartItems.length === 1 ? "item" : "items"}
                </span>
              </div>
              <button
                onClick={() => setQuoteOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black text-black transition-all hover:opacity-90"
                style={{ background: GOLD }}
              >
                <FileText className="w-3.5 h-3.5" />
                Generate PDF
              </button>
            </div>

            {/* Cart items */}
            <div className="divide-y divide-[#F0EDE4]">
              {cartItems.map((item, idx) => {
                const addOnTotal = item.addOns ? item.addOns.reduce((a, ao) => a + ao.amount, 0) : 0;
                const itemTotal = item.total + addOnTotal;
                return (
                  <div key={idx} className="px-4 py-3 flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black text-[#1A1A1A] truncate">{item.species}</p>
                      <p className="text-xs text-[#666] truncate">{item.profile} · {item.nominalSize}</p>
                      <p className="text-xs text-[#888]">{item.lf.toLocaleString("en-US", { maximumFractionDigits: 1 })} LF · {item.sqft.toLocaleString("en-US", { maximumFractionDigits: 1 })} sqft</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-black" style={{ color: GOLD }}>
                        ${itemTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <button
                        onClick={() => handleRemoveCartItem(idx)}
                        className="w-6 h-6 rounded-md flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Cart total */}
            <div className="px-4 py-3 flex justify-between items-center" style={{ background: `${GOLD}15`, borderTop: `1px solid ${GOLD}30` }}>
              <span className="text-xs font-black uppercase tracking-wider text-[#555]">Total Quote</span>
              <span className="text-lg font-black" style={{ color: BLACK }}>
                ${cartTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        )}

        {/* ── Current Calculation Results ── */}
        {results ? (
          <div className="space-y-4 sticky top-24">
            {/* Header */}
            <div className="flex items-center justify-between">
              <p className="text-xs font-black uppercase tracking-widest text-[#888]">Results</p>
              <div className="flex gap-2">
                {/* Add to cart button */}
                <button
                  onClick={handleAddToCart}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all hover:shadow-md"
                  style={{ borderColor: GOLD, color: BLACK, background: "white" }}
                  title="Add to quote and calculate another product"
                >
                  <Plus className="w-3.5 h-3.5" style={{ color: GOLD }} />
                  Add to Quote
                </button>
                {/* Generate quote (single item or open modal) */}
                <button
                  onClick={() => setQuoteOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-black transition-all hover:shadow-md"
                  style={{ background: GOLD }}
                >
                  <FileText className="w-3.5 h-3.5" />
                  Generate Quote
                </button>
              </div>
            </div>

            {/* Length type badge */}
            <div
              className="text-center py-1.5 px-3 rounded-full text-xs font-bold"
              style={{ background: `${GOLD}20`, color: "#8a6d10", border: `1px solid ${GOLD}40` }}
            >
              {lengthType === "RL" ? "Random Lengths (RL)" : "Fixed Lengths"} — ${results.pricePerLF.toFixed(2)}/LF
            </div>

            {/* LF */}
            <MetricCard
              label="Linear Feet"
              value={results.wastedLF.toLocaleString()}
              unit={`LF${results.wastePercent !== "No waste" ? " (with waste)" : ""}`}
              sub={results.wastePercent !== "No waste" ? `Base: ${results.rawLF.toLocaleString()} LF ÷ ${WASTE_OPTIONS.find(w => w.id === wasteId)?.divisor ?? 1} (${results.wastePercent})` : undefined}
              accent={GOLD}
            />

            {/* sqft */}
            <MetricCard
              label="Square Feet"
              value={results.wastedSqft.toLocaleString()}
              unit={`sqft${results.wastePercent !== "No waste" ? " (with waste)" : ""}`}
              sub={results.wastePercent !== "No waste" ? `Base: ${results.rawSqft.toLocaleString()} sqft ÷ ${WASTE_OPTIONS.find(w => w.id === wasteId)?.divisor ?? 1} (${results.wastePercent})` : undefined}
              accent="#555"
            />

            {/* Piece count result */}
            {results.pieceLengthResult && (
              <div
                className="rounded-xl p-4 border-2"
                style={{ borderColor: "#1A1A1A", background: "#1A1A1A" }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <Ruler className="w-4 h-4" style={{ color: GOLD }} />
                  <p className="text-xs font-black uppercase tracking-widest" style={{ color: GOLD }}>
                    {results.pieceLengthResult.selectedLengths.length === 1
                      ? `Pieces — ${results.pieceLengthResult.selectedLengths[0]}' each`
                      : `Pieces — ${results.pieceLengthResult.selectedLengths.join("', ")}' (equal distribution)`}
                  </p>
                </div>
                {/* Summary row */}
                <div className="flex items-end gap-4 mb-3">
                  <div>
                    <p className="text-5xl font-black text-white leading-none">{results.pieceLengthResult.totalPieces}</p>
                    <p className="text-xs text-white/50 mt-1">total pieces</p>
                  </div>
                  <div className="pb-1">
                    <p className="text-sm font-black" style={{ color: GOLD }}>
                      = {results.pieceLengthResult.actualLF.toLocaleString()} LF actual
                    </p>
                    <p className="text-xs text-white/40">
                      base: {results.wastedLF.toLocaleString()} LF ÷ {results.pieceLengthResult.selectedLengths.reduce((a,b)=>a+b,0)}' = {(results.wastedLF / results.pieceLengthResult.selectedLengths.reduce((a,b)=>a+b,0)).toFixed(2)} → rounded up
                    </p>
                  </div>
                </div>
                {/* Per-length breakdown */}
                {results.pieceLengthResult.breakdown.length > 1 && (
                  <div className="space-y-1 border-t border-white/10 pt-3">
                    <p className="text-xs font-bold text-white/40 uppercase tracking-wider mb-2">Breakdown by length</p>
                    {results.pieceLengthResult.breakdown.map(row => (
                      <div key={row.length} className="flex justify-between text-xs">
                        <span className="text-white/60">{row.pieces} pcs × {row.length}'</span>
                        <span className="font-bold" style={{ color: GOLD }}>{row.lf} LF</span>
                      </div>
                    ))}
                  </div>
                )}
                {results.pieceLengthResult.actualLF !== results.wastedLF && (
                  <p className="text-xs mt-2 font-medium" style={{ color: "#aaa" }}>
                    +{(results.pieceLengthResult.actualLF - results.wastedLF).toFixed(1)} LF extra vs. base (rounding)
                  </p>
                )}
              </div>
            )}

            {/* Price breakdown */}
            <div className="bg-white rounded-xl border border-[#E8E5DC] overflow-hidden">
              <div className="px-4 py-3 border-b border-[#E8E5DC] bg-[#FAFAF7]">
                <p className="text-xs font-black uppercase tracking-widest text-[#888]">Price Breakdown</p>
              </div>
              <div className="p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-[#666]">Material ({results.wastedLF} LF × ${results.pricePerLF.toFixed(2)})</span>
                  <span className="font-semibold text-[#1A1A1A]">
                    ${results.materialCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                {results.addOnBreakdown.map((item, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-[#666]">{item.label}</span>
                    <span className="font-semibold" style={{ color: GOLD }}>
                      +${item.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                ))}
                <div
                  className="pt-3 mt-2 flex justify-between items-center rounded-lg px-3 py-2"
                  style={{ background: GOLD }}
                >
                  <span className="font-black text-black text-sm uppercase tracking-wide">Total</span>
                  <span className="font-black text-black text-xl">
                    ${results.totalCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

            {/* Coating */}
            {results.coatingCans !== null && (
              <div
                className="rounded-xl p-4 border"
                style={{ borderColor: "#C9A22740", background: "#C9A22710" }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Droplet className="w-4 h-4" style={{ color: GOLD }} />
                  <p className="text-xs font-black uppercase tracking-widest" style={{ color: GOLD }}>
                    Coating Required
                  </p>
                </div>
                <p className="text-4xl font-black text-[#1A1A1A]">{results.coatingCans}</p>
                <p className="text-xs text-[#666] mt-1">cans of {results.coatingLabel}</p>
                <p className="text-xs text-[#888] mt-0.5">Base: {results.wastedSqft.toLocaleString()} sqft</p>
              </div>
            )}
          </div>
        ) : (
          <div className="sticky top-24 bg-white rounded-xl border border-[#E8E5DC] flex flex-col items-center justify-center py-16 text-center">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
              style={{ background: `${GOLD}15` }}
            >
              <CalculatorIcon className="w-8 h-8" style={{ color: GOLD }} />
            </div>
            <p className="font-bold text-[#1A1A1A]">No calculation yet</p>
            <p className="text-sm text-[#888] mt-1 max-w-[200px]">
              Fill in the form and click "Calculate"
            </p>
            {cartItems.length === 0 && (
              <p className="text-xs text-[#aaa] mt-2 max-w-[200px]">
                You can add multiple products to the same quote before generating the PDF
              </p>
            )}
          </div>
        )}
      </div>

      {/* Quote Modal */}
      {canOpenQuote && (
        <QuoteModal
          open={quoteOpen}
          onClose={() => setQuoteOpen(false)}
          items={quoteItems}
        />
      )}
    </div>
  );
}
