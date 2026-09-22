/**
 * One-off (Sept 2026): new client and worker IDs, and one client record per person.
 *
 *   npm run migrate:ids              dry run: prints every change, writes nothing
 *   npm run migrate:ids -- --apply   makes the changes, in one transaction
 *
 * 1. Client rows that share an email (case-insensitive) are merged into the
 *    OLDEST one. Its projects move over, and each moved project keeps the
 *    details it was ordered under in `additionalData.submittedContact` (see
 *    src/lib/submitted-contact.ts). The earliest referral and the login are
 *    kept, notes are appended, and the duplicate rows are deleted (their
 *    short-lived sign-in codes go with them).
 * 2. Every client and worker ID is rewritten in the new format, keeping its
 *    number: EC-C-00009 -> ECC-0009, EC-W-00003 -> ECW-0003. An ID with no
 *    number (a test leftover) gets the next free number.
 *
 * Safe to re-run: a second run finds nothing to do. Stops without writing if
 * two duplicates are linked to different logins, or a new ID would clash.
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import { formatId } from "../src/lib/id-format";
import type { SubmittedContact } from "../src/lib/submitted-contact";

const db = new PrismaClient();
const APPLY = process.argv.includes("--apply");

const clientNumber = (id: string) => {
  const m = /^(?:ECC-|EC-C-)(\d+)$/.exec(id);
  return m ? parseInt(m[1], 10) : null;
};
const workerNumber = (id: string) => {
  const m = /^(?:ECW-|EC-W-)(\d+)$/.exec(id);
  return m ? parseInt(m[1], 10) : null;
};

type ClientRow = Awaited<ReturnType<typeof loadClients>>[number];

function loadClients() {
  return db.client.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      clientId: true,
      fullName: true,
      phone: true,
      email: true,
      universityId: true,
      faculty: true,
      department: true,
      level: true,
      referredById: true,
      referralCodeUsed: true,
      notes: true,
      userId: true,
      createdAt: true,
      projects: { select: { id: true, projectId: true, additionalData: true } },
    },
  });
}

function snapshot(c: ClientRow): SubmittedContact {
  return {
    fullName: c.fullName,
    phone: c.phone,
    email: c.email,
    universityId: c.universityId,
    faculty: c.faculty,
    department: c.department,
    level: c.level,
  };
}

function asObject(json: Prisma.JsonValue | null): Prisma.JsonObject {
  return json && typeof json === "object" && !Array.isArray(json) ? (json as Prisma.JsonObject) : {};
}

async function main() {
  const clients = await loadClients();
  const workers = await db.worker.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, workerId: true, fullName: true } });

  // ── 1. Merges ──
  const byEmail = new Map<string, ClientRow[]>();
  for (const c of clients) {
    const key = c.email?.trim().toLowerCase();
    if (!key) continue;
    byEmail.set(key, [...(byEmail.get(key) ?? []), c]);
  }
  const merges = Array.from(byEmail.entries())
    .filter(([, group]) => group.length > 1)
    .map(([email, group]) => ({ email, keep: group[0], drop: group.slice(1) }));

  const problems: string[] = [];
  for (const m of merges) {
    const logins = new Set([m.keep, ...m.drop].map((c) => c.userId).filter(Boolean));
    if (logins.size > 1) problems.push(`${m.email}: its records are linked to ${logins.size} different logins`);
  }

  // ── 2. New IDs (after the merge, so deleted rows are not renamed) ──
  const dropped = new Set(merges.flatMap((m) => m.drop.map((d) => d.id)));
  const remaining = clients.filter((c) => !dropped.has(c.id));
  let nextFree = Math.max(0, ...remaining.map((c) => clientNumber(c.clientId) ?? 0));
  const clientRenames = remaining
    .map((c) => {
      const n = clientNumber(c.clientId);
      return { row: c, to: formatId("CLIENT", n ?? ++nextFree) };
    })
    .filter((r) => r.to !== r.row.clientId);

  let nextWorker = Math.max(0, ...workers.map((w) => workerNumber(w.workerId) ?? 0));
  const workerRenames = workers
    .map((w) => {
      const n = workerNumber(w.workerId);
      return { row: w, to: formatId("WORKER", n ?? ++nextWorker) };
    })
    .filter((r) => r.to !== r.row.workerId);

  // A new ID must be unique across the final set.
  const finalClientIds = remaining.map((c) => clientRenames.find((r) => r.row.id === c.id)?.to ?? c.clientId);
  const finalWorkerIds = workers.map((w) => workerRenames.find((r) => r.row.id === w.id)?.to ?? w.workerId);
  if (new Set(finalClientIds).size !== finalClientIds.length) problems.push("two clients would end up with the same ID");
  if (new Set(finalWorkerIds).size !== finalWorkerIds.length) problems.push("two workers would end up with the same ID");

  // ── Report ──
  console.log(`\nClients: ${clients.length} rows, ${merges.length} email(s) with duplicates, ${clientRenames.length} ID(s) to rewrite.`);
  for (const m of merges) {
    console.log(`\n  Merge ${m.email} into ${m.keep.clientId} (${m.keep.fullName}, oldest):`);
    for (const d of m.drop) {
      const codes = d.projects.map((p) => p.projectId).join(", ") || "no projects";
      console.log(`    ${d.clientId} (${d.fullName}) -> projects moved: ${codes}; record deleted`);
    }
  }
  if (clientRenames.length) {
    console.log("\n  Client IDs:");
    for (const r of clientRenames) {
      const note = clientNumber(r.row.clientId) === null ? "   (had no number: given the next free one)" : "";
      console.log(`    ${r.row.clientId.padEnd(24)} -> ${r.to}   ${r.row.fullName}${note}`);
    }
  }
  console.log(`\nWorkers: ${workers.length} rows, ${workerRenames.length} ID(s) to rewrite.`);
  for (const r of workerRenames) console.log(`    ${r.row.workerId.padEnd(24)} -> ${r.to}   ${r.row.fullName}`);

  if (problems.length) {
    console.error("\nStopped, nothing written:");
    for (const p of problems) console.error(`  - ${p}`);
    process.exitCode = 1;
    return;
  }
  if (!merges.length && !clientRenames.length && !workerRenames.length) {
    console.log("\nNothing to do.");
    return;
  }
  if (!APPLY) {
    console.log("\nDry run: nothing written. Run again with -- --apply to make these changes.");
    return;
  }

  await db.$transaction(
    async (tx) => {
      for (const m of merges) {
        for (const d of m.drop) {
          for (const p of d.projects) {
            const data = asObject(p.additionalData);
            await tx.project.update({
              where: { id: p.id },
              data: {
                clientId: m.keep.id,
                additionalData: {
                  ...data,
                  submittedContact: (data.submittedContact ?? snapshot(d)) as Prisma.InputJsonValue,
                },
              },
            });
          }
        }
        const firstReferral = [m.keep, ...m.drop].find((c) => c.referredById);
        const login = [m.keep, ...m.drop].find((c) => c.userId)?.userId ?? null;
        const mergedNotes = [
          m.keep.notes,
          ...m.drop.map((d) => `Merged from ${d.clientId}${d.notes ? `: ${d.notes}` : ""}`),
        ]
          .filter(Boolean)
          .join("\n");
        await tx.client.update({
          where: { id: m.keep.id },
          data: {
            referredById: m.keep.referredById ?? firstReferral?.referredById ?? null,
            referralCodeUsed: m.keep.referralCodeUsed ?? firstReferral?.referralCodeUsed ?? null,
            userId: login,
            notes: mergedNotes || null,
          },
        });
        await tx.client.deleteMany({ where: { id: { in: m.drop.map((d) => d.id) } } });
      }
      for (const r of clientRenames) await tx.client.update({ where: { id: r.row.id }, data: { clientId: r.to } });
      for (const r of workerRenames) await tx.worker.update({ where: { id: r.row.id }, data: { workerId: r.to } });
    },
    { timeout: 60_000, maxWait: 20_000 }
  );
  console.log("\nApplied.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
