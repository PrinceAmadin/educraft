import type { Metadata } from "next";
import { LuFolderKanban, LuInbox } from "react-icons/lu";
import { auth } from "@/lib/auth";
import { getWorkerByUserId, listWorkerProjects } from "@/lib/services/worker-portal";
import { WorkerAssignmentList } from "@/components/worker/WorkerAssignmentList";
import { EmptyState } from "@/components/shared/EmptyState";

export const metadata: Metadata = { title: "My projects" };
export const dynamic = "force-dynamic";

export default async function WorkerProjectsPage() {
  const session = await auth();
  const worker = session?.user ? await getWorkerByUserId(session.user.id) : null;
  if (!worker) {
    return <EmptyState icon={LuInbox} title="No worker profile" description="Contact an admin to get set up." />;
  }

  const rows = await listWorkerProjects(worker.id);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">My projects</h1>
        <p className="mt-1 text-sm text-muted-foreground">Everything assigned to you, newest first.</p>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={LuFolderKanban} title="No projects yet" description="Assignments will appear here." />
      ) : (
        <WorkerAssignmentList rows={rows} />
      )}
    </div>
  );
}
