import { db } from "@/lib/db";
import { PERSON_ROLES } from "@/lib/roles";

/**
 * One login per person: client orders placed with a person's email join the
 * login that email belongs to, whether they signed up as a client, a worker or
 * an ambassador. Only for a login whose email an emailed code has proved
 * (`emailVerifiedAt`): anyone can type an email into the order form or a
 * worker application, so the inbox is the proof, never the typing.
 *
 * Staff logins never collect client orders.
 */

/** Attach this person's unclaimed client records (same email) to their login. */
export async function linkClientOrders(userId: string, email: string): Promise<void> {
  await db.client.updateMany({
    where: { email: { equals: email, mode: "insensitive" }, userId: null },
    data: { userId },
  });
}

/**
 * The login a brand-new client record should join, if its email already
 * belongs to a proved worker, ambassador or client login. Null otherwise (the
 * record waits until someone proves the inbox with a code).
 */
export async function provedLoginForEmail(email: string | null | undefined): Promise<string | null> {
  const address = email?.trim();
  if (!address) return null;
  const user = await db.user.findFirst({
    where: {
      email: { equals: address, mode: "insensitive" },
      emailVerifiedAt: { not: null },
      isActive: true,
      role: { in: [...PERSON_ROLES] },
    },
    select: { id: true },
  });
  return user?.id ?? null;
}
