import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { waitUntil } from "@vercel/functions";
import { db } from "@/lib/db";
import { sendMail } from "@/lib/mailer";
import { siteUrl } from "@/lib/site-url";
import { getHqContact } from "@/lib/services/hq-contact";
import { finalInviteEmail } from "@/lib/emails/screening";
import { applicationRejectedEmail } from "@/lib/emails/application-decision";
import { approveWorkerApplication } from "@/lib/services/worker-applications";
import { ScreeningError } from "@/lib/services/screening";
import { extractDataText } from "@/lib/files/extract-text";
import { FINAL_DEFAULTS, FINAL_SETTING_KEYS, FINAL_TEXT, scanChapterVoice, type ChapterVoice } from "@/lib/screening/final-practical";

/**
 * The Stage-3 final practical: the COO sends it to a candidate who passed
 * screening, the candidate takes it at a tokened page (no login), and the COO
 * reads the work and approves or declines. Writing samples are voice-scanned as
 * an advisory signal; the decision is the COO's. A pass runs the existing
 * worker approval unchanged.
 */

const TOKEN_RE = /^[a-f0-9]{32}$/;
export function isFinalToken(value: string): boolean {
  return TOKEN_RE.test(value);
}

// ── Settings (the four briefs + the clock) ────────────────────────────────────

export interface FinalSettings {
  minutes: number;
  writingBrief1: string;
  writingBrief2: string;
  memoBrief: string;
  promptBrief: string;
}

export async function getFinalSettings(): Promise<FinalSettings> {
  const rows = await db.setting.findMany({ where: { key: { in: Object.values(FINAL_SETTING_KEYS) } } });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const str = (key: string, fallback: string) => {
    const v = byKey.get(key);
    return typeof v === "string" && v.trim() ? v : fallback;
  };
  const minutesRaw = Number(byKey.get(FINAL_SETTING_KEYS.minutes));
  return {
    minutes: Number.isFinite(minutesRaw) && minutesRaw >= 10 && minutesRaw <= 480 ? Math.round(minutesRaw) : FINAL_DEFAULTS.minutes,
    writingBrief1: str(FINAL_SETTING_KEYS.writingBrief1, FINAL_DEFAULTS.writingBrief1),
    writingBrief2: str(FINAL_SETTING_KEYS.writingBrief2, FINAL_DEFAULTS.writingBrief2),
    memoBrief: str(FINAL_SETTING_KEYS.memoBrief, FINAL_DEFAULTS.memoBrief),
    promptBrief: str(FINAL_SETTING_KEYS.promptBrief, FINAL_DEFAULTS.promptBrief),
  };
}

export async function updateFinalSettings(input: Partial<FinalSettings>): Promise<void> {
  const writes: { key: string; value: string }[] = [];
  if (input.minutes !== undefined) writes.push({ key: FINAL_SETTING_KEYS.minutes, value: String(Math.round(input.minutes)) });
  if (input.writingBrief1 !== undefined) writes.push({ key: FINAL_SETTING_KEYS.writingBrief1, value: input.writingBrief1 });
  if (input.writingBrief2 !== undefined) writes.push({ key: FINAL_SETTING_KEYS.writingBrief2, value: input.writingBrief2 });
  if (input.memoBrief !== undefined) writes.push({ key: FINAL_SETTING_KEYS.memoBrief, value: input.memoBrief });
  if (input.promptBrief !== undefined) writes.push({ key: FINAL_SETTING_KEYS.promptBrief, value: input.promptBrief });
  await db.$transaction(writes.map((w) => db.setting.upsert({ where: { key: w.key }, create: w, update: { value: w.value } })));
}

// ── Sending (COO/founder) ─────────────────────────────────────────────────────

export async function sendFinalAssessment(applicationId: string, actorId: string): Promise<{ token: string; url: string }> {
  const application = await db.workerApplication.findUnique({
    where: { id: applicationId },
    select: { id: true, status: true, fullName: true, email: true, finalAssessment: { select: { id: true } } },
  });
  if (!application) throw new ScreeningError("No such application", 404);
  if (application.status !== "PENDING") throw new ScreeningError("Only a pending application can be sent the final assessment", 409);
  if (application.finalAssessment) throw new ScreeningError("A final assessment has already been sent", 409);

  const token = crypto.randomBytes(16).toString("hex");
  await db.$transaction([
    db.finalAssessment.create({ data: { applicationId: application.id, token, status: "SENT", sentById: actorId } }),
    db.workerApplication.update({ where: { id: application.id }, data: { screeningStage: "FINAL_TEST" } }),
  ]);

  const url = `${siteUrl()}/final/${token}`;
  const hq = await getHqContact();
  waitUntil(
    sendMail({ to: application.email, ...finalInviteEmail({ fullName: application.fullName, url, hq }) }).then((sent) => {
      if (!sent.ok) console.error("[final] invite email failed:", sent.error);
    })
  );
  return { token, url };
}

