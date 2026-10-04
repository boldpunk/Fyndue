import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/register", "/about"];

/**
 * Optimistic redirect only — checks that a session cookie exists. The real
 * authorization boundary is requireUser() + userId-scoped services.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(getSessionCookie(request));
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!hasSession && !isPublic) {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Everything except API routes, Next internals and static files.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|icon|apple-icon|.*\\.(?:png|svg|jpg|ico|webmanifest)$).*)"],
};
