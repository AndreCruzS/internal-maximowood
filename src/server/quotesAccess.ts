import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/admin";
import type { SavedQuote } from "@/lib/quotes";

type QuotesAccess =
  | { ok: true; db: SupabaseClient; user: User; isAdmin: boolean }
  | { ok: false; status: 401; error: string };

/**
 * The client a quotes route should query with.
 *
 * Salespeople get their own session, so RLS limits them to their own quotes.
 * Admins (CALCULATOR_ADMIN_EMAILS / app_metadata.role) get the service-role
 * client, which bypasses RLS — they can see and manage every quote.
 */
export async function getQuotesAccess(): Promise<QuotesAccess> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, status: 401, error: "Supabase auth is not configured" };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "Unauthorized" };

  if (isAdminUser(user)) {
    const admin = getSupabaseAdmin();
    // Without the service key an admin just sees their own quotes.
    if (admin) return { ok: true, db: admin, user, isAdmin: true };
  }
  return { ok: true, db: supabase, user, isAdmin: false };
}

type Owner = NonNullable<SavedQuote["owner"]>;

const toOwner = (u: Pick<User, "email" | "user_metadata">): Owner => ({
  email: u.email ?? null,
  name: (u.user_metadata?.name as string | undefined) ?? null,
});

/** Admin only: attach salesperson name/email to every quote. */
export async function withOwners(quotes: SavedQuote[]): Promise<SavedQuote[]> {
  const admin = getSupabaseAdmin();
  if (!admin || quotes.length === 0) return quotes;

  const owners = new Map<string, Owner>();
  const perPage = 200;
  for (let page = 1; page <= 25; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) break;
    for (const u of data.users) owners.set(u.id, toOwner(u));
    if (data.users.length < perPage) break;
  }
  return quotes.map(q => ({ ...q, owner: owners.get(q.ownerId) ?? null }));
}

/** Admin only: attach the owner when the quote belongs to someone else. */
export async function withOwner(quote: SavedQuote, viewer: User): Promise<SavedQuote> {
  if (quote.ownerId === viewer.id) return quote;
  const admin = getSupabaseAdmin();
  if (!admin) return quote;
  const { data } = await admin.auth.admin.getUserById(quote.ownerId);
  return { ...quote, owner: data.user ? toOwner(data.user) : null };
}
