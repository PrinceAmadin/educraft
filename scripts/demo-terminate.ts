/**
 * Removes everything the demo seeds created: the chapter-review project and
 * its chapters, the stored .docx files, the demo client, the demo specialist
 * and the demo COO login — plus, from the ambassador tour seed, the demo
 * ambassador, the students they referred, their orders, commissions and clicks,
 * and the rival ambassadors on the leaderboard.
 *
 * Like the seed, it refuses to run against anything but a database on this
 * machine. Safe to run twice: it reports what was not there.
 *
 *   npm run demo:terminate
 */
import { db } from "@/lib/db";
import { deleteStoredFile } from "@/lib/files/storage";
import { DEMO, assertLocalDatabase } from "./demo-constants";

async function main(): Promise<void> {
  assertLocalDatabase("demo:terminate");
  console.log("\nRemoving EduCraft HQ demo data\n");

  const project = await db.project.findUnique({
    where: { projectId: DEMO.projectCode },
    select: { id: true, clientId: true, files: { select: { id: true, blobPathname: true } } },
  });

  if (project) {
    // Stored files first: a cascade would drop the rows and orphan the bytes.
    let removed = 0;
    for (const f of project.files) {
      if (!f.blobPathname) continue;
      try {
        await deleteStoredFile(f.blobPathname);
        removed += 1;
      } catch {
        // Already gone, or the store is not reachable: the row goes either way.
      }
    }
    console.log(`  Stored files     ${removed} removed`);

    await db.project.delete({ where: { id: project.id } });
    console.log(`  Project          ${DEMO.projectCode} deleted`);

    const stillHasProjects = await db.project.count({ where: { clientId: project.clientId } });
    if (stillHasProjects === 0) {
      await db.client.delete({ where: { id: project.clientId } }).catch(() => undefined);
      console.log(`  Client           ${DEMO.clientCode} deleted`);
    }
  } else {
    console.log(`  Project          ${DEMO.projectCode} not found`);
  }

  const worker = await db.worker.findUnique({ where: { workerId: DEMO.workerCode }, select: { id: true, userId: true } });
  if (worker) {
    await db.worker.delete({ where: { id: worker.id } }).catch(() => undefined);
    console.log(`  Specialist       ${DEMO.workerCode} deleted`);
  }

  // ── The ambassador tour seed ──────────────────────────────────────────────
  // Their orders first: a project holds the commission rows and the client.
  const referred = await db.project.findMany({
    where: { projectId: { startsWith: DEMO.referralProjectPrefix } },
    select: { id: true, clientId: true },
  });
  if (referred.length > 0) {
    await db.payoutRecord.deleteMany({ where: { projectId: { in: referred.map((p) => p.id) } } });
    await db.project.deleteMany({ where: { id: { in: referred.map((p) => p.id) } } });
    console.log(`  Referred orders  ${referred.length} deleted`);
  }
  const referredClients = await db.client.deleteMany({
    where: { clientId: { startsWith: DEMO.referralClientPrefix } },
  });
  if (referredClients.count > 0) console.log(`  Referred clients ${referredClients.count} deleted`);

  // Every ambassador the tour seed made: the one filmed, and the rivals.
  const demoAmbassadors = await db.ambassador.findMany({
    where: {
      OR: [{ ambassadorId: DEMO.ambassadorCode }, { ambassadorId: { startsWith: DEMO.rivalPrefix } }],
    },
    select: { id: true, ambassadorId: true },
  });
  if (demoAmbassadors.length > 0) {
    const ids = demoAmbassadors.map((a) => a.id);
    await db.clickEvent.deleteMany({ where: { ambassadorId: { in: ids } } });
    await db.payoutRecord.deleteMany({ where: { recipientType: "AMBASSADOR", recipientId: { in: ids } } });
    await db.ambassador.deleteMany({ where: { id: { in: ids } } });
    console.log(`  Ambassadors      ${demoAmbassadors.length} deleted (incl. clicks and commissions)`);
  }

  for (const email of [DEMO.cooEmail, DEMO.workerEmail, DEMO.clientEmail, DEMO.ambassadorEmail]) {
    const user = await db.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) continue;
    await db.execProfile.deleteMany({ where: { userId: user.id } });
    await db.user.delete({ where: { id: user.id } }).catch(() => undefined);
    console.log(`  Login            ${email} deleted`);
  }

  console.log("\nDone.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void db.$disconnect());
