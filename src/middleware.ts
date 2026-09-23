import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";
import { isClientSessionExpired, isPersonRole, PORTAL_ROOTS } from "@/lib/roles";

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
  const clientExpired = isClientSessionExpired(user);
  // Where to come back to after signing in: the path AND its query string, so a
  // Paystack return (?payment=success&reference=…) survives the detour.
  const backTo = `${path}${nextUrl.search}`;
  // (A client-first login that also holds a worker or ambassador profile gets the
  // same 14 days everywhere.)
  if (clientExpired && isProtected) {
    const login = new URL(under("/client") ? "/client/login" : "/login", nextUrl);
    login.searchParams.set("callbackUrl", backTo);
    return NextResponse.redirect(login);
  }

  // Sign-in pages stay reachable while signed in: they say who is signed in and
  // signing in again replaces the session. (Silently bouncing to the current
  // account's dashboard made "sign in as the worker" land on the admin area.)

  if (!isProtected) return NextResponse.next();

  if (!user) {
    const login = new URL(under("/client") ? "/client/login" : "/login", nextUrl);
    login.searchParams.set("callbackUrl", backTo);
    return NextResponse.redirect(login);
  }

  // One person can be a worker, an ambassador and a client on the same login. The
  // edge cannot query the database, so it lets any of those logins into all three
  // roots and each portal's own layout sends them home unless they really hold
  // that profile. Staff stay in /admin.
  const allowedRoots = isPersonRole(user.role)
    ? [ROLE_ROOT[user.role], ...Object.values(PORTAL_ROOTS)]
    : [ROLE_ROOT[user.role]].filter(Boolean);

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
