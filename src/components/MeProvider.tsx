"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";

export type Shortcut = { id: string; title: string; href: string; external: boolean; sort: number };

type Me = {
  loaded: boolean;
  userId: string | null;
  /** The signed-in person's org-chart entry (people.id), once they've claimed it. */
  personId: string | null;
  name: string;
  role: "member" | "leader" | "admin";
  departmentId: string | null;
  isAdmin: boolean;
  /** Admins manage everything; a leader manages their own department. */
  canManage: (department: string | null | undefined) => boolean;
  shortcuts: Shortcut[];
  isShortcut: (href: string) => boolean;
  toggleShortcut: (s: { title: string; href: string; external?: boolean }) => Promise<void>;
};

const Ctx = createContext<Me | null>(null);

/** Who's signed in (role, department, people entry) and their pinned shortcuts — for the whole intranet. */
export function MeProvider({ isAdmin, children }: { isAdmin: boolean; children: React.ReactNode }) {
  const [state, setState] = useState<{ loaded: boolean; userId: string | null; personId: string | null; name: string; role: Me["role"]; departmentId: string | null }>({
    loaded: false, userId: null, personId: null, name: "", role: "member", departmentId: null,
  });
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    let active = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !active) return;
      // First visit: create the intranet profile for this login (no-op afterwards).
      await supabase.rpc("ensure_my_profile");
      const [profile, person, cuts] = await Promise.all([
        supabase.from("profiles").select("role, department_id, full_name").eq("user_id", user.id).maybeSingle(),
        supabase.from("people").select("id, full_name").eq("user_id", user.id).maybeSingle(),
        supabase.from("shortcuts").select("id, title, href, external, sort").order("sort").order("created_at"),
      ]);
      if (!active) return;
      setState({
        loaded: true,
        userId: user.id,
        personId: person.data?.id ?? null,
        name: person.data?.full_name || profile.data?.full_name || (user.user_metadata?.name as string | undefined) || user.email || "",
        role: (profile.data?.role as Me["role"]) ?? "member",
        departmentId: profile.data?.department_id ?? null,
      });
      setShortcuts((cuts.data as Shortcut[] | null) ?? []);
    })();
    return () => {
      active = false;
    };
  }, []);

  const admin = isAdmin || state.role === "admin";
  const canManage = useCallback(
    (department: string | null | undefined) => admin || (state.role === "leader" && !!department && department === state.departmentId),
    [admin, state.role, state.departmentId],
  );

  const toggleShortcut = useCallback(
    async ({ title, href, external = false }: { title: string; href: string; external?: boolean }) => {
      const supabase = getSupabase();
      if (!supabase) return;
      const existing = shortcuts.find(s => s.href === href);
      if (existing) {
        setShortcuts(list => list.filter(s => s.id !== existing.id));
        const { error } = await supabase.from("shortcuts").delete().eq("id", existing.id);
        if (error) {
          toast.error(error.message);
          setShortcuts(list => [...list, existing]);
        }
      } else {
        const { data, error } = await supabase
          .from("shortcuts")
          .insert({ title, href, external, sort: shortcuts.length })
          .select("id, title, href, external, sort")
          .single();
        if (error) toast.error(error.message);
        else setShortcuts(list => [...list, data as Shortcut]);
      }
    },
    [shortcuts],
  );

  const value = useMemo<Me>(
    () => ({
      ...state,
      isAdmin: admin,
      canManage,
      shortcuts,
      isShortcut: (href: string) => shortcuts.some(s => s.href === href),
      toggleShortcut,
    }),
    [state, admin, canManage, shortcuts, toggleShortcut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMe(): Me {
  const v = useContext(Ctx);
  if (!v) throw new Error("useMe outside MeProvider");
  return v;
}
