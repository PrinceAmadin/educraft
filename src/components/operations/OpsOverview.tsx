import Link from "next/link";
import { LuCircle, LuCircleCheck, LuCircleDot, LuFlag, LuMessageCircle, LuShieldAlert } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/projects/StatusBadge";
import { DaysInStatus } from "@/components/operations/DaysInStatus";
import { PIPELINE_STAGES, statusAge, type ExpectedHours } from "@/lib/operations/pipeline-stages";
import { CLOSED_STATUSES } from "@/lib/status";
import { COMMISSION_RATES } from "@/lib/finance/commission-config";
import { MAX_CORRECTION_ROUNDS } from "@/lib/operations/corrections";
import { toWaNumber, waLink, greetingName } from "@/lib/whatsapp";
import { cn, deadlineInfo, formatDate, formatDateTime, formatNaira } from "@/lib/utils";
import type { ProjectDetail } from "@/lib/services/projects";
import type { ProjectOps } from "@/lib/services/operations/project-ops";

const DEADLINE_TEXT = {
  none: "text-muted-foreground",
  ok: "text-muted-foreground",
  soon: "text-gold",
  urgent: "text-gold",
  critical: "text-danger",
  overdue: "text-danger font-semibold",
} as const;

function tierLabel(tier: string): string {
  return tier.charAt(0) + tier.slice(1).toLowerCase();
}

function paymentLine(status: string, amount: number, date: Date | null): { text: string; tone: string } {
  if (status === "Verified") return { text: `${formatNaira(amount)} · confirmed${date ? ` ${formatDate(date)}` : ""}`, tone: "text-success" };
  if (status === "Paid") return { text: `${formatNaira(amount)} · marked paid, awaiting finance`, tone: "text-gold" };
  return { text: `${formatNaira(amount)} · pending`, tone: "text-muted-foreground" };
}

/**
 * Everything about a project on one screen, in three columns: the project
 * (left), where it is in the pipeline and who has it (middle), and the
 * COO's actions with the notes and timeline (right). Stacks on phones.
 */
