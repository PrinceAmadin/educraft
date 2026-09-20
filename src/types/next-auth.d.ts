import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      /** Dashboards this login can open: "worker" and/or "ambassador" (one login, several profiles). */
      portals: string[];
      /** ms epoch of this sign-in; client sessions expire after 14 days. */
      loginAt: number;
    } & DefaultSession["user"];
  }

  interface User {
    role?: string;
    portals?: string[];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: string;
    portals?: string[];
    loginAt?: number;
  }
}
