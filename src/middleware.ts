import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

/** Route prefix each role is allowed into. */
const ROLE_ROOT: Record<string, string> = {
  SUPER_ADMIN: "/admin",
  OPS_MANAGER: "/admin",
  WORKER: "/worker",
  AMBASSADOR: "/ambassador",
  CLIENT: "/client",
};

export default auth((req) => {
  const { nextUrl } = req;
  const user = req.auth?.user;
  const path = nextUrl.pathname;

  // Whole path segments only — `/ambassador-panel/*` is a public page and must
  // not be caught by the `/ambassador` portal prefix.
  const under = (root: string) => path === root || path.startsWith(`${root}/`);
  // /client/login is the clients' public sign-in; the rest of /client is theirs alone.
  const isClientLogin = path === "/client/login";
  const isProtected = under("/admin") || under("/worker") || under("/ambassador") || (under("/client") && !isClientLogin);

  // Client sessions last 14 days from sign-in (a client's projects are private).
  const CLIENT_SESSION_MS = 14 * 24 * 3_600_000;
  const clientExpired =
    user?.role === "CLIENT" && (!user.loginAt || Date.now() - user.loginAt > CLIENT_SESSION_MS);
  if (clientExpired && under("/client") && !isClientLogin) {
    return NextResponse.redirect(new URL("/client/login", nextUrl));
  }

  // Signed in and heading to a sign-in page → bounce to their own dashboard
  if ((path === "/login" || isClientLogin) && user && !clientExpired) {
    return NextResponse.redirect(new URL(ROLE_ROOT[user.role] ?? "/", nextUrl));
  }

  if (!isProtected) return NextResponse.next();

  if (!user) {
    const login = new URL(under("/client") ? "/client/login" : "/login", nextUrl);
    login.searchParams.set("callbackUrl", path);
    return NextResponse.redirect(login);
  }

  // A worker who is also an ambassador (or the reverse) may open both portals. The
  // edge cannot query the database, so it lets either role into either root and the
  // portal's own layout sends them back unless they really have that profile.
  const allowedRoots =
    user.role === "WORKER" || user.role === "AMBASSADOR" ? [ROLE_ROOT[user.role], "/worker", "/ambassador"] : [ROLE_ROOT[user.role]].filter(Boolean);

  // Wrong portal for this role → send them to their own
  if (!allowedRoots.some((root) => under(root))) {
    return NextResponse.redirect(new URL(allowedRoots[0] ?? "/", nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|images|icons|favicon.ico|manifest.webmanifest|sw.js|offline|.*\\.png$).*)",
  ],
};
