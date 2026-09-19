import { LuLink2Off } from "react-icons/lu";
import { EmptyState } from "@/components/shared/EmptyState";
import { CopyLinkButton } from "@/components/ambassadors/CopyLinkButton";
import { DateRangePicker } from "@/components/ambassador-analytics/DateRangePicker";
import { LinkTabs, parseLinkTab } from "@/components/ambassador-analytics/LinkTabs";
import {
  AnalyticsPanel,
  HistoryPanel,
  OverviewPanel,
  QualityPanel,
} from "@/components/ambassador-analytics/LinkTabPanels";
import { RawLogPanel } from "@/components/ambassador-analytics/RawLogPanel";
import { ResetClicksButton } from "@/components/ambassador-analytics/ResetClicksButton";
import {
  getAmbassadorLink,
  countLiveClicks,
  getAnalytics,
  getHistory,
  getOverview,
  getQuality,
  parseRange,
} from "@/lib/services/ambassador-analytics";

/**
 * The same five analytics tabs the ambassador sees, for any ambassador an admin
 * opens. The panels are the very same components; this only swaps the data
 * source (the ambassador id comes from the admin's URL, guarded by the admin
 * page) and adds what ambassadors don't get: a date range and Reset.
 */
export async function AdminAnalytics({
  ambassadorId,
  ambassadorName,
  basePath,
  tab: tabParam,
  from,
  to,
}: {
  ambassadorId: string;
  ambassadorName: string;
  basePath: string;
  tab?: string;
  from?: string;
  to?: string;
}) {
  const link = await getAmbassadorLink(ambassadorId);
  if (!link) {
    return (
      <EmptyState
        icon={LuLink2Off}
        title="No link assigned"
        description="This ambassador has no slot yet, so there is nothing to track. Fill a slot from the Manage tab."
      />
    );
  }

  const tab = parseLinkTab(tabParam);
  const range = parseRange(from, to);
  const activeRange = range ? { from, to } : {};
  const label = link.linkPath.startsWith("/EduCraftA/") ? `EduCraftA-${link.slotCode}` : link.slotCode;
  // Overview and History are not date-filtered (fixed windows / closed periods).
  const rangeApplies = tab === "analytics" || tab === "quality" || tab === "log";
  const extraQuery = range ? `&from=${from}&to=${to}` : "";
  const exportQuery = range ? `?from=${from}&to=${to}` : "";

  const [overview, liveClicks] = await Promise.all([
    tab === "overview" ? getOverview(ambassadorId, link.slotCode) : Promise.resolve(null),
    countLiveClicks(ambassadorId),
  ]);

  return (
    <section className="space-y-6" aria-label="Link analytics">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <span className="meta-label">Slot</span>
          <span className="font-mono text-sm font-medium text-primary">{label}</span>
          <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">{link.linkPath}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CopyLinkButton path={link.linkPath} label="Copy link" />
          <ResetClicksButton
            ambassadorId={ambassadorId}
            ambassadorName={ambassadorName}
            currentClicks={liveClicks}
          />
        </div>
      </div>

      <LinkTabs active={tab} basePath={basePath} extraParams={{ view: "analytics", ...activeRange }} />

      {rangeApplies ? (
        <div className="rounded-xl bg-zone px-4 py-3">
          <DateRangePicker from={range ? from : undefined} to={range ? to : undefined} />
          <p className="mt-2 text-xs text-muted-foreground">
            {range ? `Showing ${from} to ${to}, Nigerian time.` : "Showing all tracked clicks."} The range applies to Analytics, Quality and Raw log.
          </p>
        </div>
      ) : null}

      {tab === "overview" && overview ? <OverviewPanel data={overview} admin /> : null}
      {tab === "analytics" ? <AnalyticsPanel data={await getAnalytics(ambassadorId, range, "they")} /> : null}
      {tab === "quality" ? <QualityPanel data={await getQuality(ambassadorId, range)} admin /> : null}
      {tab === "history" ? <HistoryPanel periods={await getHistory(ambassadorId)} admin /> : null}
      {tab === "log" ? (
        <RawLogPanel
          logHref={`/api/admin/ambassadors/${ambassadorId}/analytics/log`}
          exportHref={`/api/admin/ambassadors/${ambassadorId}/analytics/export${exportQuery}`}
          extraQuery={extraQuery}
        />
      ) : null}
    </section>
  );
}
