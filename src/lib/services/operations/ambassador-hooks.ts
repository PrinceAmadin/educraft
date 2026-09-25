import { db } from "@/lib/db";
import { notifyUsers } from "@/lib/services/notifications";

/**
 * Where the Operations Platform touches the Ambassador Platform.
 *
 * A referred client's downpayment is what counts as a conversion (Phase 3,
 * on the payment confirmation). Delivery is the second checkpoint: the
 * referrer is put on the client's record if the payment path never did it,
 * and the ambassador hears that the client received their work. When the
 * Phase 3 branch merges, its AmbassadorReferral conversion (for a referral
 * that somehow was not counted at the downpayment) plugs in here.
 *
 * Never throws: the delivery already happened.
 */
export async function onProjectDelivered(projectDbId: string): Promise<void> {
  try {
    const project = await db.project.findUnique({
      where: { id: projectDbId },
      select: {
        projectId: true,
        ambassadorId: true,
        clientId: true,
        client: { select: { referredById: true } },
        ambassador: { select: { userId: true, fullName: true } },
      },
    });
    if (!project?.ambassadorId) return;
    if (!project.client.referredById) {
      await db.client.update({ where: { id: project.clientId }, data: { referredById: project.ambassadorId } });
    }
    if (project.ambassador?.userId) {
      await notifyUsers([project.ambassador.userId], {
        title: "A client you referred received their project",
        message: `${project.projectId} has been delivered. Thank you for the referral.`,
        type: "success",
        link: "/ambassador/referrals",
      });
    }
  } catch (error) {
    console.error("[ambassador-hooks] onProjectDelivered", error);
  }
}