// ── The candidate's assessment (tokened, no login) ───────────────────────────

export interface FinalCandidateView {
  status: "SENT" | "IN_PROGRESS" | "SUBMITTED";
  minutes: number;
  deadlineAt: Date | null;
  briefs: { writing1: string; writing2: string; memo: string; prompt: string };
  uploaded: { chapter1: boolean; chapter2: boolean };
}

async function loadFinal(token: string) {
  if (!isFinalToken(token)) return null;
  return db.finalAssessment.findUnique({ where: { token } });
}

export async function getFinalForCandidate(token: string): Promise<FinalCandidateView | null> {
  const a = await loadFinal(token);
  if (!a) return null;
  const settings = await getFinalSettings();
  return {
    status: a.status as FinalCandidateView["status"],
    minutes: settings.minutes,
    deadlineAt: a.deadlineAt,
    briefs: { writing1: settings.writingBrief1, writing2: settings.writingBrief2, memo: settings.memoBrief, prompt: settings.promptBrief },
    uploaded: { chapter1: a.chapter1Text != null, chapter2: a.chapter2Text != null },
  };
}

export async function startFinalAssessment(token: string): Promise<{ deadlineAt: Date }> {
  const a = await loadFinal(token);
  if (!a) throw new ScreeningError("This link is not valid", 404);
  if (a.status === "SUBMITTED") throw new ScreeningError("You have already finished this assessment", 409);
  if (a.startedAt && a.deadlineAt) return { deadlineAt: a.deadlineAt };
  const settings = await getFinalSettings();
  const now = new Date();
  const deadlineAt = new Date(now.getTime() + settings.minutes * 60_000);
  await db.finalAssessment.updateMany({ where: { token, startedAt: null }, data: { status: "IN_PROGRESS", startedAt: now, deadlineAt } });
  const after = await db.finalAssessment.findUnique({ where: { token }, select: { deadlineAt: true } });
  return { deadlineAt: after?.deadlineAt ?? deadlineAt };
}

/** Extracts and stores the text of one uploaded writing sample (slot 1 or 2). The file itself is not kept. */
export async function uploadFinalChapter(token: string, slot: 1 | 2, fileName: string, bytes: Uint8Array): Promise<{ received: true }> {
  const a = await loadFinal(token);
  if (!a) throw new ScreeningError("This link is not valid", 404);
  if (a.status === "SUBMITTED") throw new ScreeningError("You have already finished this assessment", 409);
  if (!a.startedAt) throw new ScreeningError("Start the assessment before uploading", 409);

  const text = await extractDataText(fileName, bytes);
  if (!text || text.trim().length < 50) throw new ScreeningError("We could not read any text from that document", 400);

  await db.finalAssessment.updateMany({
    where: { token, status: { not: "SUBMITTED" } },
    data: slot === 1 ? { chapter1Text: text } : { chapter2Text: text },
  });
  return { received: true };
}

/** Records the two written answers, voice-scans the samples, and marks it submitted. */
export async function submitFinalAssessment(token: string, input: { memoResponse: string; promptResponse: string }): Promise<{ submitted: true }> {
  const a = await loadFinal(token);
  if (!a) throw new ScreeningError("This link is not valid", 404);
  if (a.status === "SUBMITTED") throw new ScreeningError("You have already finished this assessment", 409);
  if (!a.startedAt) throw new ScreeningError("Start the assessment before submitting", 409);

  const voiceFindings = { chapter1: scanChapterVoice(a.chapter1Text), chapter2: scanChapterVoice(a.chapter2Text) };
  const claimed = await db.finalAssessment.updateMany({
    where: { token, status: { not: "SUBMITTED" } },
    data: {
      status: "SUBMITTED",
      submittedAt: new Date(),
      memoResponse: input.memoResponse.trim() || null,
      promptResponse: input.promptResponse.trim() || null,
      voiceFindings: voiceFindings as unknown as Prisma.InputJsonValue,
    },
  });
  if (claimed.count === 0) throw new ScreeningError("You have already finished this assessment", 409);
  return { submitted: true };
}

// ── The COO's review ──────────────────────────────────────────────────────────

export interface FinalReviewDetail {
  assessmentId: string;
  applicationId: string;
  candidate: string;
  email: string;
  status: string;
  reviewDecision: string | null;
  submittedAt: Date | null;
  briefs: { writing1: string; writing2: string; memo: string; prompt: string };
  chapter1Text: string | null;
  chapter2Text: string | null;
  memoResponse: string | null;
  promptResponse: string | null;
  voice: { chapter1: ChapterVoice; chapter2: ChapterVoice };
}

