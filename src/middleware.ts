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
};

export default auth((req) => {
  const { nextUrl } = req;
  const user = req.auth?.user;
  const path = nextUrl.pathname;

  // Whole path segments only — `/ambassador-panel/*` is a public page and must
  // not be caught by the `/ambassador` portal prefix.
  const under = (root: string) => path === root || path.startsWith(`${root}/`);
  const isProtected = under("/admin") || under("/worker") || under("/ambassador");

  // Signed in and heading to /login → bounce to their own dashboard
  if (path === "/login" && user) {
    return NextResponse.redirect(new URL(ROLE_ROOT[user.role] ?? "/", nextUrl));
  }

  if (!isProtected) return NextResponse.next();

  if (!user) {
    const login = new URL("/login", nextUrl);
    login.searchParams.set("callbackUrl", path);
    return NextResponse.redirect(login);
  }

  const allowedRoot = ROLE_ROOT[user.role];

  // Wrong portal for this role → send them to the right one
  if (!allowedRoot || !under(allowedRoot)) {
    return NextResponse.redirect(new URL(allowedRoot ?? "/", nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|images|favicon.ico|.*\\.png$).*)"],
};
