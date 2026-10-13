import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Next.js 16 renamed Middleware to Proxy; the file must sit beside `app/`.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image files, so the auth cookie is
     * refreshed on real navigations only.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?)$).*)",
  ],
};
