import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Exchanges the one-time code from a confirmation or recovery email for a
 * session cookie, then forwards the user on.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "/dashboard";
  const next =
    nextParam.startsWith("/") && !nextParam.startsWith("//")
      ? nextParam
      : "/dashboard";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[auth] exchangeCodeForSession", error.code, error.message);
    return NextResponse.redirect(`${origin}/login?error=link_expired`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
