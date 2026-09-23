import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LuChevronRight, LuFolderPlus } from "react-icons/lu";
import { getClientScope } from "@/lib/api";
import { db } from "@/lib/db";
import { listClientProjectCards, type ClientCardGroup, type ClientProjectCard } from "@/lib/services/client-portal";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { cn, formatDate, formatNaira } from "@/lib/utils";

export const metadata: Metadata = { title: "My projects" };
export const dynamic = "force-dynamic";

const SECTIONS: { group: ClientCardGroup; title: string }[] = [
  { group: "active", title: "In progress" },
  { group: "awaiting_payment", title: "Waiting for your downpayment" },
  { group: "finished", title: "Delivered" },
  { group: "closed", title: "Closed" },
];

/**
 * A signed-in client's projects: work under way first, then orders not paid
 * for yet, then delivered and closed ones. Every client page follows the same
 * contract: get the scope from `getClientScope()` and read through
 * src/lib/services/client-portal.ts, which filters EVERY query by
 * `scope.clientIds`.
 */
export default async function ClientHomePage() {
  const scope = await getClientScope();
  if (!scope) redirect("/client/login");

  const [client, cards] = await Promise.all([
    // One record per person; if older duplicates are still linked, the oldest is theirs.
    db.client.findFirst({
      where: { id: { in: scope.clientIds } },
      orderBy: { createdAt: "asc" },
      select: { clientId: true, fullName: true },
    }),
    listClientProjectCards(scope),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Welcome, ${client?.fullName.split(/\s+/)[0] ?? "there"}`}
        description={
          client ? (
            <>
              Your Client ID: <span className="font-mono text-foreground">{client.clientId}</span>
            </>
          ) : undefined
        }
      />

      {cards.length === 0 ? (
        <EmptyState
          icon={LuFolderPlus}
          title="No projects yet"
          description="When you order from EduCraft, your project appears here."
          action={{ label: "Start a project", href: "/intake" }}
        />
      ) : (
        SECTIONS.map(({ group, title }) => {
          const items = cards.filter((c) => c.group === group);
          if (items.length === 0) return null;
          return (
            <section key={group} aria-label={title}>
              <h2 className="meta-label mb-3">
                {title} · {items.length}
              </h2>
              <ul className="space-y-3">
                {items.map((p) => (
                  <li key={p.code}>
                    <ProjectCard project={p} />
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}

function ProjectCard({ project: p }: { project: ClientProjectCard }) {
  const unpaid = p.group === "awaiting_payment";
  const closed = p.group === "closed";
  const current = p.progress.steps.find((s) => s.state === "current");
  return (
    <Link
      href={`/client/projects/${encodeURIComponent(p.code)}`}
      className={cn(
        "surface block p-4 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5",
        closed && "opacity-75"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="line-clamp-2 text-[15px] font-semibold leading-snug text-foreground">{p.title}</p>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground">
            {p.code} · {formatDate(p.createdAt)}
          </p>
        </div>
        <LuChevronRight className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
      </div>

      <p className="mt-3 text-sm text-muted-foreground">{p.progress.headline}</p>

      {unpaid ? (
        // Nothing has started: no progress bar and no delivery date, just what starts it.
        <div className="mt-3">
          <span className="inline-flex rounded-full bg-gold/15 px-2.5 py-1 text-xs font-medium text-gold">
            Pay {formatNaira(p.downpaymentAmount)} to start
          </span>
        </div>
      ) : (
        <>
          {!closed ? (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zone" aria-hidden>
              <div className="h-full rounded-full bg-primary" style={{ width: `${p.progress.percent}%` }} />
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
            {p.nextAction ? (
              <span className="rounded-full bg-gold/15 px-2.5 py-1 font-medium text-gold">{p.nextAction}</span>
            ) : (
              <span className="text-muted-foreground">{current?.label ?? (p.group === "finished" ? "Delivered" : "")}</span>
            )}
            {p.countdown.date && p.group === "active" ? (
              <span className={cn("text-muted-foreground", p.countdown.tone === "danger" && "text-danger")}>
                Expected {formatDate(p.countdown.date)}
              </span>
            ) : null}
          </div>
        </>
      )}
    </Link>
  );
}
