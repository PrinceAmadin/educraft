import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe half of the auth config.
 *
 * Middleware runs on the edge runtime, where Prisma and bcrypt can't load.
 * This file holds only what middleware needs (callbacks, pages, session
 * strategy); the Credentials provider that touches the database lives in
 * `auth.ts`, which runs in the Node runtime.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  trustHost: true,
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        // Fail closed: a sign-in that somehow has no role gets an empty role,
        // which no route or API accepts. (It used to default to CLIENT.)
        token.role = (user as { role?: string }).role ?? "";
        token.name = user.name ?? null;
        token.portals = (user as { portals?: string[] }).portals ?? [];
        token.loginAt = Date.now();
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = (token.role as string) ?? "";
        session.user.portals = (token.portals as string[] | undefined) ?? [];
        session.user.loginAt = (token.loginAt as number | undefined) ?? 0;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
