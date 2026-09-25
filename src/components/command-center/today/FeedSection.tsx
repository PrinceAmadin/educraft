import Link from "next/link";
import { EmptyState } from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { IconEmpty } from "@/lib/icons";
import { FEED_KIND_META, formatWatTime, type Tone } from "@/lib/command-center/presentation";
import type { FeedEvent } from "@/lib/command-center/types";
import { cn } from "@/lib/utils";

/** Icon bubble fills per tone — the old ActionRequired idiom, one per tone. */
const TONE_BUBBLE: Record<Tone, string> = {
  success: "bg-success/10 text-success",
  danger: "bg-danger/10 text-danger",
  gold: "bg-gold/10 text-gold",
  primary: "bg-primary/10 text-primary",
  muted: "bg-elevated text-muted-foreground",
};

const ROW = "-mx-2 flex min-h-12 items-start gap-3 rounded-lg px-2 py-3";
const ROW_LINK =
  "transition-colors duration-fast hover:bg-zone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

/**
 * Today's activity feed (Phase 5): everything that happened since midnight
 * WAT, newest first. Each row carries an icon bubble by kind, the WAT time
 * in mono, and is a Link when the payload gives it a destination. When the
 * branch cannot track a signal yet, `pending` names it in one footnote line.
 */
export function FeedSection({
  feed,
  pending,
  dayLabel,
}: {
  feed: FeedEvent[];
  pending: string[];
  dayLabel: string;
}) {
  return (
    <section aria-labelledby="cc-today-feed" className="min-w-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="cc-today-feed" className="text-[15px] font-semibold leading-tight text-foreground">
            {"Today's activity"}
          </h2>
          <p className="mt-1 text-[13px] text-muted-foreground">{dayLabel} · newest first</p>
        </div>
        {feed.length > 0 ? (
          <span className="shrink-0 font-mono text-[13px] tabular-nums text-muted-foreground">
            {feed.length}
          </span>
        ) : null}
      </div>

      {feed.length === 0 ? (
        <EmptyState
          icon={IconEmpty}
          title="Nothing yet today"
          description="Payments, approvals, deliveries and new people show up here as they happen."
          className="mt-3"
        />
      ) : (
        <ul className="mt-2 divide-y divide-border/70">
          {feed.map((event) => (
            <li key={event.id}>
              <FeedRow event={event} />
            </li>
          ))}
        </ul>
      )}

      {pending.length > 0 ? (
        <p className="mt-3 text-[13px] text-muted-foreground">
          Not yet on this dashboard: {pending.join(", ")}.
        </p>
      ) : null}
    </section>
  );
}

function FeedRow({ event }: { event: FeedEvent }) {
  const meta = FEED_KIND_META[event.kind];
  const Icon = meta.icon;
  const body = (
    <>
      <span className={cn("mt-0.5 shrink-0 rounded-md p-1.5", TONE_BUBBLE[meta.tone])}>
        <Icon className="size-4" aria-hidden />
        <span className="sr-only">{meta.label}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-foreground">{event.title}</span>
        {event.detail ? (
          <span className="mt-0.5 block text-[13px] text-muted-foreground">{event.detail}</span>
        ) : null}
      </span>
      <time
        dateTime={event.at}
        className="shrink-0 whitespace-nowrap font-mono text-xs tabular-nums text-subtle"
      >
        {formatWatTime(event.at)}
      </time>
    </>
  );

  return event.href ? (
    <Link href={event.href} className={cn(ROW, ROW_LINK)}>
      {body}
    </Link>
  ) : (
    <div className={ROW}>{body}</div>
  );
}

export function FeedSectionSkeleton() {
  return (
    <div className="min-w-0" aria-hidden>
      <Skeleton className="h-4 w-36" />
      <Skeleton className="mt-2 h-3 w-44" />
      <div className="mt-3 space-y-1">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex min-h-12 items-start gap-3 py-3">
            <Skeleton className="size-7 rounded-md" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-3/4" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-3 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}
