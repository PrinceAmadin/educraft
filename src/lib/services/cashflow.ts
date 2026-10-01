import { Prisma } from "@prisma/client";
import { revalidateTag, unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import type { CashflowStructure } from "@/lib/finance/cashflow-types";
import { canonicalHash, diffStructures, hasErrors, tiersChanged, validateStructure, type DiffLine, type Violation } from "@/lib/finance/cashflow-rules";
import { cashflowStructureSchema, toStructure } from "@/lib/validations/cashflow";

/**
 * The published cashflow structure: one immutable JSON snapshot per version.
 * The active version is read through `unstable_cache` (tag "cashflow") and
 * flushed on publish; a version by id never changes, so it is cached for a
 * day. A project is stamped with the version active when it was created and
 * is computed under that version forever (the grandfather rule).
 *
 * Never resolve the ACTIVE version inside a database transaction: read it
 * before, stamp the id, and pass the structure in.
 */

export const CASHFLOW_TAG = "cashflow";
const CACHE_VERSION = "1";

type Db = Prisma.TransactionClient | typeof db;

export class NoCashflowVersion extends Error {
  constructor() {
    super("No cashflow version has been published. Run `npm run cashflow:seed -- --apply`.");
  }
}

export class CashflowPublishError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 404 | 409,
    public readonly violations: Violation[] = []
  ) {
    super(message);
  }
}

export interface CashflowVersionView {
  id: string;
  versionNumber: number;
  structure: CashflowStructure;
  /** ISO. */
  effectiveFrom: string;
  effectiveTo: string | null;
  changeReason: string | null;
  createdById: string;
}

function parseStructure(raw: unknown, versionNumber: number): CashflowStructure {
  const parsed = cashflowStructureSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`Cashflow version ${versionNumber} holds a structure this build cannot read`);
  return toStructure(parsed.data);
}

function toView(row: { id: string; versionNumber: number; structure: unknown; effectiveFrom: Date; effectiveTo: Date | null; changeReason: string | null; createdById: string }): CashflowVersionView {
  return {
    id: row.id,
    versionNumber: row.versionNumber,
    structure: parseStructure(row.structure, row.versionNumber),
    effectiveFrom: row.effectiveFrom.toISOString(),
    effectiveTo: row.effectiveTo?.toISOString() ?? null,
    changeReason: row.changeReason,
    createdById: row.createdById,
  };
}

const readActive = unstable_cache(
  async (): Promise<CashflowVersionView | null> => {
    const row = await db.cashflowVersion.findFirst({ where: { effectiveTo: null }, orderBy: { versionNumber: "desc" } });
    return row ? toView(row) : null;
  },
  ["cashflow", "active", CACHE_VERSION],
  { tags: [CASHFLOW_TAG], revalidate: 300 }
);

/** The version in force now. Throws when nothing has been published yet. */
export async function getActiveCashflow(): Promise<CashflowVersionView> {
  const active = await readActive();
  if (!active) throw new NoCashflowVersion();
  return active;
}

/** The active version, or null when the seed has not run (for pages that must still render). */
export async function getActiveCashflowOrNull(): Promise<CashflowVersionView | null> {
  return readActive();
}

const readById = (id: string) =>
  unstable_cache(
    async (): Promise<CashflowVersionView | null> => {
      const row = await db.cashflowVersion.findUnique({ where: { id } });
      return row ? toView(row) : null;
    },
    ["cashflow", "byId", id, CACHE_VERSION],
    { tags: [CASHFLOW_TAG], revalidate: 86_400 }
  )();

export async function getCashflowVersion(id: string): Promise<CashflowVersionView | null> {
  return readById(id);
}

export async function getCashflowVersionByNumber(versionNumber: number): Promise<CashflowVersionView | null> {
  const row = await db.cashflowVersion.findUnique({ where: { versionNumber } });
  return row ? toView(row) : null;
}

