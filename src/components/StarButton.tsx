"use client";

import { Star } from "lucide-react";
import { useMe } from "@/components/MeProvider";
import { useI18n } from "@/components/I18nProvider";

/** ☆ / ★ toggle that pins a tool or link to the viewer's shortcuts on the home page. */
export default function StarButton({ title, href, external, className = "" }: { title: string; href: string; external?: boolean; className?: string }) {
  const me = useMe();
  const { t } = useI18n();
  const on = me.isShortcut(href);
  return (
    <button
      type="button"
      onClick={e => {
        e.preventDefault();
        e.stopPropagation();
        void me.toggleShortcut({ title, href, external });
      }}
      aria-pressed={on}
      aria-label={on ? t.shortcuts.remove : t.shortcuts.add}
      title={on ? t.shortcuts.remove : t.shortcuts.add}
      className={`rounded p-1 transition-colors hover:bg-gray-100 ${className}`}
    >
      <Star className={`h-4 w-4 ${on ? "fill-amber-400 text-amber-400" : "text-gray-300 hover:text-gray-500"}`} />
    </button>
  );
}