export async function listFinalReview(): Promise<
  { assessmentId: string; applicationId: string; candidate: string; reviewDecision: string | null; submittedAt: Date | null }[]
> {
  const rows = await db.finalAssessment.findMany({
    where: { status: "SUBMITTED" },
    orderBy: [{ submittedAt: "desc" }],
    select: { id: true, applicationId: true, reviewDecision: true, submittedAt: true, application: { select: { fullName: true } } },
  });
  return rows.map((r) => ({ assessmentId: r.id, applicationId: r.applicationId, candidate: r.application.fullName, reviewDecision: r.reviewDecision, submittedAt: r.submittedAt }));
}

export async function getFinalReviewDetail(assessmentId: string): Promise<FinalReviewDetail | null> {
  const a = await db.finalAssessment.findUnique({
    where: { id: assessmentId },
    include: { application: { select: { id: true, fullName: true, email: true } } },
  });
  if (!a) return null;
  const settings = await getFinalSettings();
  // Re-scan from the stored text so the COO always sees a current read.
  const voice = { chapter1: scanChapterVoice(a.chapter1Text), chapter2: scanChapterVoice(a.chapter2Text) };
  return {
    assessmentId: a.id,
    applicationId: a.application.id,
    candidate: a.application.fullName,
    email: a.application.email,
    status: a.status,
    reviewDecision: a.reviewDecision,
    submittedAt: a.submittedAt,
    briefs: { writing1: settings.writingBrief1, writing2: settings.writingBrief2, memo: settings.memoBrief, prompt: settings.promptBrief },
    chapter1Text: a.chapter1Text,
    chapter2Text: a.chapter2Text,
    memoResponse: a.memoResponse,
    promptResponse: a.promptResponse,
    voice,
  };
}

/**
 * The COO's decision. PASS runs the existing worker approval (creates the
 * Worker, activates the login, sends the welcome); FAIL declines the
 * application with the usual polite email. Claimed so a double click cannot
 * approve twice.
 */
export async function decideFinalAssessment(assessmentId: string, decision: "PASS" | "FAIL", actorId: string, note?: string): Promise<void> {
  const a = await db.finalAssessment.findUnique({
    where: { id: assessmentId },
    select: { id: true, status: true, reviewDecision: true, applicationId: true, application: { select: { status: true, fullName: true, email: true } } },
  });
  if (!a) throw new ScreeningError("No such assessment", 404);
  if (a.status !== "SUBMITTED") throw new ScreeningError("This assessment has not been submitted yet", 409);

  // Claim the decision so two reviewers cannot both act.
  const claimed = await db.finalAssessment.updateMany({
    where: { id: assessmentId, reviewDecision: null },
    data: { reviewDecision: decision, reviewedById: actorId, reviewedAt: new Date(), reviewNote: note?.trim() || null },
  });
  if (claimed.count === 0) throw new ScreeningError("This assessment has already been decided", 409);

  await db.workerApplication.update({
    where: { id: a.applicationId },
    data: { screeningStage: decision === "PASS" ? "FINAL_PASSED" : "FINAL_FAILED" },
  });

  if (decision === "PASS") {
    if (a.application.status === "PENDING") await approveWorkerApplication(a.applicationId, actorId);
    return;
  }

  // FAIL: decline the application (if still pending) with the usual email.
  if (a.application.status === "PENDING") {
    await db.workerApplication.update({
      where: { id: a.applicationId },
      data: { status: "REJECTED", reviewedById: actorId, reviewedAt: new Date(), reviewNote: note?.trim() || "Did not pass the final assessment" },
    });
    const hq = await getHqContact();
    const mail = applicationRejectedEmail({ fullName: a.application.fullName, role: "worker", hq });
    waitUntil(sendMail({ to: a.application.email, ...mail }).then((sent) => { if (!sent.ok) console.error("[final] decline email failed:", sent.error); }));
  }
}

export interface FinalStatusLite {
  assessmentId: string;
  status: string;
  reviewDecision: string | null;
}

export async function finalStatusMap(applicationIds: string[]): Promise<Record<string, FinalStatusLite>> {
  if (applicationIds.length === 0) return {};
  const rows = await db.finalAssessment.findMany({
    where: { applicationId: { in: applicationIds } },
    select: { id: true, applicationId: true, status: true, reviewDecision: true },
  });
  return Object.fromEntries(rows.map((r) => [r.applicationId, { assessmentId: r.id, status: r.status, reviewDecision: r.reviewDecision }]));
}

export async function countFinalToReview(): Promise<number> {
  return db.finalAssessment.count({ where: { status: "SUBMITTED", reviewDecision: null } });
}

export { FINAL_TEXT };