/** The version that was in force at a moment (a period's end, a project's creation before stamping existed). */
export async function cashflowAt(at: Date): Promise<CashflowVersionView> {
  const row = await db.cashflowVersion.findFirst({
    where: { effectiveFrom: { lte: at }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }] },
    orderBy: { versionNumber: "desc" },
  });
  if (row) return toView(row);
  // Before the first version: the earliest one applies to everything older.
  const first = await db.cashflowVersion.findFirst({ orderBy: { versionNumber: "asc" } });
  if (!first) throw new NoCashflowVersion();
  return toView(first);
}

/** The structure a project is computed under: its stamped version, else the one in force when it was created. */
export async function cashflowForProject(project: { cashflowVersionId: string | null; createdAt: Date }): Promise<CashflowStructure> {
  if (project.cashflowVersionId) {
    const v = await getCashflowVersion(project.cashflowVersionId);
    if (v) return v.structure;
  }
  return (await cashflowAt(project.createdAt)).structure;
}

/** Read a project's money fields and its structure in one go (for services that only have the id). */
export async function cashflowForProjectId(client: Db, projectDbId: string): Promise<CashflowStructure> {
  const p = await client.project.findUnique({ where: { id: projectDbId }, select: { cashflowVersionId: true, createdAt: true } });
  if (!p) return (await getActiveCashflow()).structure;
  return cashflowForProject(p);
}

export interface VersionSummary {
  id: string;
  versionNumber: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  changeReason: string | null;
  createdById: string;
  createdByName: string;
  diff: DiffLine[];
  projects: number;
}

export async function listCashflowVersions(limit = 24): Promise<VersionSummary[]> {
  const rows = await db.cashflowVersion.findMany({
    orderBy: { versionNumber: "desc" },
    take: limit,
    select: { id: true, versionNumber: true, effectiveFrom: true, effectiveTo: true, changeReason: true, createdById: true, diff: true, _count: { select: { projects: true } } },
  });
  const userIds = [...new Set(rows.map((r) => r.createdById))];
  const users = userIds.length ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, displayName: true, email: true, execProfile: { select: { fullName: true } } } }) : [];
  const nameOf = (id: string) => {
    const u = users.find((x) => x.id === id);
    return u?.execProfile?.fullName ?? u?.displayName ?? u?.email ?? (id === "seed" ? "The seed (cashflow manual v2.0)" : id);
  };
  return rows.map((r) => ({
    id: r.id,
    versionNumber: r.versionNumber,
    effectiveFrom: r.effectiveFrom.toISOString(),
    effectiveTo: r.effectiveTo?.toISOString() ?? null,
    changeReason: r.changeReason,
    createdById: r.createdById,
    createdByName: nameOf(r.createdById),
    diff: Array.isArray(r.diff) ? (r.diff as unknown as DiffLine[]) : [],
    projects: r._count.projects,
  }));
}

/** A PayoutRecord leg → the Level-1 key it was produced by. */
const LEG_TO_KEY: Record<string, string> = { WORKER: "workers", AMBASSADOR: "ambassador", PARENT: "ambassador", HOG: "hog", COO: "coo" };

/** Level-1 keys that PayoutRecords already reference — rows that cannot be deleted, only made inactive. */
export async function level1KeysWithRecords(): Promise<string[]> {
  const rows = await db.payoutRecord.findMany({ distinct: ["leg"], select: { leg: true } });
  return [...new Set(rows.map((r) => LEG_TO_KEY[r.leg] ?? r.leg.toLowerCase()).filter((k) => k !== "bonus"))];
}

/** The lowest downpayment % among active services, for the X-10% warning. */
export async function minServiceDownpayment(): Promise<number | null> {
  const row = await db.service.findFirst({ where: { isActive: true, requiresDownpayment: true }, orderBy: { downpaymentPercentage: "asc" }, select: { downpaymentPercentage: true } });
  return row?.downpaymentPercentage ?? null;
}

/**
 * The downpayment share public copy quotes ("you pay 45% to begin"): the
 * structure's baseline, else — before the seed has run — the lowest active
 * service's. A public page never throws over the money settings.
 */
export async function publicDownpaymentPercent(): Promise<number> {
  const active = await readActive();
  if (active) return active.structure.triggers.downpaymentPercent;
  const service = await minServiceDownpayment();
  return service ?? 0;
}

