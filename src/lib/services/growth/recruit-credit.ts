import { db } from "@/lib/db";

/**
 * Who gets credit for a recruit, from the card they scanned.
 *
 * Resolved twice on purpose. Once when the application is submitted, where the
 * holder is SNAPSHOTTED onto the application: a card can be retired or handed
 * to someone else between applying and being approved, and the credit belongs
 * to whoever held it when the scan happened — the same reasoning the payout
 * ledger already uses for `recipientName`. And once at approval, where the
 * snapshot is checked before it is copied onto the ambassador.
 *
 * "APPLICATION" is the existing value for someone who applied off their own
 * bat, and is what every rejected credit falls back to. Nothing throws: a
 * missing or retired card costs the holder their credit, never the applicant
 * their application.
 */

export interface RecruitCredit {
  recruitCardCode: string | null;
  recruitedByType: string | null;
  recruitedBy: string | null;
}

export const NO_CREDIT: RecruitCredit = {
  recruitCardCode: null,
  recruitedByType: null,
  recruitedBy: null,
};

/** Applied for on their own: recorded as such rather than left blank. */
export const SELF_FOUND = { recruitedByType: "APPLICATION", recruitedBy: null } as const;

/**
 * The credit a scanned card earns, for storing on the application. Only an
 * ACTIVE card credits anyone; a retired one keeps its code (so the funnel can
 * still count the scan that produced this application) and credits nobody.
 */
export async function creditFromCard(code: string | null): Promise<RecruitCredit> {
  if (!code) return NO_CREDIT;
  try {
    const card = await db.recruitCard.findUnique({
      where: { code },
      select: { code: true, status: true, holderType: true, holderId: true },
    });
    if (!card) return NO_CREDIT;
    if (card.status !== "ACTIVE") return { recruitCardCode: card.code, recruitedByType: null, recruitedBy: null };
    return { recruitCardCode: card.code, recruitedByType: card.holderType, recruitedBy: card.holderId };
  } catch (error) {
    // A card is printed paper and an application is the thing that matters:
    // losing the credit is a worse-but-acceptable outcome, losing the
    // application is not.
    console.error("[recruit-credit] card lookup failed:", error instanceof Error ? error.message : error);
    return NO_CREDIT;
  }
}

/**
 * The credit to write onto a new Ambassador at approval, from what the
 * application stored.
 *
 * Two guards, sized to what is at stake — a recruiter's bonus on someone who
 * still has to be approved and still has to bring a paying student:
 *   · the holder must still exist, and their card must not have been retired;
 *   · nobody is credited with recruiting themselves.
 */
export async function creditForApproval(
  application: { recruitCardCode: string | null; recruitedByType: string | null; recruitedBy: string | null; userId: string | null },
): Promise<{ recruitedByType: string; recruitedBy: string | null }> {
  const { recruitedByType, recruitedBy } = application;
  if (!recruitedByType || !recruitedBy) return SELF_FOUND;

  try {
    if (application.recruitCardCode) {
      const card = await db.recruitCard.findUnique({
        where: { code: application.recruitCardCode },
        select: { status: true },
      });
      if (card && card.status !== "ACTIVE") return SELF_FOUND;
    }

    if (recruitedByType === "HOG") {
      const user = await db.user.findUnique({ where: { id: recruitedBy }, select: { id: true } });
      if (!user) return SELF_FOUND;
      // An executive's own login cannot be the applicant's.
      if (application.userId && application.userId === recruitedBy) return SELF_FOUND;
      return { recruitedByType, recruitedBy };
    }

    if (recruitedByType === "AMBASSADOR") {
      const holder = await db.ambassador.findUnique({
        where: { id: recruitedBy },
        select: { id: true, userId: true },
      });
      if (!holder) return SELF_FOUND;
      if (application.userId && holder.userId === application.userId) return SELF_FOUND;
      return { recruitedByType, recruitedBy };
    }

    return SELF_FOUND;
  } catch (error) {
    console.error("[recruit-credit] approval check failed:", error instanceof Error ? error.message : error);
    return SELF_FOUND;
  }
}
