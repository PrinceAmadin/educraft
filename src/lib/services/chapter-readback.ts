/**
 * Chapter review: an uploaded chapter .docx read back into chapter text and kept
 * on its version (DeliverableVersion.readback / readbackText), so the COO sees
 * what the complete report will contain before approving it, and the report is
 * built from exactly what was approved. Read once per upload; read again only
 * when the reader changes (READER_VERSION).
 */

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { maxBytesFor } from "@/lib/files/policy";
import { readFileBytes } from "@/lib/files/storage";
import { READER_VERSION, readChapterDocx, type ReadAsset, type ReadSummary } from "@/lib/assembly/read-chapter-docx";
import { isWordFile } from "@/lib/chapter-review";

export interface DraftComparison {
  /** The upload reads back exactly as the AI draft did: nothing was changed. */
  sameAsDraft: boolean;
  words: [number, number];
  tables: [number, number];
  equations: [number, number];
  figures: [number, number];
  headings: [number, number];
  notes: [number, number];
}

export interface StoredReadback {
  hash: string;
  readerVersion: number;
  summary: ReadSummary | null;
  blocking: string[];
  flags: string[];
  assets: ReadAsset[];
  /** Against the chapter's latest AI draft (not for the draft itself). */
  comparedToDraft: DraftComparison | null;
  readAt: string;
}

export function readStoredReadback(json: Prisma.JsonValue | null | undefined): StoredReadback | null {
  const r = json as unknown as StoredReadback | null;
  return r && typeof r === "object" && typeof r.hash === "string" ? r : null;
}

const versionSelect = {
  id: true,
  submittedByRole: true,
  readback: true,
  readbackText: true,
  readerVersion: true,
  file: { select: { fileName: true, blobPathname: true, deletedAt: true } },
  deliverable: {
    select: {
      id: true,
      chapter: true,
      kind: true,
      project: { select: { id: true, projectId: true } },
    },
  },
} satisfies Prisma.DeliverableVersionSelect;

/** The read-back on record, reading the file now when there is none (or the reader changed). */
export async function ensureReadback(versionId: string): Promise<{ readback: StoredReadback; text: string | null }> {
  const v = await db.deliverableVersion.findUnique({ where: { id: versionId }, select: { readback: true, readbackText: true, readerVersion: true } });
  const stored = readStoredReadback(v?.readback);
  if (stored && v?.readerVersion === READER_VERSION) return { readback: stored, text: v.readbackText };
  return readBackVersion(versionId);
}

/** Reads a chapter version's .docx and stores what it says. Never throws for a bad file: that is recorded as blocking. */
export async function readBackVersion(versionId: string): Promise<{ readback: StoredReadback; text: string | null }> {
  const v = await db.deliverableVersion.findUnique({ where: { id: versionId }, select: versionSelect });
  if (!v) throw new Error("Version not found");
  const chapter = v.deliverable.chapter ?? 1;
  const now = new Date();
  let readback: StoredReadback;
  let text: string | null = null;
  if (!isWordFile(v.file.fileName)) {
    readback = { hash: "", readerVersion: READER_VERSION, summary: null, blocking: ["Chapters are approved as Word files (.docx). This file is not one."], flags: [], assets: [], comparedToDraft: null, readAt: now.toISOString() };
  } else {
    try {
      const bytes = v.file.blobPathname && !v.file.deletedAt ? await readFileBytes(v.file.blobPathname, maxBytesFor("deliverable")) : null;
      if (!bytes) throw new Error("The file could not be found in storage.");
      const references = await db.reference.findMany({ where: { projectId: v.deliverable.project.id, status: "KEPT" }, select: { authors: true, year: true } });
      const read = await readChapterDocx(bytes, { chapter, projectCode: v.deliverable.project.projectId, references });
      text = read.markup;
      readback = {
        hash: read.hash,
        readerVersion: read.readerVersion,
        summary: read.summary,
        blocking: read.blocking,
        flags: read.flags,
        assets: read.assets,
        comparedToDraft: v.submittedByRole === "SYSTEM" ? null : await compareWithDraft(v.deliverable.id, versionId, read.markup, read.summary),
        readAt: now.toISOString(),
      };
      if (readback.comparedToDraft?.sameAsDraft) {
        readback.flags.unshift("This file reads exactly as the AI draft: nothing in it was changed. Approve it only if the chapter needs no correction.");
      }
    } catch (error) {
      readback = {
        hash: "",
        readerVersion: READER_VERSION,
        summary: null,
        blocking: [`The file could not be read: ${error instanceof Error ? error.message : String(error)} Save it again in Word as a Word Document (.docx) and upload it.`],
        flags: [],
        assets: [],
        comparedToDraft: null,
        readAt: now.toISOString(),
      };
    }
  }
  await db.deliverableVersion.update({
    where: { id: versionId },
    data: { readback: readback as unknown as Prisma.InputJsonValue, readbackText: text, readbackAt: now, readerVersion: READER_VERSION },
  });
  return { readback, text };
}

/** The upload against the chapter's latest AI draft, as the COO's summary shows it. */
async function compareWithDraft(deliverableId: string, versionId: string, markup: string, summary: ReadSummary): Promise<DraftComparison | null> {
  const draft = await db.deliverableVersion.findFirst({
    where: { deliverableId, submittedByRole: "SYSTEM", id: { not: versionId } },
    orderBy: { version: "desc" },
    select: { id: true, readback: true, readbackText: true, readerVersion: true },
  });
  if (!draft) return null;
  let draftText = draft.readbackText;
  let draftSummary = readStoredReadback(draft.readback)?.summary ?? null;
  if (draft.readerVersion !== READER_VERSION || !draftText || !draftSummary) {
    const again = await readBackVersion(draft.id).catch(() => null);
    draftText = again?.text ?? null;
    draftSummary = again?.readback.summary ?? null;
  }
  if (!draftText || !draftSummary) return null;
  return {
    sameAsDraft: draftText === markup,
    words: [draftSummary.words, summary.words],
    tables: [draftSummary.tables, summary.tables],
    equations: [draftSummary.equations, summary.equations],
    figures: [draftSummary.figures, summary.figures],
    headings: [draftSummary.headings, summary.headings],
    notes: [draftSummary.notes, summary.notes],
  };
}

/** The approval facts a read-back gives (approvalRefusals in chapter-review.ts). */
export function readbackFacts(r: StoredReadback | null): { blocking: string[]; placeholders: string[]; hash: string } | null {
  if (!r) return null;
  return { blocking: r.blocking, placeholders: r.summary?.placeholders ?? [], hash: r.hash };
}
