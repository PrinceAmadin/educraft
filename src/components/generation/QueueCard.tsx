"use client";

import { LuCircleCheck, LuCirclePause, LuHourglass, LuListOrdered, LuLoaderCircle } from "react-icons/lu";
import { ordinal, type QueueState } from "@/lib/generation/generation-queue";
import { cn } from "@/lib/utils";

const WAT = "Africa/Lagos";

function dayKey(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: WAT });
}

/** "today 16:40", "tomorrow 09:10" or "Mon 29 Sept, 10:00", in Nigerian time. */
export function formatStart(iso: string, now: Date): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: WAT });
  const today = dayKey(now);
  const tomorrow = dayKey(new Date(now.getTime() + 86_400_000));
  if (dayKey(d) === today) return `today ${time}`;
  if (dayKey(d) === tomorrow) return `tomorrow ${time}`;
  return `${d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: WAT })}, ${time}`;
}

/** "about 45 min", "about 2 h 10 min"; null when it is due now. */
export function formatWait(iso: string, now: Date): string | null {
  const minutes = Math.round((new Date(iso).getTime() - now.getTime()) / 60_000);
  if (minutes <= 1) return null;
  if (minutes < 60) return `about ${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `about ${h} h${m ? ` ${m} min` : ""}`;
}

/** The project's place in the generation queue, or what it is doing instead. Updates live from queue_position. */
export function QueueCard({ queue, now }: { queue: QueueState; now: Date }) {
  const basis = `Express orders go first. Estimate: ${queue.basis.concurrent} at a time, about ${queue.basis.avgMinutes} min each${queue.basis.fromHistory ? " (from finished reports)" : " (a starting figure until 3 reports have finished)"}.`;

  if (queue.status === "queued" && queue.position !== null) {
    const wait = queue.estimatedStartTime ? formatWait(queue.estimatedStartTime, now) : null;
    return (
      <section className="space-y-2 rounded-2xl bg-card p-4 shadow-soft" aria-labelledby="queue-heading" data-queue-status="queued">
        <p className="eyebrow flex items-center gap-2 text-primary">
          <LuListOrdered className="size-4" aria-hidden />
          Generation queue
        </p>
        <h3 id="queue-heading" className="text-lg font-semibold tracking-tight text-foreground">
          <span className="font-mono tabular-nums" data-queue-position={queue.position}>
            {ordinal(queue.position)}
          </span>{" "}
          in line
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            <span className="font-mono tabular-nums">{queue.queueLength}</span> waiting
          </span>
        </h3>
        {queue.estimatedStartTime ? (
          <p className="text-sm text-foreground">
            Estimated start: <span className="font-medium">{wait ? formatStart(queue.estimatedStartTime, now) : "as soon as a slot is free"}</span>
            {wait ? <span className="text-muted-foreground"> ({wait})</span> : null}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">{basis}</p>
      </section>
    );
  }

  const states = {
    not_ready: { icon: LuHourglass, title: "Not in the generation queue yet", body: "A report joins the queue when the founder or the COO starts it, once its research mode is approved and the project is in progress.", className: "text-muted-foreground" },
    generating: { icon: LuLoaderCircle, title: "Generating", body: "This report has started; its chapters are written here.", className: "text-primary" },
    paused: { icon: LuCirclePause, title: "Paused for data", body: "Generation carries on once the data is verified.", className: "text-gold" },
    done: { icon: LuCircleCheck, title: "All chapters written", body: "Every chapter of this report is complete.", className: "text-success" },
    queued: { icon: LuListOrdered, title: "In the queue", body: "", className: "text-primary" },
  } as const;
  const s = states[queue.status];
  const Icon = s.icon;
  return (
    <section className="space-y-1.5 rounded-2xl bg-zone p-4" aria-labelledby="queue-heading" data-queue-status={queue.status}>
      <p className="eyebrow flex items-center gap-2 text-muted-foreground">
        <LuListOrdered className="size-4" aria-hidden />
        Generation queue
      </p>
      <h3 id="queue-heading" className={cn("flex items-center gap-2 text-[15px] font-semibold", s.className)}>
        <Icon className={cn("size-4", queue.status === "generating" && "animate-spin motion-reduce:animate-none")} aria-hidden />
        {s.title}
      </h3>
      <p className="text-sm text-muted-foreground">{s.body}</p>
      {queue.status === "not_ready" && queue.queueLength ? (
        <p className="text-xs text-muted-foreground">
          <span className="font-mono tabular-nums">{queue.queueLength}</span> report{queue.queueLength === 1 ? "" : "s"} waiting in the queue now.
        </p>
      ) : null}
    </section>
  );
}
