import Link from "next/link";
import { LuExternalLink, LuMessageCircle } from "react-icons/lu";
import { getThread } from "@/lib/services/client-messages";
import { listUpdates } from "@/lib/services/client-updates";
import { MessageThread } from "@/components/messages/MessageThread";
import { PostUpdateForm } from "@/components/projects/client/PostUpdateForm";
import { AdminUpdatesList } from "@/components/projects/client/AdminUpdatesList";
import { ExpectedDeliveryEditor } from "@/components/projects/client/ExpectedDeliveryEditor";
import { ClientUpdateTab } from "@/components/projects/tabs/ClientUpdateTab";
import { toWaNumber, waLink } from "@/lib/whatsapp";
import { siteUrl } from "@/lib/site-url";
import { clientProjectPath } from "@/lib/services/client-notify";
import { db } from "@/lib/db";
import type { ProjectDetail } from "@/lib/services/projects";
import type { ResearchSummary } from "@/lib/services/research-summary";

/**
 * Everything the client sees from EduCraft, managed in one place: the message
 * thread (workers never see it), the activity feed, the delivery date shown to
 * the client, and the WhatsApp messages to send by hand.
 *
 * The thread is read with markRead false: this tab is mounted, hidden, every
 * time the project page opens. It is marked read when it is actually on screen.
 */
export async function ClientMessagesTab({
  project,
  researchSummary,
}: {
  project: ProjectDetail;
  researchSummary: ResearchSummary | null;
}) {
  const [messages, updates, research] = await Promise.all([
    getThread(project.id, "ADMIN", { markRead: false }),
    listUpdates(project.id, { includeHidden: true, take: 60 }),
    db.researchJob.findUnique({ where: { projectId: project.id }, select: { releasedToClientAt: true } }),
  ]);
  const firstName = project.client.fullName.trim().split(/\s+/)[0] || "the client";
  const wa = toWaNumber(project.client.phone);

  return (
    <div className="space-y-12">
      <section className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">Messages with {firstName}</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">
              The client writes from their dashboard. Workers never see this thread.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {wa ? (
              <a
                href={waLink(wa, `Hi ${firstName}, this is EduCraft about your project ${project.projectId}. `)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-zone px-3 text-sm font-medium text-foreground transition-colors hover:bg-elevated"
              >
                <LuMessageCircle className="size-4 text-primary" aria-hidden />
                WhatsApp {firstName}
              </a>
            ) : null}
            <Link
              href={`/admin/projects/${project.projectId}/client-preview`}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-zone px-3 text-sm font-medium text-foreground transition-colors hover:bg-elevated"
            >
              <LuExternalLink className="size-4 text-primary" aria-hidden />
              See what the client sees
            </Link>
          </div>
        </div>
        <MessageThread
          endpoint={`/api/admin/projects/${encodeURIComponent(project.projectId)}/messages`}
          viewer="ADMIN"
          initial={messages}
          otherName={firstName}
          emptyHint="No messages yet. Anything you write here reaches the client's dashboard and email."
          uploadEndpoint={`/api/admin/projects/${encodeURIComponent(project.projectId)}/upload`}
          filesBase={`/api/admin/projects/${encodeURIComponent(project.projectId)}/files`}
        />
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Delivery date shown to the client</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Separate from the internal deadline. It moves on by itself while the project waits for the client.
          </p>
        </div>
        <ExpectedDeliveryEditor
          projectCode={project.projectId}
          current={project.expectedDeliveryAt ? project.expectedDeliveryAt.toISOString() : null}
        />
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Updates the client sees</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Payments and progress are added by themselves. Post your own in words the client should read.
          </p>
        </div>
        <PostUpdateForm projectCode={project.projectId} />
        <AdminUpdatesList projectCode={project.projectId} updates={updates} />
      </section>

      <section className="space-y-4">
        <ClientUpdateTab
          clientFullName={project.client.fullName}
          projectCode={project.projectId}
          clientId={project.client.clientId}
          documentsUrl={`${siteUrl()}${clientProjectPath(project.projectId, "documents")}`}
          shared={Boolean(research?.releasedToClientAt)}
          summary={researchSummary}
        />
      </section>
    </div>
  );
}
