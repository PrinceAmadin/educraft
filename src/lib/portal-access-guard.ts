import { redirect } from "next/navigation";
import { auth, homeForRole } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * Server-side gate for /worker and /ambassador pages. The middleware lets any
 * worker, ambassador or client login into either portal (it cannot read the
 * database); this checks the login really owns that profile and that it is in
 * good standing, so a suspended worker who is also an ambassador cannot open
 * the worker dashboard. Anyone without it goes back to their own dashboard.
 */
export async function requirePortalProfile(portal: "worker" | "ambassador"): Promise<void> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const profile =
    portal === "worker"
      ? await db.worker.findUnique({ where: { userId: session.user.id }, select: { status: true } })
      : await db.ambassador.findUnique({ where: { userId: session.user.id }, select: { status: true } });

  const open =
    portal === "worker" ? profile?.status === "Active" || profile?.status === "On Break" : profile?.status === "Active";
  if (open) return;

  const own = homeForRole(session.user.role);
  if (own !== `/${portal}`) redirect(own);

  // This is their own role's portal but the profile is missing or suspended. If they
  // hold the other one in good standing, go there; otherwise let the page show its
  // own "no profile" state (sending them to /login would bounce straight back).
  const otherPortal = portal === "worker" ? "ambassador" : "worker";
  const other =
    otherPortal === "worker"
      ? await db.worker.findUnique({ where: { userId: session.user.id }, select: { status: true } })
      : await db.ambassador.findUnique({ where: { userId: session.user.id }, select: { status: true } });
  const otherOpen =
    otherPortal === "worker" ? other?.status === "Active" || other?.status === "On Break" : other?.status === "Active";
  if (otherOpen) redirect(`/${otherPortal}`);
  // Or their client orders, if they have any.
  if (await db.client.count({ where: { userId: session.user.id } })) redirect("/client");
}