export function OpsOverview({
  project,
  ops,
  expected,
  actions,
  timeline,
  now = new Date(),
}: {
  project: ProjectDetail;
  ops: ProjectOps;
  expected: ExpectedHours;
  actions: React.ReactNode;
  timeline: React.ReactNode;
  now?: Date;
}) {
  const client = project.client;
  const deadline = project.internalDeadline ?? project.clientDeadline;
  const dl = deadlineInfo(deadline, now);
  const since = project.statusLog.length ? project.statusLog[project.statusLog.length - 1].createdAt : project.createdAt;
  const age = statusAge(since, project.status, expected, now);
  const wa = toWaNumber(client.phone);
  const down = paymentLine(project.downpaymentStatus, project.downpaymentAmount, project.downpaymentDate);
  const bal = paymentLine(project.balanceStatus, project.balanceAmount, project.balanceDate);
  const closed = (CLOSED_STATUSES as readonly string[]).includes(project.status);
  const currentStageIndex = PIPELINE_STAGES.findIndex((s) => s.statuses.includes(project.status));
  const hogCommission = project.ambassadorId && !project.isProBono ? Math.round(project.price * COMMISSION_RATES.hog) : null;
  const rounds = ops.rounds;
  const latestRound = rounds[rounds.length - 1];

  return (
    <section aria-label="Operations overview" className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-10">
      {/* Left — project info */}
      <div className="space-y-5">
        <h2 className="text-[15px] font-semibold text-foreground">Project info</h2>
        <dl className="space-y-3 text-sm">
          <Row label="Client">
            {client.fullName}
            {wa ? (
              <a href={waLink(wa, `Hi ${greetingName(client.fullName)}, this is EduCraft about your project ${project.projectId}.`)} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex items-center gap-1 text-[13px] text-primary underline-offset-4 hover:underline">
                <LuMessageCircle className="size-3.5" aria-hidden />
                Open WhatsApp
              </a>
            ) : null}
          </Row>
          <Row label="University">{client.university?.name ?? "—"}</Row>
          <Row label="Department">{client.department || "—"}</Row>
          <Row label="Topic">{project.projectTitle ?? "—"}</Row>
          {project.supervisorName ? <Row label="Supervisor">{project.supervisorName}{project.supervisorHighRisk ? <span className="ml-2 rounded-full bg-danger/10 px-2 py-0.5 text-[11px] font-medium text-danger">High risk — Tier 3 check</span> : null}</Row> : null}
          <Row label="Service">
            {project.service.serviceName}
            {project.chapterCount ? ` (${project.chapterCount} chapters)` : ""}
          </Row>
          <Row label="Pricing">
            <span className="font-mono tabular-nums">{project.isProBono ? "Pro bono" : formatNaira(project.price)}</span>
          </Row>
          {!project.isProBono ? (
            <>
              <Row label="Downpayment">
                <span className={down.tone}>{down.text}</span>
              </Row>
              <Row label="Balance">
                <span className={bal.tone}>{bal.text}</span>
              </Row>
            </>
          ) : null}
          {project.specialInstructions ? (
            <Row label="Special instructions">
              <span className="whitespace-pre-wrap">{project.specialInstructions}</span>
            </Row>
          ) : null}
          <Row label="Ambassador">
            {project.ambassador ? (
              <>
                {project.ambassador.fullName} ({tierLabel(project.ambassador.tier)}) · <span className="font-mono text-[13px]">{project.ambassador.ambassadorId}</span>
                <span className="block text-[13px] text-muted-foreground">
                  Ambassador commission: {project.ambassadorCommission != null ? `${formatNaira(project.ambassadorCommission)} (${project.ambassadorCommRate ?? "—"}%)` : "—"}
                  {hogCommission != null ? ` · HOG commission: ${formatNaira(hogCommission)} (${COMMISSION_RATES.hog * 100}%)` : ""}
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">Direct — no ambassador on this job</span>
            )}
          </Row>
          <Row label="Parent project">
            {ops.parent ? (
              <Link href={`/admin/projects/${ops.parent.projectId}`} className="font-mono text-primary hover:underline">
                {ops.parent.projectId}
              </Link>
            ) : (
              <span className="text-muted-foreground">None</span>
            )}
          </Row>
          <Row label="Child projects">
            {ops.children.length ? (
              <span className="flex flex-wrap gap-2">
                {ops.children.map((c) => (
                  <Link key={c.id} href={`/admin/projects/${c.projectId}`} className="font-mono text-primary hover:underline">
                    {c.projectId}
                  </Link>
                ))}
              </span>
            ) : (
              <span className="text-muted-foreground">None</span>
            )}
          </Row>
          <Row label="Created">{formatDate(project.createdAt)}</Row>
          <Row label="Internal deadline">
            {deadline ? (
              <>
                {formatDate(deadline)} <span className={cn("text-[13px]", DEADLINE_TEXT[dl.urgency])}>{dl.urgency === "overdue" ? `OVERDUE (${dl.label.toLowerCase()})` : dl.label}</span>
              </>
            ) : (
              <span className="text-muted-foreground">Not set</span>
            )}
          </Row>
          {project.atRisk ? (
            <Row label="At risk">
              <span className="inline-flex items-center gap-1 text-danger">
                <LuFlag className="size-3.5" aria-hidden />
                Flagged {formatDate(project.atRiskAt)}
                {project.atRiskNote ? ` — ${project.atRiskNote}` : ""}
              </span>
            </Row>
          ) : null}
          {project.seniorReviewRequestedAt ? (
            <Row label="Senior review">
              <span className="inline-flex items-center gap-1 text-gold">
                <LuShieldAlert className="size-3.5" aria-hidden />
                Requested {formatDate(project.seniorReviewRequestedAt)}
                {project.seniorReviewNote ? ` — ${project.seniorReviewNote}` : ""}
              </span>
            </Row>
          ) : null}
        </dl>
      </div>

      {/* Middle — pipeline status */}
      <div className="space-y-6">
        <div>
          <h2 className="text-[15px] font-semibold text-foreground">Pipeline status</h2>
          <ol className="mt-3 space-y-2">
            {PIPELINE_STAGES.map((stage, i) => {
              const reached = project.statusLog.find((l) => stage.statuses.includes(l.toStatus));
              const current = i === currentStageIndex;
              // Corrections come after delivery and loop back to it, so once reached they read as done.
              const done = closed || (currentStageIndex >= 0 ? i < currentStageIndex : Boolean(reached)) || (!current && stage.key === "corrections" && Boolean(reached));
              const Icon = current ? LuCircleDot : done ? LuCircleCheck : LuCircle;
              return (
                <li key={stage.key} className={cn("flex items-start gap-2.5 text-sm", !done && !current && "text-subtle")}>
                  <Icon className={cn("mt-0.5 size-4 shrink-0", current ? (age.tone === "red" || dl.urgency === "overdue" ? "text-danger" : age.tone === "amber" ? "text-gold" : "text-primary") : done ? "text-success" : "text-border")} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className={cn("font-medium", current ? "text-foreground" : done ? "text-foreground" : "text-subtle")}>{stage.label}</span>
                    {current ? (
                      <span className="ml-2 text-[13px] text-muted-foreground">
                        <StatusBadge status={project.status} short /> <DaysInStatus age={age} className="ml-1" /> in status
                        {dl.urgency === "overdue" ? <span className="ml-1 font-semibold text-danger">· overdue</span> : null}
                      </span>
                    ) : reached ? (
                      <span className="ml-2 text-[13px] text-muted-foreground">
                        {formatDate(reached.createdAt)}
                        {reached.changedBy ? ` · ${reached.changedBy.displayName ?? reached.changedBy.email}` : ""}
                      </span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        <div>
          <h3 className="meta-label">Assigned worker</h3>
          {project.worker && ops.worker ? (
            <div className="mt-2 space-y-1 text-sm">
              <Link href={`/admin/workers/${project.worker.id}`} className="font-medium text-foreground hover:text-primary">
                {project.worker.fullName}
              </Link>
              <p className="text-[13px] text-muted-foreground">
                Current load: {ops.worker.activeProjects}/{ops.worker.maxConcurrentProjects} projects
                {ops.worker.daysOnProject != null ? ` · this project: ${ops.worker.daysOnProject} days${dl.urgency === "overdue" ? " (overdue)" : ""}` : ""}
                {!project.workerAccepted && project.status === "ASSIGNED" ? " · not accepted yet" : ""}
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                {toWaNumber(ops.worker.phone) ? (
                  <Button asChild size="sm" variant="outline">
                    <a href={waLink(toWaNumber(ops.worker.phone) as string, `Hi ${greetingName(project.worker.fullName)}, about ${project.projectId}:`)} target="_blank" rel="noopener noreferrer">
                      Message
                    </a>
                  </Button>
                ) : null}
                <Button asChild size="sm" variant="outline">
                  <Link href={`/admin/projects/${project.projectId}/assign`}>Reassign</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/admin/workers/${project.worker.id}?flag=1`}>Flag worker</Link>
                </Button>
              </div>
            </div>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">Unassigned{project.status === "REQUIREMENTS_CONFIRMED" ? " — ready to assign" : ""}</p>
          )}
        </div>

        <div>
          <h3 className="meta-label">Quality gate history</h3>
          {ops.qaReview && (ops.qaReview.formattingScore != null || ops.qaReview.structuralPass != null || ops.qaReview.referenceVerPass != null || ops.qaReview.voiceCheckPass != null) ? (
            <ul className="mt-1 space-y-0.5 text-[13px]">
              <Gate label="Formatting check (Layer 3)" value={ops.qaReview.formattingScore != null ? `${ops.qaReview.formattingScore}%` : null} />
              <Gate label="Structural check (Layer 1)" value={ops.qaReview.structuralPass == null ? null : ops.qaReview.structuralPass ? "Pass" : "Fail"} />
              <Gate label="Reference verification (Tier 2)" value={ops.qaReview.referenceVerPass == null ? null : ops.qaReview.referenceVerPass ? "Pass" : "Fail"} />
              <Gate label="Voice check (Layer 2a)" value={ops.qaReview.voiceCheckPass == null ? null : ops.qaReview.voiceCheckPass ? "Pass" : "Fail"} />
            </ul>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">{["SUBMITTED", "IN_QA_REVIEW", "APPROVED", "BALANCE_VERIFIED", "DELIVERED", "COMPLETED"].includes(project.status) ? "Automated gates not run on this project" : "Empty — not yet submitted"}</p>
          )}
        </div>

        <div>
          <h3 className="meta-label">QA reviewer</h3>
          {ops.qaReview?.reviewerName ? (
            <p className="mt-1 text-sm text-foreground">
              {ops.qaReview.reviewerName}
              <span className="text-[13px] text-muted-foreground">
                {" "}
                · {ops.qaReview.reviewerType === "WORKER" ? "junior reviewer" : ops.qaReview.reviewerType ?? "executive"}
                {ops.qaReview.decision ? ` · ${ops.qaReview.decision.replace(/_/g, " ").toLowerCase()}` : ops.qaReview.startedAt ? " · reviewing" : " · assigned"}
                {ops.qaReview.round > 1 ? ` · round ${ops.qaReview.round}` : ""}
                {ops.qaReview.completedAt ? ` · ${formatDateTime(ops.qaReview.completedAt)}` : ""}
                {` · ${ops.qaReview.checksDone}/16 delivery checks`}
              </span>
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              Not yet assigned
              {project.status === "SUBMITTED" || project.status === "IN_QA_REVIEW" ? (
                <>
                  {" · "}
                  <Link href={`/admin/qa/${project.projectId}`} className="text-primary hover:underline">
                    open the review
                  </Link>
                </>
              ) : null}
            </p>
          )}
        </div>

        <div>
          <h3 className="meta-label">Supervisor corrections</h3>
          {rounds.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">{project.supervisorCorrectionCount > 0 ? `${project.supervisorCorrectionCount} earlier round${project.supervisorCorrectionCount === 1 ? "" : "s"} (before round tracking)` : "None yet"}</p>
          ) : (
            <p className="mt-1 text-sm text-foreground">
              Round {latestRound.roundNumber} of {MAX_CORRECTION_ROUNDS}{" "}
              <span className="text-[13px] text-muted-foreground">
                · {latestRound.status === "IN_PROGRESS" ? "in progress" : latestRound.status === "COMPLETED" ? `completed ${formatDate(latestRound.completedAt)}` : "escalated"}
              </span>
            </p>
          )}
        </div>
      </div>

      {/* Right — COO actions, notes and timeline */}
      <div className="space-y-8">
        {actions}
        {timeline}
      </div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-3">
      <dt className="meta-label pt-0.5">{label}</dt>
      <dd className="min-w-0 break-words text-foreground">{children}</dd>
    </div>
  );
}

function Gate({ label, value }: { label: string; value: string | null }) {
  const ok = value != null && value !== "Fail";
  return (
    <li className="flex items-center gap-2">
      <span className={cn("size-1.5 rounded-full", value == null ? "bg-border" : ok ? "bg-success" : "bg-danger")} aria-hidden />
      <span className="text-foreground">{label}:</span>
      <span className={cn(value == null ? "text-muted-foreground" : ok ? "text-success" : "text-danger")}>{value ?? "not run"}</span>
    </li>
  );
}
