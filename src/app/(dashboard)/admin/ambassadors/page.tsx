import type { Metadata } from "next";

export const metadata: Metadata = { title: "Ambassadors" };

const AMBASSADOR_PANEL_URL = "https://educraft-ambassador.vercel.app/";

/**
 * Embeds the original Ambassador Panel (roster/slots, Core/Sub links, click
 * tracking, applications, broadcasts) inside the HQ shell.
 *
 * One iframe, not one per tab: the panel's Schools/Core/Sub/Applications/
 * Tracking/Manage tabs are plain React state inside its own AdminDashboard
 * component, never reflected in the URL (no hash routing), so there is no
 * per-tab URL to point separate iframes at. Every tab is reached by clicking
 * inside this embed, same as visiting the panel directly.
 *
 * Its data lives in Redis, not HQ's Postgres tables — approvals, roster
 * edits, and order logging done here do not appear in /admin/ambassadors
 * elsewhere or in /apply's applicant list. The panel also has its own
 * password gate; a visitor here logs into it separately, inside the frame.
 */
export default function AmbassadorsPanelPage() {
  return (
    <iframe
      src={AMBASSADOR_PANEL_URL}
      title="EduCraft Ambassador Panel"
      className="block h-[calc(100vh-9rem)] w-full border-0"
    />
  );
}
