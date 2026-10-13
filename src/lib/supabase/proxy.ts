import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured, publicEnv } from "@/lib/env";

/** Routes reachable without a session. */
const PUBLIC_PREFIXES = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/auth",
];

function isPublicPath(pathname: string) {
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/**
 * Refreshes the Supabase session cookie and performs an *optimistic* redirect
 * (SPEC §44 / Next.js proxy guidance). This is not the authorization boundary —
 * RLS and per-page server checks are. It only keeps signed-out users from
 * loading app chrome they cannot use.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Without env vars the app cannot authenticate at all; let pages render
  // their own configuration error rather than redirect-looping here.
  if (!isSupabaseConfigured()) return response;

  const env = publicEnv();

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Must be getUser(), not getSession() — getSession does not revalidate the
  // JWT and can be spoofed by a forged cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // /reset-password is intentionally excluded: the recovery link signs the
  // user in *before* they choose a new password, so a signed-in user must be
  // able to reach it. /auth/* is the callback handler and never redirects.
  const reachableWhileSignedIn =
    pathname.startsWith("/auth") || pathname.startsWith("/reset-password");

  if (user && isPublicPath(pathname) && !reachableWhileSignedIn) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
