import { Prisma } from "@prisma/client";

/**
 * The Command Center reads models and columns that arrive with two branches
 * not yet merged into this one: phase-3 (Ambassador Platform) and phase-4
 * (Operations Platform). Every such query lives in `sources/phase3.ts` or
 * `sources/phase4.ts`, is marked `// requires Phase 3 merge` or
 * `// requires Phase 4 merge`, and runs through `afterMerge`:
 *
 * - This build's Prisma client does not know a model or field the read
 *   needs (this branch before the merge): the read is skipped and null
 *   comes back, so the caller shows its main-branch fallback or
 *   "Awaiting data". Logged once per source as a warning.
 * - The client knows it but the database does not have the table or column
 *   yet (merged, `npm run db:migrate` not run): Prisma's P2021 / P2022 also
 *   give null, logged once as an error — that one needs fixing.
 * - Anything else (a timeout, a query mistake) is thrown as usual, so a real
 *   failure is never mistaken for "not merged yet".
 *
 * Search the logs for "[command-center] requires Phase" to find either case.
 */

export type MergePhase = 3 | 4;

/** A model the read needs, and the fields on it that must exist too. */
export interface SchemaNeed {
  model: string;
  fields?: readonly string[];
}

/** True when this build's Prisma client has every model and field listed. */
export function schemaHas(needs: readonly SchemaNeed[]): boolean {
  const models = Prisma.dmmf.datamodel.models;
  return needs.every(({ model, fields = [] }) => {
    const found = models.find((m) => m.name === model);
    return found !== undefined && fields.every((f) => found.fields.some((field) => field.name === f));
  });
}

/** P2021: the table does not exist; P2022: the column does not exist. */
function isMissingInDatabase(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2021" || error.code === "P2022");
}

const reported = new Set<string>();

function report(phase: MergePhase, source: string, notMigrated: boolean): void {
  const key = `${phase}:${source}:${notMigrated ? "db" : "schema"}`;
  if (reported.has(key)) return;
  reported.add(key);
  if (notMigrated) {
    console.error(
      `[command-center] requires Phase ${phase} merge: ${source} is in the Prisma schema but not in the database — run the migration. Showing the fallback.`
    );
  } else {
    console.warn(`[command-center] requires Phase ${phase} merge: ${source} is not in this build's schema yet. Showing the fallback.`);
  }
}

/**
 * Runs `read` when the schema has what it needs; null when it does not (or
 * the database has not been migrated to it yet). See the module comment.
 */
export async function afterMerge<T>(
  phase: MergePhase,
  source: string,
  needs: readonly SchemaNeed[],
  read: () => Promise<T>
): Promise<T | null> {
  if (!schemaHas(needs)) {
    report(phase, source, false);
    return null;
  }
  try {
    return await read();
  } catch (error) {
    if (!isMissingInDatabase(error)) throw error;
    report(phase, source, true);
    return null;
  }
}
