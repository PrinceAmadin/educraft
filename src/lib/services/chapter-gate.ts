/**
 * The chapter gate (30 Sept 2026, founder): every chapter passes the formatting
 * system and the quality gate as a chapter, before anyone downloads or approves it.
 *
 *   AI_TEXT  a chapter the AI wrote is checked before its draft goes to the
 *            specialist; a failing one is rewritten with its failures in the brief
 *            (the orchestrator decides, up to twice), then handed over with what is left.
 *   UPLOAD   a person's upload, read back, is checked before the COO may approve it;
 *            the checked Word file is kept as its formatted copy, which is what the
 *            client and the specialist download once the chapter is approved.
 *
 * The same checks as the report gate (src/lib/quality/evaluate.ts), on the chapter's
 * own Word file, with the whole-report checks left to the report gate. A check
 * belongs to one text (its hash), is run once, and runs through
 * /api/internal/chapter-check/run so it never takes a page or a tick with it.
 */

import crypto from "node:crypto";
import { Prisma, type ChapterCheck, type ChapterCheckSubject } from "@prisma/client";
import { db } from "@/lib/db";
import { chapterFileName, loadAssemblyInput, type AssemblyInput } from "@/lib/assembly/assemble";
import { AssemblyError } from "@/lib/assembly/errors";
import { lookupDepartment } from "@/lib/generation/department-map";
import { selfBaseUrl } from "@/lib/self-base-url";
import { deleteStoredFile, putPrivateFile } from "@/lib/files/storage";
import { matchCitations, type GateReference } from "@/lib/quality/citation-check";
import { aiResultsFrom, chapterAiTasks, CHAPTER_CHECK_STEPS, pool, QUALITY_SUBSYSTEM, type AiByChapter, type StoredSupportSet, type StoredVoice } from "@/lib/quality/chapter-ai";
import {
  chapterGateResult,
  chapterGateStep,
  CHECK_LEASE_MS,
  failureLines,
  MAX_CHECK_ERRORS,
  gateFactFrom,
  rewritePolicy,
  rewritesAllowed,
  REWRITES_SETTING,
  type ChapterGateStep,
} from "@/lib/quality/chapter-gate";
import { chapterTextHash, draftSourceHash } from "@/lib/quality/chapter-hash";
import { finishReport, noteStyleFor, prepareReport } from "@/lib/quality/evaluate";
import { knownCommonCitation } from "@/lib/quality/known-citations";
import type { QualityItem } from "@/lib/quality/types";
import { getApprovedBrief } from "@/lib/research/source-stage-actions";
import { getApprovedModeSettings } from "@/lib/services/research-mode";
import { loadChapterTexts, scopeImageKeys, versionChapterText } from "@/lib/services/chapter-texts";
import { ensureReadback } from "@/lib/services/chapter-readback";
import { generatedReportPath } from "@/lib/services/deliverables";
import { notifyOperations, notifyRole, notifyUsers } from "@/lib/services/notifications";
import { CHAPTER_REVIEW_TEXT } from "@/lib/chapter-review";

const TAG = "[chapter gate]";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const AI_CONCURRENCY = 2;

export type ChapterCheckRow = Pick<
  ChapterCheck,
  "id" | "projectId" | "chapterNumber" | "subject" | "versionId" | "textHash" | "status" | "lockedUntil" | "attempts" | "applicable" | "passedCount" | "rewritable" | "costNaira" | "error" | "settledAt" | "createdAt"
> & { failures: QualityItem[]; warnings: QualityItem[]; notes: string[] };

const ROW_SELECT = {
  id: true,
  projectId: true,
  chapterNumber: true,
  subject: true,
  versionId: true,
  textHash: true,
  status: true,
  lockedUntil: true,
  attempts: true,
  applicable: true,
  passedCount: true,
  rewritable: true,
  costNaira: true,
  error: true,
  settledAt: true,
  createdAt: true,
  failures: true,
  warnings: true,
  notes: true,
} satisfies Prisma.ChapterCheckSelect;

type RawRow = Prisma.ChapterCheckGetPayload<{ select: typeof ROW_SELECT }>;

