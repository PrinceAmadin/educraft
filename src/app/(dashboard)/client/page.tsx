import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LuChevronRight } from "react-icons/lu";
import { getClientScope } from "@/lib/api";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/shared/PageHeader";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "My dashboard" };
export const dynamic = "force-dynamic";

/**
 * A signed-in client's projects. Every client page follows the same contract:
 * get the scope from `getClientScope()` and filter EVERY query by
 * `scope.clientIds`, so a client can only ever see their own projects.
 */
export default async function ClientHomePage() {
  const scope = await getClientScope();
  if (!scope) redirect("/client/login");

  const [clients, projects] = await Promise.all([
    // One record per person; if older duplicates are still linked, the oldest is theirs.
    db.client.findMany({
      where: { id: { in: scope.clientIds } },
      orderBy: { createdAt: "asc" },
      select: { clientId: true, fullName: true },
    }),
    db.project.findMany({
      where: { clientId: { in: scope.clientIds } },
      orderBy: { createdAt: "desc" },
      select: { projectId: true, projectTitle: true, status: true, createdAt: true, service: { select: { serviceName: true } } },
    }),
  ]);

  return (
    <div className="space-y-7">
      <PageHeader
        title={`Welcome, ${clients[0]?.fullName.split(/\s+/)[0] ?? "there"}`}
        description={
          clients[0] ? (
            <>
              Your Client ID: <span className="font-mono text-foreground">{clients[0].clientId}</span>
            </>
          ) : undefined
        }
      />
      <section aria-label="Your projects">
        <h2 className="meta-label mb-2">Your projects · {projects.length}</h2>
        {projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">No projects yet.</p>
        ) : (
          <ul>
            {projects.map((p) => (
              <li key={p.projectId} className="border-b border-border/40 last:border-0">
                <Link
                  href={`/client/projects/${encodeURIComponent(p.projectId)}`}
                  className="flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground">{p.projectTitle?.trim() || p.service.serviceName}</span>
                    <span className="block font-mono text-xs text-muted-foreground">{p.projectId} · {formatDate(p.createdAt)}</span>
                  </span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    {p.status.replace(/_/g, " ").toLowerCase()}
                    <LuChevronRight className="size-4" aria-hidden />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
