/**
 * Every sentence a client reads about their documents: why one is locked,
 * when one that is not ready will open, and what a new document's update,
 * bell and email say. Pure, and scanned by `npm run check:client-copy`, so no
 * internal word (the review, the people behind it, automation) reaches a client.
 *
 * The rules themselves are in files/policy.ts (deliverableGate).
 */

import type { Gate, LockReason } from "@/lib/files/policy";

export const LOCK_TEXT: Record<LockReason, string> = {
  downpayment: "Pay your downpayment to download",
  balance: "Pay your balance to download",
  with_complete: "Included in your complete project",
  withheld: "Not available yet. Message us if you need it",
  closed: "No longer available",
};

/** For an item that is not ready yet: when it will open. */
export function notReadyHint(access: string, project: { downpaymentStatus: string; balanceStatus: string }): string {
  if (access === "WITH_COMPLETE") return "Comes in your complete project";
  if (access === "BALANCE" && project.balanceStatus !== "Verified") return "Not ready yet · downloads once your balance is paid";
  if (access === "DOWNPAYMENT" && project.downpaymentStatus !== "Verified") return "Not ready yet · downloads once your downpayment is in";
  return "Not ready yet · we'll let you know the moment it is";
}

/**
 * What the client hears when a document is ready. Null when they hear nothing:
 * a chapter that only ever comes inside the complete project is not announced
 * on its own (the complete project is).
 */
export function releaseAnnouncement(input: { title: string; isFinal: boolean; releaseNo: number; gate: Gate }): {
  feedTitle: string;
  feedBody: string;
  notifyTitle: string;
  notifyMessage: (projectCode: string) => string;
  emailLines: string[];
  ctaLabel: string;
  tab: "documents" | "payments";
} | null {
  const { title, isFinal, releaseNo, gate } = input;
  if (gate.state === "locked" && (gate.reason === "with_complete" || gate.reason === "withheld" || gate.reason === "closed")) return null;
  if (gate.state === "hidden") return null;
  const open = gate.state === "open";
  const waitsForBalance = gate.state === "locked" && gate.reason === "balance";
  const heading = isFinal ? "Your complete project is ready" : `${title} is ready`;
  return {
    feedTitle: releaseNo > 1 ? `${title} (version ${releaseNo}) is ready` : `${title} is ready`,
    feedBody: open
      ? "Download it from the Documents tab."
      : waitsForBalance
        ? "It unlocks for download when your balance is paid."
        : "You'll be able to download it from the Documents tab.",
    notifyTitle: heading,
    notifyMessage: (code) =>
      open ? `${code}: download it from Documents.` : waitsForBalance ? `${code}: it unlocks when your balance is paid.` : `${code}: it's on your Documents tab.`,
    emailLines: open
      ? ["It's on your dashboard now. Open the Documents tab to download it."]
      : waitsForBalance
        ? ["It's on your dashboard. It unlocks for download once your balance is paid, from the Payments tab."]
        : ["It's on your dashboard, in the Documents tab."],
    ctaLabel: open ? "Download it" : "Open your project",
    tab: waitsForBalance ? "payments" : "documents",
  };
}