const items = (json: Prisma.JsonValue | null): QualityItem[] => (Array.isArray(json) ? (json as unknown as QualityItem[]) : []);
const strings = (json: Prisma.JsonValue | null): string[] => (Array.isArray(json) ? (json as unknown[]).filter((x): x is string => typeof x === "string") : []);

export function toCheckRow(r: RawRow): ChapterCheckRow {
  return { ...r, failures: items(r.failures), warnings: items(r.warnings), notes: strings(r.notes) };
}

// ─── The text a check is about ───────────────────────────────────────────────

interface Subject {
  projectDbId: string;
  chapter: number;
  subject: ChapterCheckSubject;
  versionId: string | null;
  deliverableId: string | null;
  text: string;
  media: AssemblyInput["media"];
}

async function loadSubject(projectDbId: string, chapter: number, subject: ChapterCheckSubject, versionId?: string | null, opts: { write?: boolean } = {}): Promise<Subject | null> {
  if (subject === "AI_TEXT") {
    const cp = await db.generationCheckpoint.findUnique({
      where: { projectId_chapterNumber: { projectId: projectDbId, chapterNumber: chapter } },
      select: { status: true, fullOutput: true, outputHash: true },
    });
    if (cp?.status !== "COMPLETED" || !cp.fullOutput) return null;
    // A chapter written before the chapter gate has no hash yet: write it, so the orchestrator finds its check.
    if (opts.write !== false && cp.outputHash !== chapterTextHash(cp.fullOutput)) {
      await db.generationCheckpoint.updateMany({
        where: { projectId: projectDbId, chapterNumber: chapter, status: "COMPLETED", fullOutput: cp.fullOutput },
        data: { outputHash: chapterTextHash(cp.fullOutput) },
      });
    }
    return { projectDbId, chapter, subject, versionId: null, deliverableId: null, text: cp.fullOutput, media: new Map() };
  }
  if (!versionId) return null;
  const v = await db.deliverableVersion.findUnique({
    where: { id: versionId },
    select: {
      id: true,
      submittedByRole: true,
      deliverableId: true,
      deliverable: { select: { projectId: true, chapter: true, kind: true } },
      file: { select: { fileName: true, blobPathname: true, deletedAt: true } },
    },
  });
  if (!v || v.deliverable.projectId !== projectDbId || v.deliverable.kind !== "CHAPTER" || v.deliverable.chapter !== chapter) return null;
  if (v.submittedByRole === "SYSTEM" || v.file.deletedAt) return null;
  const read = await versionChapterText({ id: v.id, fileName: v.file.fileName, blobPathname: v.file.blobPathname });
  // A file the reader could not carry is never approved, so it is not checked either (the card says why).
  if (!read || read.blocking.length) return null;
  return { projectDbId, chapter, subject, versionId: v.id, deliverableId: v.deliverableId, text: read.text, media: read.media };
}

// ─── Taking a check ──────────────────────────────────────────────────────────

type Claim = { kind: "claimed"; id: string; lease: Date } | { kind: "settled"; row: ChapterCheckRow } | { kind: "running" };

