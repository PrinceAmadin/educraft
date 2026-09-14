import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { nextId, TransitionError } from "@/lib/services/projects";
import { notifyUsers } from "@/lib/services/notifications";

/**
 * Money owed out. Both legs gate on `status = COMPLETED` and the relevant
 * paid flag being false, matching the payout-queue screen in the blueprint.
 */

export interface PayoutGroup {
  id: string;
  code: string;
  name: string;
  projectCodes: string[];
  amount: number;
  /** For ambassadors — the commission rate, blended if projects differ. */
  rate: number | null;
  bank: { bankName: string | null; accountNumber: string | null; accountName: string | null };
}

export interface PendingPayouts {
  workers: PayoutGroup[];
  ambassadors: PayoutGroup[];
  totals: {
    workerAmount: number;
    ambassadorAmount: number;
    workerCount: number;
    ambassadorCount: number;
  };
}

export async function getPendingPayouts(): Promise<PendingPayouts> {
  const ambassadorFields = {
    id: true,
    ambassadorId: true,
    fullName: true,
    bankName: true,
    accountNumber: true,
    accountName: true,
  } satisfies Prisma.AmbassadorSelect;

  const [workerProjects, ambassadorProjects, parentProjects] = await db.$transaction([
    db.project.findMany({
      where: { status: "COMPLETED", workerPayoutPaid: false, workerId: { not: null } },
      select: {
        projectId: true,
        workerPayout: true,
        worker: {
          select: {
            id: true,
            workerId: true,
            fullName: true,
            bankName: true,
            accountNumber: true,
            accountName: true,
          },
        },
      },
    }),
    db.project.findMany({
      where: { status: "COMPLETED", ambassadorCommPaid: false, ambassadorId: { not: null } },
      select: {
        projectId: true,
        ambassadorCommission: true,
        ambassadorCommRate: true,
        ambassador: { select: ambassadorFields },
      },
    }),
    // A parent (Core) ambassador's cut from a sub's job — paid out of the
    // same "ambassador" bucket as their own referrals, since it's still money
    // owed to that ambassador.
    db.project.findMany({
      where: { status: "COMPLETED", parentCommPaid: false, parentAmbassadorId: { not: null } },
      select: {
        projectId: true,
        parentCommission: true,
        parentCommRate: true,
        parentAmbassador: { select: ambassadorFields },
      },
    }),
  ]);

  const workerMap = new Map<string, PayoutGroup>();
  for (const p of workerProjects) {
    if (!p.worker) continue;
    const g =
      workerMap.get(p.worker.id) ??
      ({
        id: p.worker.id,
        code: p.worker.workerId,
        name: p.worker.fullName,
        projectCodes: [],
        amount: 0,
        rate: null,
        bank: {
          bankName: p.worker.bankName,
          accountNumber: p.worker.accountNumber,
          accountName: p.worker.accountName,
        },
      } satisfies PayoutGroup);
    g.projectCodes.push(p.projectId);
    g.amount += p.workerPayout ?? 0;
    workerMap.set(p.worker.id, g);
  }

  const ambMap = new Map<string, PayoutGroup & { _rates: number[] }>();
  for (const p of ambassadorProjects) {
    if (!p.ambassador) continue;
    const g =
      ambMap.get(p.ambassador.id) ??
      ({
        id: p.ambassador.id,
        code: p.ambassador.ambassadorId,
        name: p.ambassador.fullName,
        projectCodes: [],
        amount: 0,
        rate: null,
        _rates: [],
        bank: {
          bankName: p.ambassador.bankName,
          accountNumber: p.ambassador.accountNumber,
          accountName: p.ambassador.accountName,
        },
      } as PayoutGroup & { _rates: number[] });
    g.projectCodes.push(p.projectId);
    g.amount += p.ambassadorCommission ?? 0;
    if (p.ambassadorCommRate != null) g._rates.push(p.ambassadorCommRate);
    ambMap.set(p.ambassador.id, g);
  }
  for (const p of parentProjects) {
    if (!p.parentAmbassador) continue;
    const g =
      ambMap.get(p.parentAmbassador.id) ??
      ({
        id: p.parentAmbassador.id,
        code: p.parentAmbassador.ambassadorId,
        name: p.parentAmbassador.fullName,
        projectCodes: [],
        amount: 0,
        rate: null,
        _rates: [],
        bank: {
          bankName: p.parentAmbassador.bankName,
          accountNumber: p.parentAmbassador.accountNumber,
          accountName: p.parentAmbassador.accountName,
        },
      } as PayoutGroup & { _rates: number[] });
    // A project code can appear twice here — once for the ambassador's own
    // cut, once for the parent's — so the list shows both lines.
    g.projectCodes.push(p.projectId);
    g.amount += p.parentCommission ?? 0;
    if (p.parentCommRate != null) g._rates.push(p.parentCommRate);
    ambMap.set(p.parentAmbassador.id, g);
  }

  const workers = [...workerMap.values()].sort((a, b) => b.amount - a.amount);
  const ambassadors = [...ambMap.values()]
    .map(({ _rates, ...g }) => ({
      ...g,
      rate: _rates.length ? Math.round(_rates.reduce((s, r) => s + r, 0) / _rates.length) : null,
    }))
    .sort((a, b) => b.amount - a.amount);

  return {
    workers,
    ambassadors,
    totals: {
      workerAmount: workers.reduce((s, g) => s + g.amount, 0),
      ambassadorAmount: ambassadors.reduce((s, g) => s + g.amount, 0),
      workerCount: workers.length,
      ambassadorCount: ambassadors.length,
    },
  };
}

