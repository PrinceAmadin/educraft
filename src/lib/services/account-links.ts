import { db } from "@/lib/db";
import { PERSON_ROLES } from "@/lib/roles";

/**
 * The email is the person (founder's rule, Sept 2026): every client order
 * placed with an email belongs to the login with that email, whether that
 * person signed up as a client, a worker or an ambassador, and they reach it
 * by switching dashboards. One person, one login, one dashboard.
 *
 * Only ACTIVE logins collect orders, and a login only becomes active once it is
 * trusted: a client login after an emailed code, a worker or ambassador login
 * when an admin approves the application (or after an emailed code on the
 * forgot-password page). A pending or rejected applicant's login is switched
 * off, so it never picks up anyone's orders. Staff logins never hold client
 * orders.
 */

/** Attach every unclaimed client record with this email to the login. */
export async function linkClientOrders(userId: string, email: string): Promise<void> {
  await db.client.updateMany({
    where: { email: { equals: email, mode: "insensitive" }, userId: null },
    data: { userId },
  });
}

/** The active worker, ambassador or client login with this email, if any: a new client record joins it straight away. */
export async function loginForEmail(email: string | null | undefined): Promise<string | null> {
  const address = email?.trim();
  if (!address) return null;
  const user = await db.user.findFirst({
    where: { email: { equals: address, mode: "insensitive" }, isActive: true, role: { in: [...PERSON_ROLES] } },
    select: { id: true },
  });
  return user?.id ?? null;
}