async function claim(s: Subject, textHash: string, force: boolean): Promise<Claim> {
  const now = new Date();
  const lease = new Date(now.getTime() + CHECK_LEASE_MS);
  try {
    const row = await db.chapterCheck.create({
      data: { projectId: s.projectDbId, chapterNumber: s.chapter, subject: s.subject, versionId: s.versionId, textHash, status: "RUNNING", lockedUntil: lease },
      select: { id: true },
    });
    return { kind: "claimed", id: row.id, lease };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
  }
  const row = await db.chapterCheck.findUnique({
    where: { projectId_chapterNumber_subject_textHash: { projectId: s.projectDbId, chapterNumber: s.chapter, subject: s.subject, textHash } },
    select: ROW_SELECT,
  });
  if (!row) return { kind: "running" };
  const live = row.status === "RUNNING" && row.lockedUntil !== null && row.lockedUntil > now;
  if (live) return { kind: "running" };
  const settled = row.status === "PASSED" || row.status === "FAILED" || (row.status === "ERROR" && row.attempts >= MAX_CHECK_ERRORS);
  if (settled && !force) return { kind: "settled", row: toCheckRow(row) };
  const got = await db.chapterCheck.updateMany({
    where: { id: row.id, status: row.status, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
    data: { status: "RUNNING", lockedUntil: lease, versionId: s.versionId ?? row.versionId, ...(force ? { attempts: 0 } : {}) },
  });
  return got.count === 1 ? { kind: "claimed", id: row.id, lease } : { kind: "running" };
}

// ─── Running a check ─────────────────────────────────────────────────────────

class CheckRunError extends Error {
  constructor(
    message: string,
    readonly ai: { voice: StoredVoice | null; support: StoredSupportSet | null },
  ) {
    super(message);
  }
}

function planOf(json: Prisma.JsonValue | null | undefined): { targetWords: number; sections: { number: string; heading: string }[] } | null {
  const p = json as { targetWords?: number; sections?: { number: string; heading: string }[] } | null;
  return p && typeof p.targetWords === "number" && Array.isArray(p.sections) ? { targetWords: p.targetWords, sections: p.sections } : null;
}

/** The current text of these chapters (approved uploads where there are some), skipping any not written yet. */
async function canonicalChapters(projectDbId: string, numbers: number[]): Promise<{ number: number; text: string }[]> {
  if (!numbers.length) return [];
  try {
    return (await loadChapterTexts(projectDbId, numbers, "canonical")).chapters.map((c) => ({ number: c.number, text: c.text }));
  } catch (error) {
    const missing = error instanceof AssemblyError && Array.isArray(error.details?.missing) ? (error.details.missing as number[]) : null;
    if (!missing) return [];
    const rest = numbers.filter((n) => !missing.includes(n));
    return rest.length === numbers.length ? [] : canonicalChapters(projectDbId, rest);
  }
}

async function evaluateChapter(s: Subject, force: boolean, opts: { ai?: boolean } = {}) {
  const base = await loadAssemblyInput(s.projectDbId, { chapterText: { number: s.chapter, text: s.text, media: s.media } });
  const input: AssemblyInput = { ...base, includePrelims: false };
  const [settings, brief, refRows, checkpoint, project, known] = await Promise.all([
    getApprovedModeSettings(s.projectDbId).catch(() => null),
    getApprovedBrief(db, s.projectDbId).catch(() => null),
    db.reference.findMany({
      where: { projectId: s.projectDbId, status: "KEPT" },
      select: { id: true, title: true, proposedTitle: true, authors: true, year: true, journal: true, abstract: true, classification: true },
    }),
    db.generationCheckpoint.findUnique({ where: { projectId_chapterNumber: { projectId: s.projectDbId, chapterNumber: s.chapter } }, select: { plan: true } }),
    db.project.findUnique({ where: { id: s.projectDbId }, select: { projectId: true, departmentOutline: true } }),
    force ? Promise.resolve([]) : db.chapterCheck.findMany({ where: { projectId: s.projectDbId, NOT: { ai: { equals: Prisma.DbNull } } }, select: { ai: true } }),
  ]);
  const references: GateReference[] = refRows.map((r) => ({ ...r, classification: r.classification ?? null }));

  // What one other chapter gives: Chapter One's questions and hypotheses; the works the earlier chapters cite (Chapter Five).
  const chapterOneText = s.chapter === 1 ? null : ((await canonicalChapters(s.projectDbId, [1]))[0]?.text ?? null);
  let earlierCitedIds: string[] = [];
  if (s.chapter === 5) {
    const earlier = await canonicalChapters(s.projectDbId, [1, 2, 3, 4]);
    const m = matchCitations({ chapters: earlier, references, mode: input.mode, knownCommon: knownCommonCitation, primarySources: brief?.sources, noteStyle: noteStyleFor(input), placement: input.citationPlacement });
    earlierCitedIds = [...new Set(m.matched.flatMap((x) => x.refs.map((r) => r.id)))];
  }

  // The AI draft is stamped as the draft is (the file checked is the file the specialist gets); an upload with its text.
  const sourceHash = s.subject === "AI_TEXT" ? draftSourceHash(s.text) : chapterTextHash(s.text);
  const prepared = await prepareReport({ input, references, knownCommon: knownCommonCitation, primarySources: brief?.sources, chapter: { number: s.chapter, sourceHash } });

  const knownVoice = new Map<string, StoredVoice>();
  const knownSupport = new Map<string, StoredSupportSet>();
  for (const row of known) {
    const a = row.ai as { voice?: StoredVoice | null; support?: StoredSupportSet | null } | null;
    if (a?.voice?.hash) knownVoice.set(a.voice.hash, a.voice);
    if (a?.support?.hash) knownSupport.set(a.support.hash, a.support);
  }
  const out: AiByChapter = { voice: {}, support: {}, errors: [] };
  const code = project?.projectId ?? input.projectCode;
  if (opts.ai !== false) await pool(
    chapterAiTasks({
      projectDbId: s.projectDbId,
      projectCode: code,
      title: input.title,
      department: settings?.department ?? input.department,
      chapter: { number: s.chapter, text: s.text },
      paragraphs: prepared.paragraphs,
      scan: prepared.scan,
      match: prepared.match,
      reuseVoice: (hash) => knownVoice.get(hash) ?? null,
      reuseSupport: (hash) => knownSupport.get(hash) ?? null,
      out,
      usage: { subsystem: QUALITY_SUBSYSTEM, voiceStep: CHAPTER_CHECK_STEPS.voice, supportStep: CHAPTER_CHECK_STEPS.support },
    }),
    AI_CONCURRENCY,
  );
  const key = String(s.chapter);
  const ai = { voice: out.voice[key] ?? null, support: out.support[key] ?? null };
  // A chapter whose AI review did not run has not passed the quality gate: the check is tried again.
  if (out.errors.length) throw new CheckRunError(out.errors.join(" "), ai);

  const { checks, score } = finishReport(
    prepared,
    { ...aiResultsFrom(out, references), traceability: null, errors: [] },
    {
      aim: brief?.aim ?? null,
      objectives: brief?.objectives ?? [],
      pureScience: Boolean(lookupDepartment(settings?.department ?? input.department)?.pureScience),
      supervisorToc: Boolean(project?.departmentOutline?.trim()),
      plans: new Map([[s.chapter, planOf(checkpoint?.plan)]]),
      scope: { chapter: s.chapter, subject: s.subject, chapterOneText, earlierCitedIds },
    },
  );
  return { result: chapterGateResult(checks, score), ai, notes: prepared.report.notes, buffer: prepared.buffer, title: input.title, code };
}

async function saveWithRetry<T>(write: () => Promise<T>): Promise<T> {
  const waits = [1000, 3000, 6000];
  for (let attempt = 0; ; attempt++) {
    try {
      return await write();
    } catch (error) {
      if (attempt >= waits.length) throw error;
      console.warn(`${TAG} save failed, retrying`, (error as Error).message);
      await new Promise((r) => setTimeout(r, waits[attempt]));
    }
  }
}

async function costSince(projectDbId: string, chapter: number, since: Date): Promise<number> {
  const r = await db.aiUsageLog
    .aggregate({ where: { projectId: projectDbId, subsystem: QUALITY_SUBSYSTEM, step: { in: Object.values(CHAPTER_CHECK_STEPS) }, chapterNumber: chapter, createdAt: { gte: since } }, _sum: { costNaira: true } })
    .catch(() => null);
  return Math.round((r?._sum.costNaira ?? 0) * 100) / 100;
}

async function execute(s: Subject, textHash: string, c: { id: string; lease: Date }, force: boolean): Promise<ChapterCheckRow | null> {
  const started = new Date();
  let evaluated: Awaited<ReturnType<typeof evaluateChapter>> | null = null;
  try {
    evaluated = await evaluateChapter(s, force);
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
    console.warn(`${TAG} ${s.projectDbId} ch${s.chapter} ${s.subject}: the check did not run`, message);
    const ai = error instanceof CheckRunError ? error.ai : null;
    await saveWithRetry(() =>
      db.chapterCheck.updateMany({
        where: { id: c.id, lockedUntil: c.lease },
        data: { status: "ERROR", lockedUntil: null, attempts: { increment: 1 }, error: message, settledAt: new Date(), ...(ai ? { ai: ai as unknown as Prisma.InputJsonValue } : {}) },
      }),
    ).catch(() => undefined);
    return readCheck(c.id);
  }
  const { result } = evaluated;
  const cost = await costSince(s.projectDbId, s.chapter, started);
  const saved = await saveWithRetry(() =>
    db.chapterCheck.updateMany({
      where: { id: c.id, lockedUntil: c.lease },
      data: {
        status: result.passed ? "PASSED" : "FAILED",
        lockedUntil: null,
        applicable: result.applicable,
        passedCount: result.passedCount,
        failures: result.failures as unknown as Prisma.InputJsonValue,
        warnings: result.warnings as unknown as Prisma.InputJsonValue,
        rewritable: result.rewritable,
        notes: evaluated.notes as unknown as Prisma.InputJsonValue,
        ai: evaluated.ai as unknown as Prisma.InputJsonValue,
        costNaira: cost,
        error: null,
        settledAt: new Date(),
      },
    }),
  );
  // Another run took the check over (this one outlived its lease): its result is the one kept.
  if (saved.count === 0) return readCheck(c.id);
  if (s.subject === "UPLOAD" && s.versionId && s.deliverableId) {
    await storeFormattedCopy(s, evaluated.buffer, evaluated.title, evaluated.code).catch((error) =>
      console.warn(`${TAG} ${evaluated?.code} ch${s.chapter}: the formatted copy was not stored`, error instanceof Error ? error.message : error),
    );
  }
  if (result.builderFailures.length) {
    // Our Word builder broke a rule: never the specialist's or the AI's fault, never a reason to rewrite.
    await notifyRole("SUPER_ADMIN", {
      title: `Chapter check: the Word file failed ${result.builderFailures.join(", ")}`,
      message: `${evaluated.code} Chapter ${s.chapter}: the chapter's Word file broke formatting rule${result.builderFailures.length === 1 ? "" : "s"} ${result.builderFailures.join(", ")}, which our builder sets. This is a system defect to fix.`,
      type: "warning",
      link: `/admin/projects/${evaluated.code}?tab=documents`,
    }).catch(() => undefined);
  }
  return readCheck(c.id);
}

/** The upload's checked Word file, kept as its formatted copy (what is downloaded once it is approved). */
async function storeFormattedCopy(s: Subject, buffer: Uint8Array, title: string, code: string): Promise<void> {
  const version = await db.deliverableVersion.findUnique({ where: { id: s.versionId! }, select: { formattedFile: { select: { id: true, blobPathname: true } } } });
  const pathname = generatedReportPath(s.projectDbId, s.deliverableId!);
  const { url } = await putPrivateFile(pathname, buffer, DOCX);
  const file = await db.projectFile.create({
    data: {
      projectId: s.projectDbId,
      fileName: chapterFileName(title, code, s.chapter),
      fileUrl: url,
      fileSize: buffer.byteLength,
      fileType: DOCX,
      category: "formatted_copy",
      uploadedBy: null,
      uploaderRole: "SYSTEM",
      storage: "PRIVATE_BLOB",
      blobPathname: pathname,
      deliverableId: s.deliverableId,
    },
    select: { id: true },
  });
  await db.deliverableVersion.update({ where: { id: s.versionId! }, data: { formattedFileId: file.id } });
  const old = version?.formattedFile;
  if (old) {
    await db.projectFile.update({ where: { id: old.id }, data: { deletedAt: new Date() } }).catch(() => undefined);
    if (old.blobPathname) await deleteStoredFile(old.blobPathname).catch(() => undefined);
  }
}

async function readCheck(id: string): Promise<ChapterCheckRow | null> {
  const r = await db.chapterCheck.findUnique({ where: { id }, select: ROW_SELECT });
  return r ? toCheckRow(r) : null;
}

async function afterCheck(s: Subject, row: ChapterCheckRow | null): Promise<void> {
  if (!row || row.status === "RUNNING") return;
  const project = await db.project.findUnique({ where: { id: s.projectDbId }, select: { projectId: true, worker: { select: { userId: true } } } });
  const code = project?.projectId ?? "";
  if (s.subject === "AI_TEXT") {
    // The draft goes to the specialist now if nothing else is coming (a pass, or no rewrite left); the orchestrator
    // is woken either way (a rewrite is its to start).
    await import("@/lib/services/chapter-review")
      .then((m) => m.ensureChapterDraft(s.projectDbId, s.chapter))
      .catch((error) => console.warn(`${TAG} ${code} ch${s.chapter}: the draft was not made yet`, error instanceof Error ? error.message : error));
  } else if (row.status === "PASSED") {
    await notifyOperations({
      title: `Chapter ${s.chapter} ready for approval`,
      message: CHAPTER_REVIEW_TEXT.check.uploadPassedMessage(code, s.chapter, row.passedCount ?? 0, row.applicable ?? 0),
      type: "info",
      link: `/admin/projects/${code}?tab=documents`,
    }).catch(() => undefined);
  } else if (row.status === "FAILED") {
    await notifyUsers([project?.worker?.userId], {
      title: `Chapter ${s.chapter}: fix before approval`,
      message: CHAPTER_REVIEW_TEXT.check.uploadFailedMessage(code, s.chapter, row.failures.length),
      type: "warning",
      link: `/worker/projects/${code}?tab=documents`,
    }).catch(() => undefined);
  }
  await import("@/lib/generation/orchestrator").then((m) => m.nudge(s.projectDbId)).catch(() => undefined);
}

export type ChapterCheckOutcome = { state: "not-ready" } | { state: "running" } | { state: "settled"; check: ChapterCheckRow };

/**
 * Takes the check of a chapter's current text and returns the work to do (the
 * internal route runs it in waitUntil; the check script awaits it). A text that
 * was checked already is not checked again unless `force` (the founder or the
 * COO: "Check again", with fresh AI calls).
 */
export async function startChapterCheck(
  projectDbId: string,
  chapter: number,
  subject: ChapterCheckSubject,
  opts: { versionId?: string | null; force?: boolean } = {},
): Promise<{ outcome: ChapterCheckOutcome; work: (() => Promise<ChapterCheckRow | null>) | null }> {
  const s = await loadSubject(projectDbId, chapter, subject, opts.versionId);
  if (!s) return { outcome: { state: "not-ready" }, work: null };
  const textHash = chapterTextHash(s.text);
  const c = await claim(s, textHash, Boolean(opts.force));
  if (c.kind === "running") return { outcome: { state: "running" }, work: null };
  if (c.kind === "settled") return { outcome: { state: "settled", check: c.row }, work: null };
  return {
    outcome: { state: "running" },
    work: async () => {
      const row = await execute(s, textHash, c, Boolean(opts.force));
      await afterCheck(s, row);
      return row;
    },
  };
}

/** Runs a check to its end in this process (the check script; a route uses the internal route instead). */
export async function runChapterCheck(projectDbId: string, chapter: number, subject: ChapterCheckSubject, opts: { versionId?: string | null; force?: boolean } = {}): Promise<ChapterCheckOutcome> {
  const { outcome, work } = await startChapterCheck(projectDbId, chapter, subject, opts);
  if (!work) return outcome;
  const row = await work();
  return row ? { state: "settled", check: row } : { state: "running" };
}

// ─── Asking for a check (HTTP, so it never runs inside a page or a tick) ─────

function secret(): string {
  const v = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!v) throw new Error("AUTH_SECRET is not set");
  return v;
}

