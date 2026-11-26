import QRCode from "qrcode";
import { db } from "@/lib/db";
import { siteUrl } from "@/lib/site-url";

/**
 * Printed QR card designs. One row per DESIGN, not per card: at the price a
 * card costs, variable-data printing of a unique code per card is not worth
 * it, so a code belongs to whoever hands the stack out.
 *
 * The code is what is printed, so it is short and unambiguous — four
 * characters from an alphabet with no I, L, O or U, because a student who
 * cannot scan has to be able to type it off the card. Four characters give
 * about a million codes: at twenty live cards a guess lands on a real one
 * roughly once in fifty thousand, and the only consequence is a single
 * mis-attributed scan. Nothing is stolen and no money moves, so this is the
 * right length. (Contrast `newInviteToken` in pro-bono.ts: a device-locked
 * one-time invite needs 32 characters, which no one could read off a card.)
 */

/** No I, L, O or U: nothing in here can be misread off a printed card. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LENGTH = 4;
const MINT_ATTEMPTS = 8;

export type RecruitHolderType = "HOG" | "AMBASSADOR";

export interface RecruitCardView {
  id: string;
  code: string;
  label: string;
  holderType: string;
  holderId: string;
  holderName: string | null;
  batch: string | null;
  universityId: string | null;
  universityName: string | null;
  printedCount: number | null;
  unitCostNgn: number | null;
  status: string;
  /** What goes under the QR on the card, and what the QR encodes. */
  scanUrl: string;
  createdAt: Date;
  retiredAt: Date | null;
}

function randomCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}

/**
 * The URL the QR encodes. Upper case `/J/` on purpose: a QR code can use its
 * compact alphanumeric mode only for digits and CAPITALS, so one lowercase
 * character forces the larger byte mode and a denser symbol that is harder to
 * scan in poor classroom light. `next.config` redirects a typed `/j/` here.
 */
export const scanUrlFor = (code: string) => `${siteUrl()}/J/${code}`;

/**
 * Names for the two holder kinds. The same two lookups the ambassador
 * directory already does for `recruitedBy`, in one place so the funnel and the
 * card list agree.
 */
export async function resolveRecruiterNames(
  holders: { holderType: string; holderId: string }[]
): Promise<Map<string, string>> {
  const userIds = holders.filter((h) => h.holderType === "HOG").map((h) => h.holderId);
  const ambassadorIds = holders.filter((h) => h.holderType === "AMBASSADOR").map((h) => h.holderId);

  const [users, ambassadors] = await Promise.all([
    userIds.length
      ? db.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, displayName: true, execProfile: { select: { fullName: true } } },
        })
      : Promise.resolve([]),
    ambassadorIds.length
      ? db.ambassador.findMany({ where: { id: { in: ambassadorIds } }, select: { id: true, fullName: true } })
      : Promise.resolve([]),
  ]);

  const names = new Map<string, string>();
  for (const u of users) names.set(`HOG:${u.id}`, u.execProfile?.fullName || u.displayName || "Unknown");
  for (const a of ambassadors) names.set(`AMBASSADOR:${a.id}`, a.fullName);
  return names;
}

function toView(
  row: {
    id: string;
    code: string;
    label: string;
    holderType: string;
    holderId: string;
    batch: string | null;
    universityId: string | null;
    university: { name: string } | null;
    printedCount: number | null;
    unitCostNgn: number | null;
    status: string;
    createdAt: Date;
    retiredAt: Date | null;
  },
  names: Map<string, string>
): RecruitCardView {
  return {
    id: row.id,
    code: row.code,
    label: row.label,
    holderType: row.holderType,
    holderId: row.holderId,
    holderName: names.get(`${row.holderType}:${row.holderId}`) ?? null,
    batch: row.batch,
    universityId: row.universityId,
    universityName: row.university?.name ?? null,
    printedCount: row.printedCount,
    unitCostNgn: row.unitCostNgn,
    status: row.status,
    scanUrl: scanUrlFor(row.code),
    createdAt: row.createdAt,
    retiredAt: row.retiredAt,
  };
}

