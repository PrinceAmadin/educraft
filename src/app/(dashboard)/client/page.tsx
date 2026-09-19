import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getClientScope } from "@/lib/api";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/shared/PageHeader";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "My dashboard" };
export const dynamic = "force-dynamic";

/**
 * Placeholder landing page for a signed-in client. The real client dashboard is
 * built separately and replaces this file; it shows the contract every client
 * page must follow: get the scope from `getClientScope()` and filter EVERY query
 * by `scope.clientIds`, so a client can only ever see their own projects.
 */
export default async function ClientHomePage() {
  const scope = await getClientScope();
  if (!scope) redirect("/client/login");

  const [clients, projects] = await Promise.all([
    db.client.findMany({ where: { id: { in: scope.clientIds } }, select: { clientId: true, fullName: true } }),
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
        description={`Signed in as ${clients.map((c) => c.clientId).join(", ")}.`}
      />
      <section aria-label="Your projects">
        <h2 className="meta-label mb-2">Your projects · {projects.length}</h2>
        {projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">No projects yet.</p>
        ) : (
          <ul>
            {projects.map((p) => (
              <li key={p.projectId} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border/40 py-3 last:border-0">
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">{p.projectTitle?.trim() || p.service.serviceName}</span>
                  <span className="block font-mono text-xs text-muted-foreground">{p.projectId} · {formatDate(p.createdAt)}</span>
                </span>
                <span className="text-xs text-muted-foreground">{p.status.replace(/_/g, " ").toLowerCase()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
