import { db } from "@/lib/db";
import { BroadcastButton } from "@/components/ambassadors/BroadcastButton";

/**
 * The Broadcast button for any Ambassadors tab header. Counts the same pool
 * `broadcastToAmbassadors` sends to (Active, email on file), so the number in
 * the dialog is the number that gets the email.
 */
export async function BroadcastAction() {
  const recipientCount = await db.ambassador.count({
    where: { status: "Active", email: { not: null } },
  });
  return <BroadcastButton recipientCount={recipientCount} />;
}