// ── Mark paid ────────────────────────────────────────────────

interface MarkPaidOptions {
  confirmedById: string;
  reference?: string;
  date?: string;
}

async function payWorker(
  tx: Prisma.TransactionClient,
  workerId: string,
  opts: MarkPaidOptions
): Promise<number> {
  const projects = await tx.project.findMany({
    where: { status: "COMPLETED", workerPayoutPaid: false, workerId },
    select: { id: true, workerPayout: true },
  });
  if (projects.length === 0) return 0;

  const amount = projects.reduce((s, p) => s + (p.workerPayout ?? 0), 0);
  const worker = await tx.worker.findUnique({
    where: { id: workerId },
    select: { fullName: true },
  });

  await tx.payment.create({
    data: {
      paymentId: await nextId("PAYMENT"),
      type: "WORKER_PAYOUT",
      direction: "OUTFLOW",
      personName: worker?.fullName ?? null,
      personRole: "Worker",
      amount,
      reference: opts.reference || null,
      confirmedById: opts.confirmedById,
      status: "Confirmed",
      date: opts.date ? new Date(opts.date) : new Date(),
      notes: `Payout for ${projects.length} project${projects.length === 1 ? "" : "s"}`,
    },
  });

  await tx.project.updateMany({
    where: { id: { in: projects.map((p) => p.id) } },
    data: { workerPayoutPaid: true },
  });

  return amount;
}

async function payAmbassador(
  tx: Prisma.TransactionClient,
  ambassadorId: string,
  opts: MarkPaidOptions
): Promise<number> {
  const [ownProjects, parentOfProjects] = await Promise.all([
    tx.project.findMany({
      where: { status: "COMPLETED", ambassadorCommPaid: false, ambassadorId },
      select: { id: true, ambassadorCommission: true },
    }),
    // Their cut as a parent (Core), from a sub's job — paid in the same lump
    // sum, since it's the same recipient.
    tx.project.findMany({
      where: { status: "COMPLETED", parentCommPaid: false, parentAmbassadorId: ambassadorId },
      select: { id: true, parentCommission: true },
    }),
  ]);
  if (ownProjects.length === 0 && parentOfProjects.length === 0) return 0;

  const amount =
    ownProjects.reduce((s, p) => s + (p.ambassadorCommission ?? 0), 0) +
    parentOfProjects.reduce((s, p) => s + (p.parentCommission ?? 0), 0);
  const ambassador = await tx.ambassador.findUnique({
    where: { id: ambassadorId },
    select: { fullName: true },
  });
  const totalCount = ownProjects.length + parentOfProjects.length;

  await tx.payment.create({
    data: {
      paymentId: await nextId("PAYMENT"),
      type: "AMBASSADOR_COMMISSION",
      direction: "OUTFLOW",
      personName: ambassador?.fullName ?? null,
      personRole: "Ambassador",
      amount,
      reference: opts.reference || null,
      confirmedById: opts.confirmedById,
      status: "Confirmed",
      date: opts.date ? new Date(opts.date) : new Date(),
      notes:
        parentOfProjects.length > 0
          ? `Commission for ${totalCount} project${totalCount === 1 ? "" : "s"} (${parentOfProjects.length} as parent ambassador)`
          : `Commission for ${totalCount} project${totalCount === 1 ? "" : "s"}`,
    },
  });

  if (ownProjects.length > 0) {
    await tx.project.updateMany({
      where: { id: { in: ownProjects.map((p) => p.id) } },
      data: { ambassadorCommPaid: true },
    });
  }
  if (parentOfProjects.length > 0) {
    await tx.project.updateMany({
      where: { id: { in: parentOfProjects.map((p) => p.id) } },
      data: { parentCommPaid: true },
    });
  }

  return amount;
}