export interface PublishResult {
  versionNumber: number;
  id: string;
  diff: DiffLine[];
  tiersChanged: boolean;
  warnings: Violation[];
}

/**
 * Publish a new version: validate, refuse a no-op, close the active version
 * and create N+1 in one transaction, write the audit row, flush the cache.
 * Tier changes are reported so the caller can recount every ambassador.
 */
export async function publishCashflow(input: { structure: CashflowStructure; reason?: string | null; actorId: string; basedOnVersion?: number | null }): Promise<PublishResult> {
  const active = await db.cashflowVersion.findFirst({ where: { effectiveTo: null }, orderBy: { versionNumber: "desc" } });
  const previous = active ? toView(active) : null;
  if (input.basedOnVersion != null && previous && previous.versionNumber !== input.basedOnVersion) {
    throw new CashflowPublishError(`Version ${previous.versionNumber} was published while you were editing. Reload and apply your changes again.`, 409);
  }
  const [keysWithRecords, minDown] = await Promise.all([level1KeysWithRecords(), minServiceDownpayment()]);
  const violations = validateStructure(input.structure, { previous: previous?.structure, keysWithRecords, minServiceDownpayment: minDown });
  if (hasErrors(violations)) throw new CashflowPublishError("The structure has errors", 400, violations);
  const hash = canonicalHash(input.structure);
  if (previous && canonicalHash(previous.structure) === hash) throw new CashflowPublishError("Nothing changed: this structure is already the active version", 409);

  const diff = previous ? diffStructures(previous.structure, input.structure) : [];
  const now = new Date();
  const created = await db.$transaction(async (tx) => {
    if (active) {
      const closed = await tx.cashflowVersion.updateMany({ where: { id: active.id, effectiveTo: null }, data: { effectiveTo: now } });
      if (closed.count !== 1) throw new CashflowPublishError("Another version was just published. Reload and try again.", 409);
    }
    const last = await tx.cashflowVersion.findFirst({ orderBy: { versionNumber: "desc" }, select: { versionNumber: true } });
    const row = await tx.cashflowVersion.create({
      data: {
        versionNumber: (last?.versionNumber ?? 0) + 1,
        structure: input.structure as unknown as Prisma.InputJsonValue,
        structureHash: hash,
        diff: diff as unknown as Prisma.InputJsonValue,
        effectiveFrom: now,
        createdById: input.actorId,
        changeReason: input.reason?.trim() || null,
      },
      select: { id: true, versionNumber: true },
    });
    await tx.cashflowAuditLog.create({
      data: {
        actorUserId: input.actorId,
        action: "published_version",
        entityType: "CashflowVersion",
        entityId: row.id,
        beforeJson: previous ? (previous.structure as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        afterJson: input.structure as unknown as Prisma.InputJsonValue,
        reason: input.reason?.trim() || null,
      },
    });
    return row;
  });
  revalidateTag(CASHFLOW_TAG);
  return {
    versionNumber: created.versionNumber,
    id: created.id,
    diff,
    tiersChanged: previous ? tiersChanged(previous.structure, input.structure) : false,
    warnings: violations.filter((v) => v.severity === "warn"),
  };
}

/**
 * Republish an old version as a new one (Phase 8): takes that version's exact
 * structure through the same validation and publish path, so it becomes N+1 (a
 * roll-back that keeps the history intact). A no-op if it equals the active one.
 */
export async function republishCashflow(versionNumber: number, actorId: string): Promise<PublishResult> {
  const v = await getCashflowVersionByNumber(versionNumber);
  if (!v) throw new CashflowPublishError(`Version ${versionNumber} not found`, 404);
  return publishCashflow({ structure: v.structure, reason: `Republished from version ${versionNumber}`, actorId });
}

/** The founder's audit trail for the cashflow settings, newest first. */
export async function listCashflowAudit(limit = 50) {
  return db.cashflowAuditLog.findMany({ orderBy: { createdAt: "desc" }, take: limit });
}
