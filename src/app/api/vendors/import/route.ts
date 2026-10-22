import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sanitizeImportRow, type ImportRow } from "@/lib/vendors";
import { importVendors, previewImport, vendorRoles } from "@/server/vendors";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_ROWS = 5000;

/**
 * Finance / admins: import the bank's current beneficiaries as "legacy_pending".
 * Body: { rows: ImportRow[] (already mapped in the browser, bank numbers reduced to the last 4),
 *         companyIds: string[], dryRun?: boolean }. The rows are re-checked here.
 */
export async function POST(request: Request) {
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const roles = await vendorRoles(supabase);
  if (!roles.isFinance && !roles.isAdmin) return NextResponse.json({ error: "Finance or admins only" }, { status: 403 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });

  const body = (await request.json().catch(() => null)) as { rows?: unknown[]; companyIds?: unknown; dryRun?: unknown } | null;
  if (!body || !Array.isArray(body.rows)) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  if (body.rows.length > MAX_ROWS) return NextResponse.json({ error: `At most ${MAX_ROWS} rows per import` }, { status: 413 });
  const rows = body.rows.map(sanitizeImportRow).filter((r): r is ImportRow => r !== null);
  const { data: companies } = await admin.from("companies").select("id");
  const known = new Set(((companies as { id: string }[] | null) ?? []).map(c => c.id));
  const companyIds = Array.isArray(body.companyIds) ? [...new Set(body.companyIds.filter((c): c is string => typeof c === "string" && known.has(c)))] : [];

  try {
    if (body.dryRun !== false) return NextResponse.json({ preview: await previewImport(admin, rows), dropped: body.rows.length - rows.length });
    return NextResponse.json(await importVendors(admin, rows, companyIds));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
