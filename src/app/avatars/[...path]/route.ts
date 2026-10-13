import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { AVATAR_BUCKET } from "@/lib/profile";

/** Profile photos for signed-in people: redirects to a 1-hour signed URL (the bucket is private). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) return new NextResponse(null, { status: 401 });
  const { data, error } = await supabase.storage.from(AVATAR_BUCKET).createSignedUrl(path.map(decodeURIComponent).join("/"), 3600);
  if (error || !data) return new NextResponse("Not found", { status: 404 });
  const res = NextResponse.redirect(data.signedUrl);
  res.headers.set("Cache-Control", "private, max-age=1800");
  return res;
}
