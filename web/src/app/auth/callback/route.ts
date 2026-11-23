import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Where the links in Supabase's emails land (confirm sign-up, reset
// password): swaps the one-time code for a session, then goes on.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next");
  // Only our own paths, never another site.
  const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${target}`);
  }
  // A reset link that didn't work: ask for a new one, not "just sign in".
  return NextResponse.redirect(target.startsWith("/reset") ? `${origin}/forgot?error=link` : `${origin}/login?error=link`);
}
