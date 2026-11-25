/**
 * An ambassador correcting their own name (Nov 2026). The rules are pure in
 * `src/lib/ambassadors/name-change.ts`; this file is the reads and the one write.
 *
 * The write is deliberately small, because a rename touches nothing that decides
 * money or attribution: it sets `Ambassador.fullName`, copies the new name onto
 * the roster slot the public link pages read, and logs the change. The referral
 * code, every foreign key and every `PayoutRecord.recipientName` snapshot are
 * left exactly as they were.
 */
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  NAME_CHANGE_TEXT,
  bankNameLooksStale,
  checkName,
  cooldownState,
  sameName,
  type CooldownState,
  type NameChangeSource,
  type NameRefusal,
} from "@/lib/ambassadors/name-change";
import { notifyGrowth } from "@/lib/services/notifications";

const CLOSED_STATUSES = ["Suspended", "Terminated"];

/** How many past changes the ambassador and the Head of Growth are shown. */
const HISTORY_SHOWN = 5;

export class NameChangeError extends Error {
  readonly reason: NameRefusal | "duplicate" | "cooldown" | "raced" | "not_found";

  constructor(reason: NameChangeError["reason"], message: string) {
    super(message);
    this.name = "NameChangeError";
    this.reason = reason;
  }
}

export interface NameChangeEntry {
  oldName: string;
  newName: string;
  source: NameChangeSource;
  createdAt: Date;
}

export interface NameChangeView {
  fullName: string;
  cooldown: CooldownState;
  /** The sentence to show when the window is shut. null while it is open. */
  cooldownMessage: string | null;
  /** The nudge to update their bank details, when the account name no longer matches. */
  bankNudge: string | null;
  history: NameChangeEntry[];
}

type Client = Prisma.TransactionClient | typeof db;

/** The bank nudge for a name, or null when the account still reads as the same person. */
function bankNudgeFor(name: string, accountName: string | null): string | null {
  if (!accountName || !bankNameLooksStale(name, accountName)) return null;
  return NAME_CHANGE_TEXT.bankNudge(accountName);
}

/**
 * The last change the ambassador made THEMSELVES — the only one the cooldown is
 * judged from, so an admin correction never spends their allowance.
 */
