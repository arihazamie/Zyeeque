import { NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/api/auth/login"];

export function middleware(request) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Check auth cookie
  const token = request.cookies.get("zyeeque_auth")?.value;
  const secret = process.env.AUTH_SECRET;

  if (!secret) {
    console.error("[Auth] AUTH_SECRET is not set in environment variables.");
    return NextResponse.next(); // fail-open only if misconfigured
  }

  if (token !== secret) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
