import { z } from "zod";
import { ProjectStatus } from "@prisma/client";
import { STAGE_KEYS } from "@/lib/operations/pipeline-stages";
import { DELIVERY_CHECKLIST } from "@/lib/operations/qa-delivery-checklist";

/** Request bodies for the Phase 4 operations routes. */

const statusValues = Object.values(ProjectStatus) as [ProjectStatus, ...ProjectStatus[]];
const stageValues = STAGE_KEYS as unknown as [string, ...string[]];
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const note = (max: number) => z.string().trim().max(max);

// ── Project pipeline ────────────────────────────────────────

export const projectStatusBodySchema = z.object({
  to: z.enum(statusValues),
  note: note(1000).optional(),
});

export const projectListQuerySchema = z.object({
  status: z.enum(statusValues).optional().catch(undefined),
  stage: z.enum(stageValues).optional().catch(undefined),
  workerId: z.string().trim().min(1).max(60).optional().catch(undefined),
  dept: z.string().trim().min(1).max(120).optional().catch(undefined),
  deadline: z.enum(["overdue", "week", "at-risk"]).optional().catch(undefined),
  flag: z.enum(["at-risk", "overdue", "revision-escalated", "flagged"]).optional().catch(undefined),
  q: z.string().trim().min(1).max(120).optional().catch(undefined),
  page: z.coerce.number().int().positive().optional().catch(undefined),
});

export const internalDeadlineBodySchema = z.object({
  /** YYYY-MM-DD, or null to clear the internal deadline. */
  date: isoDate.nullable(),
  note: note(500).optional(),
});

export const projectNoteBodySchema = z.object({
  content: z.string().trim().min(1, "Write a note first").max(4000),
});

export const atRiskBodySchema = z.object({
  atRisk: z.boolean(),
  note: note(500).optional(),
});

export const seniorReviewBodySchema = z.object({
  note: z.string().trim().min(3, "Say what needs a senior look").max(1000),
});

export const requestClientUpdateBodySchema = z.object({
  message: z.string().trim().min(3, "Write the message").max(2000),
});

export const parentProjectBodySchema = z.object({
  /** An EC-XXXXX code, or null to unlink. */
  parentCode: z.string().trim().min(3).max(20).nullable(),
});

export const correctionEscalateBodySchema = z.object({
  note: z.string().trim().min(3, "Say why this is out of scope").max(1000),
});

export const correctionRoundBodySchema = z.object({
  deadline: isoDate.optional(),
});

// ── Workers ─────────────────────────────────────────────────

export const workerDirectoryQuerySchema = z.object({
  dept: z.string().trim().min(1).max(120).optional().catch(undefined),
  status: z.enum(["Active", "Busy", "Inactive", "On Break", "Suspended", "Terminated"]).optional().catch(undefined),
  q: z.string().trim().min(1).max(120).optional().catch(undefined),
  page: z.coerce.number().int().positive().optional().catch(undefined),
});

export const workerSuspendBodySchema = z.object({
  reason: note(1000).optional(),
});

export const workerFlagBodySchema = z.object({
  kind: z.enum(["REVIEW", "TIER2_REFERENCE", "QUALITY", "CONDUCT"]).default("REVIEW"),
  reason: z.string().trim().min(3, "Say why").max(1000),
  projectCode: z.string().trim().max(20).optional().or(z.literal("")),
});

export const workerFlagResolveBodySchema = z.object({
  note: note(1000).optional(),
});

export const workerNoteBodySchema = z.object({
  content: z.string().trim().min(1, "Write a note first").max(4000),
});

export const workerMaxLoadBodySchema = z.object({
  maxConcurrentProjects: z.coerce.number().int().min(1).max(20),
});

export const workerQaReviewerBodySchema = z.object({
  isQaReviewer: z.boolean(),
});

// ── QA queue ────────────────────────────────────────────────

export const qaQueueQuerySchema = z.object({
  status: z.enum(["all", "unassigned", "assigned", "reviewing", "overdue"]).optional().catch(undefined),
});

export const qaAssignBodySchema = z.object({
  /** A QA-reviewer worker's id, or "self" for the signed-in executive. */
  reviewerId: z.string().trim().min(1).max(60),
});

const deliveryIds = DELIVERY_CHECKLIST.map((i) => i.id) as [string, ...string[]];

export const deliveryChecklistSchema = z.record(z.enum(deliveryIds), z.boolean());

/** Either checklist can be saved on its own; both are per-item boolean maps. */
export const qaChecklistSaveSchema = z
  .object({
    checklist: z.record(z.string().max(60), z.boolean()).optional(),
    delivery: deliveryChecklistSchema.optional(),
  })
  .refine((v) => v.checklist != null || v.delivery != null, { message: "Nothing to save" });

export const qaDecisionSchema = z
  .object({
    decision: z.enum(["approve", "revision", "minor_fixes", "escalate", "pass"]),
    notes: note(5000).optional().or(z.literal("")),
    score: z.coerce.number().int().min(0).max(100).optional(),
    checklist: z.record(z.string().max(60), z.boolean()).optional(),
    delivery: deliveryChecklistSchema.optional(),
  })
  .superRefine((v, ctx) => {
    if ((v.decision === "revision" || v.decision === "escalate") && !v.notes?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["notes"],
        message: v.decision === "revision" ? "Add feedback so the worker knows what to fix" : "Explain why this is being escalated",
      });
    }
    if (v.decision === "minor_fixes" && !v.notes?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["notes"], message: "Say what you fixed" });
    }
  });
export type QaDecisionBody = z.infer<typeof qaDecisionSchema>;

// ── Research approvals ──────────────────────────────────────

export const researchRequestsQuerySchema = z.object({
  status: z.string().trim().max(80).optional().catch(undefined),
});

export const researchDenyBodySchema = z.object({
  reason: z.string().trim().min(3, "Say why you are declining").max(500),
});

// ── Reports ─────────────────────────────────────────────────

export const operationsReportQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/).optional().catch(undefined),
});

// ── Settings: expected time per status ──────────────────────

export const expectedHoursBodySchema = z.object({
  hours: z.record(z.enum(statusValues), z.coerce.number().positive().max(24 * 90).nullable()),
});

// ── Notifications ───────────────────────────────────────────

export const notificationsReadBodySchema = z.object({
  /** One id, or omit to mark everything read. */
  id: z.string().trim().min(1).max(60).optional(),
});
