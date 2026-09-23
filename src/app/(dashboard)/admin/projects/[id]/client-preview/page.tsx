import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LuArrowLeft, LuEye } from "react-icons/lu";
import { db } from "@/lib/db";
import { getClientProjectView } from "@/lib/services/client-portal";
import { parseClientTab } from "@/components/client/ClientProjectTabs";
import { ClientProjectScreen } from "@/components/client/ClientProjectScreen";

export const metadata: Metadata = { title: "Client preview" };
export const dynamic = "force-dynamic";

/**
 * Exactly what the client sees on their project page, built from the same
 * data functions and components, for checking nothing internal leaks. Nothing
 * here acts on the client's behalf and nothing is marked read. Admin-only (the
 * middleware guards /admin).
 */
export default async function ClientPreviewPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tab?: string };
}) {
  const project = await db.project.findFirst({
    where: { OR: [{ id: params.id }, { projectId: params.id }] },
    select: { projectId: true, clientId: true, client: { select: { fullName: true } } },
  });
  if (!project) notFound();

  const view = await getClientProjectView({ userId: "admin-preview", clientIds: [project.clientId] }, project.projectId);
  if (!view) notFound();

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <Link
        href={`/admin/projects/${project.projectId}?tab=messages`}
        className="-ml-1 inline-flex min-h-9 items-center gap-1.5 rounded-md px-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <LuArrowLeft className="size-4" aria-hidden />
        Back to {project.projectId}
      </Link>
      <p className="flex items-start gap-2 rounded-2xl bg-primary/10 p-4 text-sm text-foreground">
        <LuEye className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        Preview: this is exactly what {project.client.fullName} sees. Buttons are switched off here.
      </p>
      <ClientProjectScreen
        view={view}
        tab={parseClientTab(searchParams.tab)}
        basePath={`/admin/projects/${project.projectId}/client-preview`}
        preview
      />
    </div>
  );
}
