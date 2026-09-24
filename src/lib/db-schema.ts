import { Prisma } from "@prisma/client";

/**
 * The Postgres schema this app's Prisma client is configured for: the
 * `?schema=` parameter on DATABASE_URL, "public" when absent.
 *
 * Raw SQL must name it. Prisma's model queries are always schema-qualified,
 * but an unqualified table inside `$queryRaw` / `$executeRaw` resolves through
 * the connection's `search_path` — and on Supabase's transaction pooler a
 * `SET search_path` issued by another client (for example a QA server bound
 * to its own throwaway schema) stays on the shared server connection and is
 * inherited by the next client. Seen in September 2026: every pooled
 * connection carried a QA schema's path, so `nextId` read an empty table and
 * handed out timestamp IDs. Qualifying the table makes that impossible.
 */
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const DB_SCHEMA: string = (() => {
  try {
    const url = process.env.DATABASE_URL;
    if (!url) return "public";
    const schema = new URL(url).searchParams.get("schema");
    return schema && IDENT.test(schema) ? schema : "public";
  } catch {
    return "public";
  }
})();

/** `"public"."ClickEvent"` as a raw SQL fragment, for use inside a tagged template. */
export function sqlTable(name: string): Prisma.Sql {
  if (!IDENT.test(name)) throw new Error(`Not a table name: ${name}`);
  return Prisma.raw(`"${DB_SCHEMA}"."${name}"`);
}
