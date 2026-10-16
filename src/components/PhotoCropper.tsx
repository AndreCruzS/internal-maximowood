"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Move, X, ZoomIn, ZoomOut } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";

const VIEW = 288; // on-screen crop square, px
const OUT = 512; // saved photo, px
const MAX_ZOOM = 4;

/** Zoom and drag a photo inside a circle, then save it as a square JPEG. */
export default function PhotoCropper({ src, onCancel, onSave }: {
  src: string;
  onCancel: () => void;
  onSave: (blob: Blob) => Promise<void> | void;
}) {
  const { t } = useI18n();
  const imgRef = useRef<HTMLImageElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);

  // Scale at zoom 1 makes the short side fill the square.
  const scale = size ? (VIEW / Math.min(size.w, size.h)) * zoom : 1;
  const W = (size?.w ?? 0) * scale;
  const H = (size?.h ?? 0) * scale;
  const clamp = (o: { x: number; y: number }, w = W, h = H) => ({
    x: Math.max(-(w - VIEW) / 2, Math.min((w - VIEW) / 2, o.x)),
    y: Math.max(-(h - VIEW) / 2, Math.min((h - VIEW) / 2, o.y)),
  });

  const zoomTo = (z: number) => {
    if (!size) return;
    const nz = Math.max(1, Math.min(MAX_ZOOM, z));
    const ns = (VIEW / Math.min(size.w, size.h)) * nz;
    // Keep the same point under the centre while zooming.
    const r = ns / scale;
    setZoom(nz);
    setOff(o => clamp({ x: o.x * r, y: o.y * r }, size.w * ns, size.h * ns));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  // Wheel zoom needs a non-passive listener to stop the page scrolling.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => { e.preventDefault(); zoomTo(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08)); };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  const save = async () => {
    const img = imgRef.current;
    if (!img || !size) return;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = OUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const k = OUT / VIEW;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, OUT, OUT);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, (VIEW / 2 + off.x - W / 2) * k, (VIEW / 2 + off.y - H / 2) * k, W * k, H * k);
    const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, "image/jpeg", 0.9));
    if (!blob) return;
    setBusy(true);
    try { await onSave(blob); } finally { setBusy(false); }
  };

  const nudge = (dx: number, dy: number) => setOff(o => clamp({ x: o.x + dx, y: o.y + dy }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <div role="dialog" aria-modal="true" aria-labelledby="crop-title" onClick={e => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h2 id="crop-title" className="text-lg font-black text-gray-900">{t.me.adjustPhoto}</h2>
          <button type="button" onClick={onCancel} aria-label={t.common.cancel} className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4 p-5">
          <div
            ref={boxRef}
            tabIndex={0}
            aria-label={t.me.dragToMove}
            onKeyDown={e => {
              const step = e.shiftKey ? 20 : 5;
              const moves: Record<string, [number, number]> = { ArrowUp: [0, -step], ArrowDown: [0, step], ArrowLeft: [-step, 0], ArrowRight: [step, 0] };
              if (moves[e.key]) { e.preventDefault(); nudge(...moves[e.key]); }
              if (e.key === "+" || e.key === "=") zoomTo(zoom * 1.1);
              if (e.key === "-") zoomTo(zoom / 1.1);
            }}
            onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, ox: off.x, oy: off.y }; }}
            onPointerMove={e => { const g = drag.current; if (g) setOff(clamp({ x: g.ox + e.clientX - g.x, y: g.oy + e.clientY - g.y })); }}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
            className="relative mx-auto cursor-grab touch-none select-none overflow-hidden rounded-xl bg-gray-900 outline-none focus-visible:ring-2 focus-visible:ring-[#009f67] active:cursor-grabbing"
            style={{ width: VIEW, height: VIEW }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={src}
              alt=""
              draggable={false}
              onLoad={e => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              className="pointer-events-none absolute left-0 top-0 max-w-none"
              style={size ? { width: W, height: H, transform: `translate(${VIEW / 2 + off.x - W / 2}px, ${VIEW / 2 + off.y - H / 2}px)` } : { opacity: 0 }}
            />
            {/* Circle guide: what shows on cards and the org chart. */}
            <div className="pointer-events-none absolute inset-0 rounded-full" style={{ boxShadow: "0 0 0 999px rgba(0,0,0,0.45)", border: "2px solid rgba(255,255,255,0.9)" }} />
            {!size && <Loader2 className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 animate-spin text-white" />}
          </div>
          <p className="flex items-center justify-center gap-1.5 text-xs text-gray-500"><Move className="h-3.5 w-3.5" /> {t.me.dragToMove}</p>
          <label className="flex items-center gap-3">
            <button type="button" onClick={() => zoomTo(zoom / 1.2)} aria-label={t.me.zoomOut} className="rounded p-1 text-gray-500 hover:bg-gray-100"><ZoomOut className="h-4 w-4" /></button>
            <input type="range" min={1} max={MAX_ZOOM} step={0.01} value={zoom} onChange={e => zoomTo(Number(e.target.value))} aria-label={t.me.zoom} className="flex-1 accent-[#009f67]" />
            <button type="button" onClick={() => zoomTo(zoom * 1.2)} aria-label={t.me.zoomIn} className="rounded p-1 text-gray-500 hover:bg-gray-100"><ZoomIn className="h-4 w-4" /></button>
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-4">
          <button type="button" onClick={onCancel} className="h-10 rounded-lg px-4 text-sm font-bold text-gray-700 hover:bg-gray-100">{t.common.cancel}</button>
          <button type="button" onClick={save} disabled={!size || busy} className="flex h-10 items-center gap-2 rounded-lg bg-[#009f67] px-5 text-sm font-bold text-white hover:bg-[#00704a] disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t.me.savePhoto}
          </button>
        </div>
      </div>
    </div>
  );
}