const SELECT = {
  id: true,
  code: true,
  label: true,
  holderType: true,
  holderId: true,
  batch: true,
  universityId: true,
  university: { select: { name: true } },
  printedCount: true,
  unitCostNgn: true,
  status: true,
  createdAt: true,
  retiredAt: true,
} as const;

export async function listRecruitCards(): Promise<RecruitCardView[]> {
  const rows = await db.recruitCard.findMany({ select: SELECT, orderBy: [{ status: "asc" }, { createdAt: "desc" }] });
  const names = await resolveRecruiterNames(rows);
  return rows.map((row) => toView(row, names));
}

export interface MintCardInput {
  holderType: RecruitHolderType;
  holderId: string;
  label: string;
  batch?: string | null;
  universityId?: string | null;
  printedCount?: number | null;
  unitCostNgn?: number | null;
}

export class RecruitCardError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "RecruitCardError";
  }
}

/** The card's holder must exist, or its scans credit nobody. */
async function assertHolder(holderType: RecruitHolderType, holderId: string): Promise<void> {
  if (holderType === "HOG") {
    const user = await db.user.findUnique({ where: { id: holderId }, select: { id: true, isActive: true } });
    if (!user) throw new RecruitCardError("That team member no longer has a login.", 404);
    if (!user.isActive) throw new RecruitCardError("That login is switched off.");
    return;
  }
  const ambassador = await db.ambassador.findUnique({ where: { id: holderId }, select: { id: true, status: true } });
  if (!ambassador) throw new RecruitCardError("That ambassador no longer has a record.", 404);
  if (ambassador.status !== "Active") throw new RecruitCardError("That ambassador is not active.");
}

export async function mintRecruitCard(input: MintCardInput, actorUserId: string): Promise<RecruitCardView> {
  const label = input.label.trim();
  if (label.length < 2) throw new RecruitCardError("Give the card a name, so you can tell designs apart.");
  await assertHolder(input.holderType, input.holderId);

  // Retry on the unique violation rather than reading first: a collision is
  // rare enough that a check-then-insert would only add a round trip and a race.
  for (let attempt = 0; attempt < MINT_ATTEMPTS; attempt += 1) {
    try {
      const row = await db.recruitCard.create({
        data: {
          code: randomCode(),
          holderType: input.holderType,
          holderId: input.holderId,
          label,
          batch: input.batch?.trim() || null,
          universityId: input.universityId || null,
          printedCount: input.printedCount ?? null,
          unitCostNgn: input.unitCostNgn ?? null,
          createdById: actorUserId,
        },
        select: SELECT,
      });
      const names = await resolveRecruiterNames([row]);
      return toView(row, names);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code !== "P2002") throw error;
    }
  }
  throw new RecruitCardError("Could not allocate a code. Try again.", 500);
}

/**
 * Retire a design. Its scans keep being recorded — the cards are already out
 * there and a scan is still a real event — but its holder stops earning credit
 * for the applications they lead to.
 */
export async function setRecruitCardStatus(id: string, status: "ACTIVE" | "RETIRED"): Promise<void> {
  const { count } = await db.recruitCard.updateMany({
    where: { id },
    data: { status, retiredAt: status === "RETIRED" ? new Date() : null },
  });
  if (count === 0) throw new RecruitCardError("That card no longer exists.", 404);
}

/**
 * The QR as a data URL, at print size. Error correction M so a thumb smudge or
 * a slight crease still scans, and a wide margin because a QR needs clear
 * white around it to be found at all.
 */
export function qrDataUrl(code: string): Promise<string> {
  return QRCode.toDataURL(scanUrlFor(code), { margin: 4, width: 1024, errorCorrectionLevel: "M" });
}
