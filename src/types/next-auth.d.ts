import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      /**
       * A `UserRole` value (SUPER_ADMIN, CO_CEO_CFO, HOG, COO, WORKER,
       * AMBASSADOR, CLIENT), or "" for a sign-in that somehow had none so
       * every check fails closed. Kept as a string so the JWT can carry that
       * empty value; compare against the enum's literals.
       */
      role: string;
      /** ms epoch of this sign-in; client sessions expire after 14 days. */
      loginAt: number;
    } & DefaultSession["user"];
  }

  interface User {
    role?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: string;
    loginAt?: number;
  }
}