export interface MarkPaidResult {
  paidCount: number;
  totalAmount: number;
}

export async function markPayouts(input: {
  kind: "worker" | "ambassador";
  scope: "one" | "all";
  id?: string;
  confirmedById: string;
  reference?: string;
  date?: string;
}): Promise<MarkPaidResult> {
  const opts: MarkPaidOptions = {
    confirmedById: input.confirmedById,
    reference: input.reference,
    date: input.date,
  };

  const result = await db.$transaction(async (tx) => {
    let targets: string[] = [];

    if (input.scope === "one") {
      if (!input.id) throw new TransitionError("No recipient specified");
      targets = [input.id];
    } else {
      if (input.kind === "worker") {
        const projects = await tx.project.findMany({
          where: { status: "COMPLETED", workerPayoutPaid: false, workerId: { not: null } },
          select: { workerId: true },
        });
        targets = [
          ...new Set(projects.map((p) => p.workerId).filter((x): x is string => x != null)),
        ];
      } else {
        const [ownProjects, parentOfProjects] = await Promise.all([
          tx.project.findMany({
            where: { status: "COMPLETED", ambassadorCommPaid: false, ambassadorId: { not: null } },
            select: { ambassadorId: true },
          }),
          tx.project.findMany({
            where: { status: "COMPLETED", parentCommPaid: false, parentAmbassadorId: { not: null } },
            select: { parentAmbassadorId: true },
          }),
        ]);
        targets = [
          ...new Set(
            [
              ...ownProjects.map((p) => p.ambassadorId),
              ...parentOfProjects.map((p) => p.parentAmbassadorId),
            ].filter((x): x is string => x != null)
          ),
        ];
      }
    }

    let paidCount = 0;
    let totalAmount = 0;
    const paidTargets: { id: string; amount: number }[] = [];
    for (const target of targets) {
      const amount =
        input.kind === "worker"
          ? await payWorker(tx, target, opts)
          : await payAmbassador(tx, target, opts);
      if (amount > 0) {
        paidCount += 1;
        totalAmount += amount;
        paidTargets.push({ id: target, amount });
      }
    }

    if (paidCount === 0) throw new TransitionError("Nothing pending to pay");
    return { paidCount, totalAmount, paidTargets };
  }, { timeout: 20_000 });

  // Notify each recipient who has a user account.
  if (result.paidTargets.length > 0) {
    const ids = result.paidTargets.map((t) => t.id);
    const rows =
      input.kind === "worker"
        ? await db.worker.findMany({ where: { id: { in: ids } }, select: { id: true, userId: true } })
        : await db.ambassador.findMany({
            where: { id: { in: ids } },
            select: { id: true, userId: true },
          });
    const byId = new Map<string, string | null>(rows.map((r) => [r.id, r.userId]));
    await Promise.all(
      result.paidTargets.map((t) =>
        notifyUsers([byId.get(t.id) ?? undefined], {
          title: input.kind === "worker" ? "Payout sent" : "Commission paid",
          message: `${formatNairaMinimal(t.amount)} was recorded as paid to you.`,
          type: "success",
          link: input.kind === "worker" ? "/worker/earnings" : "/ambassador/commissions",
        })
      )
    );
  }

  return { paidCount: result.paidCount, totalAmount: result.totalAmount };
}

function formatNairaMinimal(n: number): string {
  return `₦${Math.round(n).toLocaleString("en-NG")}`;
}
