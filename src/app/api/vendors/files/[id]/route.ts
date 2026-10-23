import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Opens a vendor document (bank proof, W-9, contract…) through a short-lived signed link. RLS on
 * vendor_files decides who may see it: the uploader, the department head, vendor staff.
 */
export async function GET(_request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data } = await supabase.from("vendor_files").select("path, file_name").eq("id", id).maybeSingle();
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  const f = data as { path: string; file_name: string };
  const { data: signed, error } = await admin.storage.from("vendors").createSignedUrl(f.path, 60, { download: f.file_name || true });
  if (error || !signed) return NextResponse.json({ error: error?.message ?? "Couldn't open the file" }, { status: 500 });
  return NextResponse.redirect(signed.signedUrl, { headers: { "Cache-Control": "no-store" } });
}
