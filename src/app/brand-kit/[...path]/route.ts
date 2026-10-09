import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

/** Opens a brand-kit file for signed-in people: redirects to a 5-minute signed URL. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) return NextResponse.redirect(new URL("/login", request.url));
  const { data, error } = await supabase.storage.from("brand-kit").createSignedUrl(path.map(decodeURIComponent).join("/"), 300);
  if (error || !data) return new NextResponse("File not found", { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
