import { LuCalendarClock, LuCircleCheck, LuHourglass, LuPause, LuTriangleAlert } from "react-icons/lu";
import type { ClientProjectView } from "@/lib/services/client-portal";
import { getClientPayments } from "@/lib/services/client-portal";
import { listUpdates } from "@/lib/services/client-updates";
import { getThread } from "@/lib/services/client-messages";
import { ClientProjectTabs, type ClientTabKey } from "@/components/client/ClientProjectTabs";
import { StatusStepper } from "@/components/client/StatusStepper";
import { ClientActivityFeed } from "@/components/client/ClientActivityFeed";
import { ClientPaymentsPanel } from "@/components/client/ClientPaymentsPanel";
import { ClientPayButton } from "@/components/client/ClientPayButton";
import { MessageThread } from "@/components/messages/MessageThread";
import { ClientDocumentsTab } from "@/components/client/ClientDocumentsTab";
import { cn, formatDate, formatNaira } from "@/lib/utils";

/**
 * A client's project page body: header, tabs and the open tab. The client's
 * own page and the admin "client preview" both render THIS, so the preview is
 * exactly what the client sees. In preview mode nothing is actionable (no pay
 * buttons, no composer, no receipts) and nothing is marked read.
 */
export async function ClientProjectScreen({
  view,
  tab,
  basePath,
  preview = false,
  returnedFromPaystack = false,
}: {
  view: ClientProjectView;
  tab: ClientTabKey;
  basePath: string;
  preview?: boolean;
  returnedFromPaystack?: boolean;
}) {
  return (
    <div className="space-y-6">
      <header>
        <p className="font-mono text-sm text-muted-foreground">{view.code}</p>
        <h1 className="mt-1 font-display text-2xl font-bold leading-tight tracking-tight text-foreground sm:text-[1.75rem]">
          {view.title}
        </h1>
        {view.title !== view.serviceName ? <p className="mt-1 text-sm text-muted-foreground">{view.serviceName}</p> : null}
      </header>

      <ClientProjectTabs
        basePath={basePath}
        active={tab}
        badges={{
          messages: tab === "messages" ? 0 : view.unreadMessages,
          payments: view.canPayDownpayment || (view.canPayBalance && view.status === "APPROVED") ? "dot" : undefined,
        }}
      />

      {tab === "progress" ? <ProgressTab view={view} preview={preview} /> : null}
      {tab === "documents" ? <ClientDocumentsTab view={view} basePath={basePath} preview={preview} /> : null}
      {tab === "payments" ? <PaymentsTab view={view} preview={preview} returnedFromPaystack={returnedFromPaystack} /> : null}
      {tab === "messages" ? <MessagesTab view={view} preview={preview} /> : null}
    </div>
  );
}

async function ProgressTab({ view, preview }: { view: ClientProjectView; preview: boolean }) {
  const updates = await listUpdates(view.id, { take: 40 });
  const { progress, countdown } = view;
  const tone = progress.tone;

  return (
    <div className="space-y-10">
      <section
        className={cn(
          "rounded-2xl p-5",
          tone === "attention" ? "bg-gold/10" : tone === "closed" ? "bg-danger/10" : tone === "done" ? "bg-success/10" : "bg-zone"
        )}
      >
        <p className="flex items-start gap-2 text-[15px] font-medium leading-snug text-foreground">
          {tone === "attention" ? <LuTriangleAlert className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden /> : null}
          {tone === "paused" ? <LuPause className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden /> : null}
          {tone === "done" ? <LuCircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> : null}
          {progress.headline}
        </p>
        {/* Nothing has started before the downpayment: no progress to show yet. */}
        {view.status !== "NEW" ? (
          <div className="mt-4 flex items-center gap-3">
            <div
              className="h-2 flex-1 overflow-hidden rounded-full bg-card"
              role="progressbar"
              aria-valuenow={progress.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Project progress"
            >
              <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${progress.percent}%` }} />
            </div>
            <span className="font-mono text-sm tabular-nums text-foreground">{progress.percent}%</span>
          </div>
        ) : null}
        {view.canPayDownpayment && !preview ? (
          <div className="mt-4">
            <ClientPayButton projectCode={view.code} leg="downpayment" label={`Pay ${formatNaira(view.downpaymentAmount)} to start`} />
          </div>
        ) : null}
      </section>

      {countdown.label ? (
        <section className="flex items-start gap-3">
          <LuCalendarClock className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          <div>
            <p className="meta-label">Expected delivery</p>
            {countdown.date ? <p className="mt-0.5 font-mono text-lg text-foreground">{formatDate(countdown.date)}</p> : null}
            <p
              className={cn(
                "mt-0.5 text-sm",
                countdown.tone === "danger"
                  ? "text-danger"
                  : countdown.tone === "gold"
                    ? "text-gold"
                    : countdown.tone === "success"
                      ? "text-success"
                      : "text-muted-foreground"
              )}
            >
              {countdown.label}
            </p>
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="mb-4 text-base font-semibold text-foreground">Steps</h2>
        <StatusStepper steps={progress.steps} />
      </section>

      <section>
        <h2 className="mb-4 text-base font-semibold text-foreground">Updates</h2>
        <ClientActivityFeed updates={updates} />
      </section>
    </div>
  );
}

async function PaymentsTab({
  view,
  preview,
  returnedFromPaystack,
}: {
  view: ClientProjectView;
  preview: boolean;
  returnedFromPaystack: boolean;
}) {
  const payments = await getClientPayments(view.id);
  const pending = payments.some((p) => p.status === "Pending");
  return (
    <div className="space-y-6">
      {returnedFromPaystack ? (
        pending ? (
          <p className="flex items-start gap-2 rounded-2xl bg-gold/10 p-4 text-sm text-foreground">
            <LuHourglass className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden />
            Thank you. We&apos;re confirming your payment with Paystack; refresh in a minute if it still shows as being
            confirmed.
          </p>
        ) : (
          <p className="flex items-start gap-2 rounded-2xl bg-success/10 p-4 text-sm text-foreground">
            <LuCircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
            Thank you. Your payment is confirmed and your receipt is below.
          </p>
        )
      ) : null}
      <ClientPaymentsPanel project={view} payments={payments} preview={preview} />
    </div>
  );
}

async function MessagesTab({ view, preview }: { view: ClientProjectView; preview: boolean }) {
  // The client opening this tab reads EduCraft's messages; an admin preview must not.
  const messages = await getThread(view.id, "CLIENT", { markRead: !preview });
  return (
    <section className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Questions about your project? Write to the EduCraft team here, and attach files if you need to. We&apos;ll reply
        on this page and let you know.
      </p>
      <MessageThread
        endpoint={`/api/client/projects/${encodeURIComponent(view.code)}/messages`}
        viewer="CLIENT"
        initial={messages}
        otherName="EduCraft"
        emptyHint="No messages yet."
        readOnly={preview}
        uploadEndpoint={`/api/client/projects/${encodeURIComponent(view.code)}/upload`}
        filesBase={`/api/client/projects/${encodeURIComponent(view.code)}/files`}
      />
    </section>
  );
}
