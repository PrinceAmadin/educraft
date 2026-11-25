/**
 * Stamps the pause on projects whose clock was already stopped before the
 * clock was wired up:
 *
 *   npm run pauses:backfill            # dry run — shows what it would write
 *   npm run pauses:backfill -- --apply
 *
 * A hold never stopped the clock at all, and a data request only started
 * mirroring it onto the project on 25 Nov 2026. Those projects ARE paused —
 * nothing recorded since when — so every screen kept counting against a date
 * that had stopped moving, and they read as overdue by the length of the pause.
 *
 * The stamp is the EARLIEST moment the work really stopped: an open data
 * request's own clock, or the move into ON_HOLD / DISPUTED /
 * AWAITING_CLIENT_INPUT, whichever came first. It never overwrites a stamp
 * already there, so it is safe to run twice, and it can never double-count:
 * whatever ends the pause works out its own days (the data request from its
 * `clockPausedAt`, a hold from this stamp) and clears the field.
 */
import { PrismaClient, type ProjectStatus } from "@prisma/client";

const apply = process.argv.includes("--apply");
const db = new PrismaClient();

/** Statuses that stop the clock on their own. */
const PAUSING: ProjectStatus[] = ["ON_HOLD", "DISPUTED", "AWAITING_CLIENT_INPUT"];

async function main() {
  const rows = await db.project.findMany({
    where: {
      deadlinePausedAt: null,
      OR: [
        { status: { in: PAUSING } },
        { pauses: { some: { status: { in: ["OPEN", "SUBMITTED"] }, clockPausedAt: { not: null } } } },
      ],
    },
    select: {
      id: true,
      projectId: true,
      status: true,
      internalDeadline: true,
      expectedDeliveryAt: true,
      statusLog: { orderBy: { createdAt: "desc" }, select: { toStatus: true, createdAt: true, notes: true } },
      pauses: {
        where: { status: { in: ["OPEN", "SUBMITTED"] }, clockPausedAt: { not: null } },
        select: { clockPausedAt: true, kind: true },
      },
    },
    orderBy: { projectId: "asc" },
  });

  if (rows.length === 0) {
    console.log("Nothing to stamp — every stopped clock already has its date.");
    return;
  }

  const now = new Date();
  let stamped = 0;
  let skipped = 0;

  for (const p of rows) {
    const whens: { at: Date; why: string }[] = [];

    for (const pause of p.pauses) {
      if (pause.clockPausedAt) whens.push({ at: pause.clockPausedAt, why: `data request (${pause.kind.toLowerCase()})` });
    }
    if ((PAUSING as string[]).includes(p.status)) {
      const entered = p.statusLog.find((l) => l.toStatus === p.status);
      if (entered) whens.push({ at: entered.createdAt, why: entered.notes ? `${p.status}: ${entered.notes}` : p.status });
    }

    whens.sort((a, b) => a.at.getTime() - b.at.getTime());
    const first = whens[0];

    if (!first) {
      // Paused by a status with no log entry to date it — leave it alone and
      // say so rather than invent a date that would move real deadlines.
      console.log(`  SKIP  ${p.projectId}  ${p.status} — nothing says when it stopped`);
      skipped++;
      continue;
    }

    const days = Math.max(0, Math.ceil((now.getTime() - first.at.getTime()) / 86_400_000));
    const due = p.internalDeadline;
    const moved = due ? new Date(due.getTime() + days * 86_400_000) : null;
    console.log(
      `  ${p.projectId}  ${p.status}\n` +
        `      stopped   ${first.at.toISOString().slice(0, 16).replace("T", " ")}  (${first.why})\n` +
        `      paused    ${days} day${days === 1 ? "" : "s"} so far\n` +
        `      deadline  ${due ? due.toISOString().slice(0, 10) : "—"} reads as ${moved ? moved.toISOString().slice(0, 10) : "—"} while paused`
    );

    if (apply) {
      // Claim on null, so a stamp written meanwhile (by a hold or a data
      // request) always wins over this one.
      const wrote = await db.project.updateMany({
        where: { id: p.id, deadlinePausedAt: null },
        data: { deadlinePausedAt: first.at },
      });
      if (wrote.count === 0) console.log("      (already stamped since this ran — left alone)");
    }
    stamped++;
  }

  console.log(
    `\n${apply ? "Stamped" : "Would stamp"} ${stamped} project${stamped === 1 ? "" : "s"}` +
      (skipped ? `, skipped ${skipped}` : "") +
      (apply ? "." : ". Re-run with -- --apply to write.")
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