async function lastSelfChangeAt(client: Client, ambassadorId: string): Promise<Date | null> {
  const row = await client.ambassadorNameChange.findFirst({
    where: { ambassadorId, source: "SELF" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return row?.createdAt ?? null;
}

export async function getNameHistory(ambassadorId: string, take = HISTORY_SHOWN): Promise<NameChangeEntry[]> {
  const rows = await db.ambassadorNameChange.findMany({
    where: { ambassadorId },
    orderBy: { createdAt: "desc" },
    take,
    select: { oldName: true, newName: true, source: true, createdAt: true },
  });
  return rows.map((r) => ({
    oldName: r.oldName,
    newName: r.newName,
    source: r.source === "SELF" ? "SELF" : "ADMIN",
    createdAt: r.createdAt,
  }));
}

/** What the ambassador's own profile page shows: their name, the window, the history. */
export async function getNameChangeView(ambassadorId: string): Promise<NameChangeView> {
  const [ambassador, lastSelf, history] = await Promise.all([
    db.ambassador.findUniqueOrThrow({
      where: { id: ambassadorId },
      select: { fullName: true, accountName: true },
    }),
    lastSelfChangeAt(db, ambassadorId),
    getNameHistory(ambassadorId),
  ]);

  const cooldown = cooldownState(lastSelf);
  return {
    fullName: ambassador.fullName,
    cooldown,
    cooldownMessage: cooldown.canChange ? null : NAME_CHANGE_TEXT.cooldown(cooldown.daysLeft),
    bankNudge: bankNudgeFor(ambassador.fullName, ambassador.accountName),
    history,
  };
}

/**
 * The ambassador changes their own name. Refuses with a `NameChangeError` the
 * caller shows them verbatim: a name that breaks the rules, one that would
 * impersonate EduCraft or another ambassador at their school, or a second change
 * inside the cooldown.
 */
export async function changeOwnName(
  ambassadorId: string,
  raw: string,
  actorUserId: string
): Promise<{ fullName: string; bankNudge: string | null }> {
  const ambassador = await db.ambassador.findUnique({
    where: { id: ambassadorId },
    select: {
      id: true,
      ambassadorId: true,
      fullName: true,
      universityId: true,
      legacySlotId: true,
      accountName: true,
    },
  });
  if (!ambassador) throw new NameChangeError("not_found", "We could not find your ambassador record.");

  const checked = checkName(raw, ambassador.fullName);
  if (!checked.ok) throw new NameChangeError(checked.reason, checked.message);
  const newName = checked.name;

  const lastSelf = await lastSelfChangeAt(db, ambassadorId);
  const cooldown = cooldownState(lastSelf);
  if (!cooldown.canChange) {
    throw new NameChangeError("cooldown", NAME_CHANGE_TEXT.cooldown(cooldown.daysLeft));
  }

  // Impersonating another ambassador only matters where people know each other,
  // so the guard is per university — real namesakes across Nigeria are common and
  // must not be blocked. Compared with the pure `sameName`, so the one definition
  // of "the same name" covers spacing and case here too; a school holds at most a
  // few dozen ambassadors, which makes this cheaper than it looks.
  const atSchool = await db.ambassador.findMany({
    where: {
      id: { not: ambassadorId },
      universityId: ambassador.universityId,
      status: { notIn: CLOSED_STATUSES },
    },
    select: { fullName: true },
  });
  if (atSchool.some((a) => sameName(a.fullName, newName))) {
    throw new NameChangeError("duplicate", NAME_CHANGE_TEXT.refusal.duplicate);
  }

  const oldName = ambassador.fullName;
  await db.$transaction(async (tx) => {
    // Compare-and-set on the name we checked: two tabs, or a rename racing an
    // admin correction, cannot both land.
    const claimed = await tx.ambassador.updateMany({
      where: { id: ambassadorId, fullName: oldName },
      data: { fullName: newName },
    });
    if (claimed.count !== 1) {
      throw new NameChangeError("raced", "Your name was changed somewhere else a moment ago. Reload and try again.");
    }
    // The roster slot is what the public /EduCraftA, /ECCA and /ECSA link pages
    // read, so it has to follow — the same copy `updateAmbassador` makes.
    if (ambassador.legacySlotId) {
      await tx.ambassadorSlot.updateMany({
        where: { code: ambassador.legacySlotId, vacant: false },
        data: { name: newName },
      });
    }
    await tx.ambassadorNameChange.create({
      data: { ambassadorId, oldName, newName, source: "SELF", changedById: actorUserId },
    });
  });

  // The Head of Growth is told, so a rename is visible without being work: a
  // bell, never an email, because at 5,000 ambassadors this is routine.
  await notifyGrowth({
    title: NAME_CHANGE_TEXT.hogTitle,
    message: NAME_CHANGE_TEXT.hogMessage(oldName, newName, ambassador.ambassadorId),
    type: "info",
    link: `/admin/ambassadors/${ambassadorId}`,
  }).catch((error) => {
    // The name is already changed and committed; a failed bell must not undo it.
    console.error("[name-change] could not notify growth", error);
  });

  return { fullName: newName, bankNudge: bankNudgeFor(newName, ambassador.accountName) };
}

/**
 * The write that records an admin's correction in the same history. Returned
 * unawaited so `updateAmbassador` can add it to the one transaction it already
 * builds. Not `SELF`, so it leaves the ambassador's 30-day allowance alone.
 */
export function logAdminNameChange(
  ambassadorId: string,
  oldName: string,
  newName: string,
  actorUserId: string | null
): Prisma.PrismaPromise<unknown> {
  return db.ambassadorNameChange.create({
    data: { ambassadorId, oldName, newName, source: "ADMIN", changedById: actorUserId },
  });
}
