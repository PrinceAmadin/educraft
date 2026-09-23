/**
 * Fills the client activity feed (ProjectUpdate) for projects placed before
 * the feed existed, from what really happened: the order, each confirmed
 * client payment, and each status change the client may see (the same wording
 * and the same dedupe keys the live code uses, so nothing is written twice and
 * a re-run changes nothing). Lines keep their original dates.
 *
 *   npm run feed:backfill              (dry run: prints what it would add)
 *   npm run feed:backfill -- --apply   (writes)
 */
import { PrismaClient, type ProjectUpdateKind } from "@prisma/client";
import { statusFeedEntry } from "../src/lib/client-updates";

const db = new PrismaClient();
const apply = process.argv.includes("--apply");
const naira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;

interface Row {
  projectId: string;
  kind: ProjectUpdateKind;
  title: string;
  body: string | null;
  dedupeKey: string;
  createdAt: Date;
}

async function main() {
  const projects = await db.project.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      projectId: true,
      isProBono: true,
      createdAt: true,
      clientUpdates: { select: { dedupeKey: true } },
      statusLog: { orderBy: { createdAt: "asc" }, select: { id: true, fromStatus: true, toStatus: true, createdAt: true } },
      payments: {
        where: { direction: "INFLOW", status: "Confirmed", type: { in: ["CLIENT_DOWNPAYMENT", "CLIENT_BALANCE"] } },
        select: { id: true, type: true, amount: true, reference: true, date: true },
      },
    },
  });

  const rows: Row[] = [];
  for (const p of projects) {
    const have = new Set(p.clientUpdates.map((u) => u.dedupeKey).filter(Boolean));
    const add = (row: Omit<Row, "projectId">) => {
      if (have.has(row.dedupeKey)) return;
      have.add(row.dedupeKey);
      rows.push({ ...row, projectId: p.id });
    };

    add({
      kind: "STATUS",
      title: "Order received",
      body: p.isProBono ? "Your project is confirmed. No payment needed." : "We have your order.",
      dedupeKey: `created:${p.id}`,
      createdAt: p.createdAt,
    });

    for (const pay of p.payments) {
      // Pay-first orders recorded their payment line under the Paystack reference.
      if (pay.reference && have.has(`payment-ref:${pay.reference}`)) continue;
      const leg = pay.type === "CLIENT_BALANCE" ? "balance" : "downpayment";
      add({
        kind: "PAYMENT",
        title: "Payment received",
        body: `Your ${leg} of ${naira(pay.amount)} is confirmed.`,
        dedupeKey: `payment:${pay.id}`,
        createdAt: pay.date,
      });
    }

    for (const log of p.statusLog) {
      // The first assignment has its own line.
      if (log.toStatus === "ASSIGNED" && have.has(`assigned:${p.id}`)) continue;
      const feed = statusFeedEntry(log.fromStatus, log.toStatus);
      if (!feed) continue;
      add({ kind: "STATUS", title: feed.title, body: feed.body ?? null, dedupeKey: `status:${log.id}`, createdAt: log.createdAt });
    }
  }

  const byProject = new Map<string, number>();
  for (const r of rows) byProject.set(r.projectId, (byProject.get(r.projectId) ?? 0) + 1);
  const codes = new Map(projects.map((p) => [p.id, p.projectId]));
  for (const [id, n] of byProject) console.log(`${codes.get(id)}: ${n} line(s)`);
  console.log(`\n${rows.length} feed line(s) across ${byProject.size} project(s).`);

  if (!apply) {
    console.log("Dry run. Re-run with -- --apply to write them.");
    return;
  }
  const res = await db.projectUpdate.createMany({ data: rows, skipDuplicates: true });
  console.log(`Wrote ${res.count}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