const tokenText = (projectDbId: string, chapter: number, subject: ChapterCheckSubject, versionId: string | null | undefined) => `chapter-check:${projectDbId}:${chapter}:${subject}:${versionId ?? ""}`;
export const signChapterCheckToken = (projectDbId: string, chapter: number, subject: ChapterCheckSubject, versionId?: string | null) =>
  crypto.createHmac("sha256", secret()).update(tokenText(projectDbId, chapter, subject, versionId)).digest("hex");

export function verifyChapterCheckToken(projectDbId: string, chapter: number, subject: ChapterCheckSubject, versionId: string | null | undefined, token: string | null): boolean {
  if (!token) return false;
  const a = Buffer.from(signChapterCheckToken(projectDbId, chapter, subject, versionId));
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Fires the check in its own invocation; a failure is only logged (the next page load or tick asks again). */
export async function requestChapterCheck(projectDbId: string, chapter: number, subject: ChapterCheckSubject, opts: { versionId?: string | null; force?: boolean } = {}): Promise<boolean> {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json", "x-chapter-check-token": signChapterCheckToken(projectDbId, chapter, subject, opts.versionId) };
    if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) headers["x-vercel-protection-bypass"] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    const res = await fetch(`${selfBaseUrl()}/api/internal/chapter-check/run`, {
      method: "POST",
      headers,
      body: JSON.stringify({ projectId: projectDbId, chapter, subject, versionId: opts.versionId ?? null, force: Boolean(opts.force) }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) console.warn(`${TAG} a check was not accepted (HTTP ${res.status})`);
    return res.ok;
  } catch (error) {
    console.warn(`${TAG} a check could not be asked for; it is asked again later`, error instanceof Error ? error.message : error);
    return false;
  }
}

// ─── Where a chapter's AI text stands ────────────────────────────────────────


export async function maxRewritesSetting(): Promise<number> {
  const row = await db.setting.findUnique({ where: { key: REWRITES_SETTING }, select: { value: true } }).catch(() => null);
  return rewritesAllowed(row?.value);
}

/** Where one chapter's AI text stands, and its check (the draft waits until the step is "handover"). */
export async function aiTextStep(projectDbId: string, chapter: number): Promise<{ step: ChapterGateStep; check: ChapterCheckRow | null; rewritesUsed: number } | null> {
  const [cp, project, maxRewrites] = await Promise.all([
    db.generationCheckpoint.findUnique({
      where: { projectId_chapterNumber: { projectId: projectDbId, chapterNumber: chapter } },
      select: { status: true, outputHash: true, gateRewriteNo: true },
    }),
    db.project.findUnique({
      where: { id: projectDbId },
      select: {
        status: true,
        orchestratorRun: { select: { status: true } },
        researchMode: { select: { modeNumber: true, isLocked: true } },
        pauses: { select: { afterChapter: true, status: true } },
        _count: { select: { files: { where: { category: "secondary_data", deletedAt: null } } } },
      },
    }),
    maxRewritesSetting(),
  ]);
  if (cp?.status !== "COMPLETED" || !project) return null;
  const check = cp.outputHash
    ? await db.chapterCheck.findUnique({
        where: { projectId_chapterNumber_subject_textHash: { projectId: projectDbId, chapterNumber: chapter, subject: "AI_TEXT", textHash: cp.outputHash } },
        select: ROW_SELECT,
      })
    : null;
  const fact = gateFactFrom({
    chapter,
    outputHash: cp.outputHash,
    gateRewriteNo: cp.gateRewriteNo,
    check,
    mode: project.researchMode?.isLocked ? project.researchMode.modeNumber : null,
    pauses: project.pauses,
    hasDataset: project._count.files > 0,
  });
  const step = chapterGateStep(fact, { now: new Date(), maxRewrites, policy: rewritePolicy(project.orchestratorRun, project.status) });
  return { step, check: check ? toCheckRow(check) : null, rewritesUsed: cp.gateRewriteNo };
}

/** Every chapter check of a project, newest first (the screens pick what they need). */
export async function projectChapterChecks(projectDbId: string): Promise<ChapterCheckRow[]> {
  const rows = await db.chapterCheck.findMany({ where: { projectId: projectDbId }, orderBy: { createdAt: "desc" }, select: ROW_SELECT });
  return rows.map(toCheckRow);
}

/** The hash of an upload's current read-back text (approval reads the check of exactly this text). */
export async function chapterGateCurrentUploadHash(projectDbId: string, chapter: number, versionId: string): Promise<string | null> {
  void projectDbId;
  void chapter;
  const { readback, text } = await ensureReadback(versionId).catch(() => ({ readback: null, text: null }));
  if (!readback || !text || readback.blocking.length) return null;
  return chapterTextHash(scopeImageKeys(text, versionId, readback.assets.map((a) => a.key)));
}

/**
 * The free layers only (formatting, structure, the citation matching and the phrase scan; no AI, nothing
 * written): what `npm run chapters:check-backfill` reports, as an early estimate before any credit is spent.
 */
export async function previewChapterCheck(projectDbId: string, chapter: number): Promise<ReturnType<typeof chapterGateResult> | null> {
  const s = await loadSubject(projectDbId, chapter, "AI_TEXT", null, { write: false });
  if (!s) return null;
  return (await evaluateChapter(s, true, { ai: false })).result;
}

