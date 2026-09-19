import type { Metadata } from "next";
import { LuInbox, LuLink2Off } from "react-icons/lu";
import { auth } from "@/lib/auth";
import { getAmbassadorByUserId } from "@/lib/services/ambassador-portal";
import {
  getAmbassadorLink,
  getAnalytics,
  getHistory,
  getOverview,
  getQuality,
} from "@/lib/services/ambassador-analytics";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { CopyLinkButton } from "@/components/ambassadors/CopyLinkButton";
import { LinkTabs, parseLinkTab } from "@/components/ambassador-analytics/LinkTabs";
import {
  AnalyticsPanel,
  HistoryPanel,
  OverviewPanel,
  QualityPanel,
} from "@/components/ambassador-analytics/LinkTabPanels";
import { RawLogPanel } from "@/components/ambassador-analytics/RawLogPanel";

export const metadata: Metadata = { title: "My link" };
export const dynamic = "force-dynamic";

/**
 * My Link: analytics for the ambassador's own shared link. The ambassador is
 * resolved from the session only; every query below is scoped to that id.
 */
export default async function MyLinkPage({ searchParams }: { searchParams: { tab?: string } }) {
  const session = await auth();
  const ambassador = session?.user ? await getAmbassadorByUserId(session.user.id) : null;
  if (!ambassador) {
    return (
      <EmptyState
        icon={LuInbox}
        title="No ambassador profile yet"
        description="Your account isn't linked to an ambassador profile. Contact an admin to get set up."
      />
    );
  }

  const link = await getAmbassadorLink(ambassador.id);
  if (!link) {
    return (
      <div className="space-y-7">
        <PageHeader title="My link" />
        <EmptyState
          icon={LuLink2Off}
          title="No link assigned yet"
          description="EduCraft hasn't given you an ambassador slot yet. Once you have one, your link and its analytics appear here."
        />
      </div>
    );
  }

  const tab = parseLinkTab(searchParams.tab);
  const label = link.linkPath.startsWith("/EduCraftA/") ? `EduCraftA-${link.slotCode}` : link.slotCode;

  return (
    <div className="space-y-7">
      <PageHeader
        title="My link"
        description="See who opens your link, when and from where, so you know when and where to share it."
        actions={<CopyLinkButton path={link.linkPath} label="Copy my link" />}
      />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-zone px-4 py-3">
        <span className="meta-label">Your slot</span>
        <span className="font-mono text-sm font-medium text-primary">{label}</span>
        <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">{link.linkPath}</span>
      </div>

      <LinkTabs active={tab} basePath="/ambassador/link" />

      {tab === "overview" ? <OverviewPanel data={await getOverview(ambassador.id, link.slotCode)} /> : null}
      {tab === "analytics" ? <AnalyticsPanel data={await getAnalytics(ambassador.id)} /> : null}
      {tab === "quality" ? <QualityPanel data={await getQuality(ambassador.id)} /> : null}
      {tab === "history" ? <HistoryPanel periods={await getHistory(ambassador.id)} /> : null}
      {tab === "log" ? <RawLogPanel exportHref="/api/ambassador/link/export" /> : null}
    </div>
  );
}
