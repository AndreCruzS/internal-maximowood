"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { PLAYBOOK_BUCKET } from "@/lib/playbooks";

/** Signed (1 h) URLs for private playbook images, keyed by storage path. */
export function useSignedUrls(paths: string[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = [...new Set(paths)].sort().join("|");

  useEffect(() => {
    const supabase = getSupabase();
    const missing = key ? key.split("|").filter(p => !urls[p]) : [];
    if (!supabase || missing.length === 0) return;
    let active = true;
    supabase.storage
      .from(PLAYBOOK_BUCKET)
      .createSignedUrls(missing, 3600)
      .then(({ data }) => {
        if (!active || !data) return;
        const fresh: Record<string, string> = {};
        for (const d of data) if (d.path && d.signedUrl) fresh[d.path] = d.signedUrl;
        setUrls(u => ({ ...u, ...fresh }));
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return urls;
}
