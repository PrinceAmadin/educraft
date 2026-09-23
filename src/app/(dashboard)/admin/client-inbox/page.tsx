import type { Metadata } from "next";
import Link from "next/link";
import { LuChevronRight, LuFileText, LuInbox } from "react-icons/lu";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { listUnansweredThreads } from "@/lib/services/client-messages";
import { listVersionsToReview } from "@/lib/services/deliverables";
import { cn, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Client inbox" };
export const dynamic = "force-dynamic";

function waitingFor(iso: string): { label: string; late: boolean } {
  const hours = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (hours < 1) return { label: "Waiting under an hour", late: false };
  if (hours < 24) return { label: `Waiting ${hours} hour${hours === 1 ? "" : "s"}`, late: false };
  const days = Math.floor(hours / 24);
  return { label: `Waiting ${days} day${days === 1 ? "" : "s"}`, late: true };
}

/** What is waiting on EduCraft for a client: messages to answer, then documents to release. Oldest first. */
export default async function ClientInboxPage() {
  const [rows, documents] = await Promise.all([listUnansweredThreads(), listVersionsToReview()]);

  return (
    <div className="space-y-10">
      <PageHeader
        title="Client inbox"
        description="Client messages waiting for a reply, and chapters waiting to be released. The longest-waiting first."
      />

      <section className="space-y-4">
        <h2 className="text-base font-semibold text-foreground">Messages</h2>

        {rows.length === 0 ? (
          <EmptyState icon={LuInbox} title="Nothing waiting" description="Every client message has a reply." />
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => {
              const wait = waitingFor(r.lastAt);
              return (
                <li key={r.projectDbId}>
                  <Link
                    href={`/admin/projects/${r.projectCode}?tab=messages`}
                    className="surface flex items-start gap-3 p-4 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] font-semibold text-foreground">
                        {r.clientName}
                        <span className="font-mono text-xs font-normal text-muted-foreground">{r.projectCode}</span>
                        {r.unread > 0 ? (
                          <span className="rounded-full bg-gold/15 px-2 py-0.5 text-xs font-medium text-gold">{r.unread} unread</span>
                        ) : null}
                      </p>
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{r.lastMessage}</p>
                      <p className={cn("mt-2 text-xs", wait.late ? "font-medium text-danger" : "text-subtle")}>
                        {wait.label} · {formatDateTime(r.lastAt)}
                      </p>
                    </div>
                    <LuChevronRight className="mt-1 size-5 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section id="documents" className="scroll-mt-24 space-y-4">
        <h2 className="text-base font-semibold text-foreground">Documents to review</h2>
        {documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No chapters or documents are waiting for review.</p>
        ) : (
          <ul className="space-y-3">
            {documents.map((d) => {
              const wait = waitingFor(d.submittedAt);
              return (
                <li key={d.versionId}>
                  <Link
                    href={`/admin/projects/${d.projectCode}?tab=documents`}
                    className="surface flex items-start gap-3 p-4 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5"
                  >
                    <LuFileText className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] font-semibold text-foreground">
                        {d.title}
                        <span className="font-mono text-xs font-normal text-muted-foreground">{d.projectCode}</span>
                      </p>
                      <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{d.projectTitle}</p>
                      <p className={cn("mt-2 text-xs", wait.late ? "font-medium text-danger" : "text-subtle")}>
                        Uploaded · {wait.label.toLowerCase()} · {formatDateTime(d.submittedAt)}
                      </p>
                    </div>
                    <LuChevronRight className="mt-1 size-5 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
