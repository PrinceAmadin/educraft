import type { Metadata } from "next";
import { LuCalendarDays, LuCheck, LuCircleAlert, LuClock, LuLock, LuMegaphone, LuTrendingUp } from "react-icons/lu";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/shared/PageHeader";
import { AmbassadorTabs } from "@/components/ambassadors/AmbassadorTabs";
import { MonthPicker } from "@/components/reports/MonthPicker";
import { CampaignSettings, LogContentButton, MilestoneToggle, UndoLogButton } from "@/components/ambassadors/platform/ContentActions";
import { contentConsistency, getCampaign, monthCalendar, type CalendarSlot, type MilestoneState } from "@/lib/services/ambassador-platform/content";
import { currentMonthKey } from "@/lib/services/finance/surplus";
import { contentMonthQuerySchema } from "@/lib/validations/ambassador-platform";
import { cn, formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Content hub" };
export const dynamic = "force-dynamic";

/** Phase 3 Section 8 — the Content Hub: what went out each week, how consistently, and the pre-season campaign. */
export default async function ContentHubPage({ searchParams }: { searchParams: { month?: string } }) {
  const now = new Date();
  const month = contentMonthQuerySchema.parse(searchParams).month ?? currentMonthKey(now);
  const [calendar, consistency, campaign, pendingApplications] = await Promise.all([monthCalendar(month, now), contentConsistency(now), getCampaign(now), db.ambassadorApplication.count({ where: { status: "PENDING" } })]);
  const c = consistency.correlation;

  return (
    <div className="space-y-8">
      <PageHeader title="Content hub" description="The Monday content drop, the midweek check-in and the Friday spotlight: what went out, how consistently, and the next pre-season campaign." actions={<LogContentButton />} />
      <AmbassadorTabs active="content" pendingApplications={pendingApplications} />

      <section aria-labelledby="calendar-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="calendar-heading" className="flex items-center gap-2 text-[15px] font-semibold text-foreground">
            <LuCalendarDays className="size-4 text-muted-foreground" aria-hidden />
            Content calendar — {calendar.label}
          </h2>
          <MonthPicker month={month} currentMonth={currentMonthKey(now)} basePath="/admin/ambassadors/content" />
        </div>
        <ul className="space-y-3">
          {calendar.weeks.map((w) => (
            <li key={w.week} className={cn("rounded-2xl p-4", w.isCurrent ? "bg-card shadow-soft" : "bg-zone")}>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-foreground">Week of {w.label}</p>
                {w.isCurrent ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">This week</span> : null}
                <span className="font-mono text-xs text-muted-foreground">{w.week}</span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {w.slots.map((s) => (
                  <Slot key={s.type} slot={s} onCard={w.isCurrent} />
                ))}
              </div>
              {w.others.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {w.others.map((o) => (
                    <li key={o.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <LuMegaphone className="size-3.5" aria-hidden />
                      Other post · {formatDate(o.postedAt)}
                      {o.note ? ` · ${o.note}` : ""}
                      <UndoLogButton id={o.id} label="Other post" />
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="consistency-heading" className="rounded-2xl bg-zone p-5 sm:p-7">
        <h2 id="consistency-heading" className="flex items-center gap-2 text-[15px] font-semibold text-foreground">
          <LuTrendingUp className="size-4 text-muted-foreground" aria-hidden />
          Content consistency — last {consistency.weeks} weeks
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {formatDate(consistency.from)} to {formatDate(consistency.to)}, full weeks only. The target is every post, every week.
        </p>
        <ul className="mt-4 space-y-3">
          {consistency.rows.map((r) => (
            <li key={r.type}>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-foreground">{r.label}</span>
                <span className="flex items-center gap-2">
                  <span className="font-mono tabular-nums text-foreground">
                    {r.weeks}/{r.of} weeks ({r.percent}%)
                  </span>
                  {r.status === "WARN" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-gold/15 px-2 py-0.5 text-xs font-medium text-gold">
                      <LuCircleAlert className="size-3" aria-hidden />
                      Below target
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
                      <LuCheck className="size-3" aria-hidden />
                      {r.status === "ON_TARGET" ? "On target" : "On track"}
                    </span>
                  )}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-border" aria-hidden>
                <div className={cn("h-full rounded-full", r.status === "WARN" ? "bg-gold" : "bg-primary")} style={{ width: `${r.percent}%` }} />
              </div>
            </li>
          ))}
        </ul>
        <h3 className="mt-6 text-sm font-medium text-foreground">Consistency and conversions</h3>
        <dl className="mt-2 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="meta-label">Weeks with all 3 posts</dt>
            <dd className="mt-0.5 text-foreground">
              {c.avgAllThree != null ? <span className="font-mono">{c.avgAllThree}</span> : "—"} conversions a week <span className="text-muted-foreground">({c.weeksAllThree} week{c.weeksAllThree === 1 ? "" : "s"})</span>
            </dd>
          </div>
          <div>
            <dt className="meta-label">Weeks missing a post</dt>
            <dd className="mt-0.5 text-foreground">
              {c.avgMissing != null ? <span className="font-mono">{c.avgMissing}</span> : "—"} conversions a week <span className="text-muted-foreground">({c.weeksMissing} week{c.weeksMissing === 1 ? "" : "s"})</span>
            </dd>
          </div>
          <div>
            <dt className="meta-label">Impact of consistency</dt>
            <dd className="mt-0.5 text-foreground">
              {c.impactPercent != null ? (
                <span className={cn("font-mono", c.impactPercent >= 0 ? "text-success" : "text-danger")}>
                  {c.impactPercent >= 0 ? "+" : ""}
                  {c.impactPercent}%
                </span>
              ) : (
                "Not enough weeks of each kind yet"
              )}
              {c.impactPercent != null ? " conversions when all 3 went out" : ""}
            </dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-muted-foreground">A visible pattern from the conversion dates and the content log, not a statistical analysis.</p>
      </section>

      <section aria-labelledby="campaign-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="campaign-heading" className="text-[15px] font-semibold text-foreground">
            Pre-season campaign{campaign ? ` — ${campaign.label}` : ""}
          </h2>
          <CampaignSettings label={campaign?.label ?? null} semesterStart={campaign?.semesterStart ?? null} />
        </div>
        {!campaign ? (
          <p className="rounded-2xl bg-zone px-4 py-6 text-sm text-muted-foreground">Set the next semester&apos;s start date and the campaign plan appears here: it starts 8 weeks before, with a push every two weeks.</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Semester starts <span className="text-foreground">{formatDate(campaign.semesterStart)}</span>. Campaign starts <span className="text-foreground">{formatDate(campaign.campaignStart)}</span>
              {campaign.weeksAway > 0 ? ` (${campaign.weeksAway} week${campaign.weeksAway === 1 ? "" : "s"} away)` : " (under way)"}.
            </p>
            <ol className="divide-y divide-border/70">
              {campaign.milestones.map((m) => (
                <li key={m.key} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground">{m.label}</span>
                    <span className="block text-xs text-muted-foreground">
                      {m.weeksBefore > 0 ? `${m.weeksBefore} weeks before · ` : "Week 0 · "}
                      {formatDate(m.date)}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <MilestoneState state={m.state} />
                    {m.key !== "SEMESTER" ? <MilestoneToggle milestone={m.key} done={m.done} label={m.label} /> : null}
                  </span>
                </li>
              ))}
            </ol>
          </>
        )}
      </section>
    </div>
  );
}

const SLOT_STYLE: Record<CalendarSlot["state"], { label: string; className: string; icon: typeof LuCheck }> = {
  DONE: { label: "Posted", className: "text-success", icon: LuCheck },
  DUE_TODAY: { label: "Due today", className: "text-gold", icon: LuClock },
  UPCOMING: { label: "Upcoming", className: "text-muted-foreground", icon: LuLock },
  MISSED: { label: "Not logged", className: "text-danger", icon: LuCircleAlert },
};

function Slot({ slot, onCard }: { slot: CalendarSlot; onCard?: boolean }) {
  const s = SLOT_STYLE[slot.state];
  const Icon = s.icon;
  return (
    <div className={cn("flex min-w-0 items-start justify-between gap-2 rounded-xl px-3 py-2", onCard ? "bg-zone" : "bg-card/60")}>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-foreground">{slot.label}</p>
        <p className={cn("flex items-center gap-1 text-xs", s.className)}>
          <Icon className="size-3.5" aria-hidden />
          {slot.state === "DONE" && slot.postedAt ? `Posted ${formatDate(slot.postedAt)}` : `${s.label} · ${formatDate(slot.due)}`}
        </p>
        {slot.note ? <p className="mt-0.5 truncate text-xs text-muted-foreground" title={slot.note}>{slot.note}</p> : null}
      </div>
      {slot.logId ? <UndoLogButton id={slot.logId} label={slot.label} /> : null}
    </div>
  );
}

const MILESTONE_STYLE: Record<MilestoneState, { label: string; className: string }> = {
  DONE: { label: "Done", className: "bg-success/15 text-success" },
  THIS_WEEK: { label: "This week", className: "bg-gold/15 text-gold" },
  PLANNED: { label: "Planned", className: "bg-zone text-muted-foreground" },
  MISSED: { label: "Date passed", className: "bg-danger/10 text-danger" },
  BEGUN: { label: "Semester under way", className: "bg-primary/10 text-primary" },
};

function MilestoneState({ state }: { state: MilestoneState }) {
  const s = MILESTONE_STYLE[state];
  return <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", s.className)}>{s.label}</span>;
}
