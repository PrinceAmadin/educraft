/**
 * Chapter review: which text each chapter of a report is built from.
 *
 *   approved   only COO-approved uploads (read back into chapter text), with their
 *              pictures. The complete report QA, the specialist and the client get.
 *              409 CHAPTERS_NOT_APPROVED while any chapter is not approved.
 *   canonical  the approved upload where there is one, the AI text where not
 *              (the founder's and the COO's working copy; what the quality gate scores).
 *   ai         the AI text only.
 *
 * The approved version of a chapter is its latest release by a person
 * (chapter-review.ts approvedVersion); its read-back is on the version.
 */

import { db } from "@/lib/db";
import { AssemblyError } from "@/lib/assembly/errors";
import { extractMedia, type ImageType } from "@/lib/assembly/read-chapter-docx";
import { approvedVersion, CHAPTER_REVIEW_TEXT, chapterItems, isWordFile, type ReviewDeliverable } from "@/lib/chapter-review";
import { maxBytesFor } from "@/lib/files/policy";
import { readFileBytes } from "@/lib/files/storage";
import { ensureReadback } from "@/lib/services/chapter-readback";

export type ChapterTextSource = "ai" | "canonical" | "approved";

export interface LoadedChapter {
  number: number;
  text: string;
  origin: "approved" | "ai";
  /** The approved version the text came from. */
  versionId: string | null;
}

export interface LoadedChapterTexts {
  chapters: LoadedChapter[];
  media: Map<string, { data: Uint8Array; type: ImageType }>;
  /** Every chapter approved: the version each came from (recorded on a complete document). */
  builtFrom: Record<string, string> | null;
  source: "approved" | "working-copy" | "ai";
}

/** The chapter items of a project with every released version (enough to find each chapter's approved one). */
export async function chapterReviewItems(projectDbId: string) {
  const rows = await db.projectDeliverable.findMany({
    where: { projectId: projectDbId, kind: "CHAPTER" },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      kind: true,
      chapter: true,
      archivedAt: true,
      changeNote: true,
      changeNoteAt: true,
      versions: {
        where: { file: { deletedAt: null } },
        orderBy: { version: "desc" },
        select: {
          id: true,
          version: true,
          status: true,
          submittedByRole: true,
          releaseNo: true,
          releasedAt: true,
          reviewedAt: true,
          createdAt: true,
          sourceHash: true,
          file: { select: { id: true, fileName: true, blobPathname: true } },
        },
      },
    },
  });
  return rows.map((d) => ({
    id: d.id,
    kind: d.kind,
    chapter: d.chapter,
    archived: d.archivedAt != null,
    changeNote: d.changeNote,
    changeNoteAt: d.changeNoteAt,
    versions: d.versions.map((v) => ({ ...v, fileName: v.file.fileName })),
  })) satisfies ReviewDeliverable[];
}

/** Key a picture by the version it came from, so two chapters' "word/media/image1.png" never meet. */
const scopedKey = (versionId: string, key: string) => `${versionId}/${key}`;

/**
 * A read-back's [IMAGE: key | …] lines with each key scoped to its version. The
 * chapter gate and the report gate hash this same text, so a chapter checked on
 * its own costs the report gate nothing.
 */
export function scopeImageKeys(text: string, versionId: string, keys: readonly string[]): string {
  return text.replace(/^\[IMAGE:\s*([^|\]]+?)\s*\|/gm, (line, key: string) => (keys.includes(key.trim()) ? line.replace(key, scopedKey(versionId, key.trim())) : line));
}

/** The pictures of one uploaded version, keyed as scopeImageKeys writes them. */
export async function loadVersionMedia(versionId: string, pathname: string, keys: readonly string[]): Promise<Map<string, { data: Uint8Array; type: ImageType }>> {
  const media = new Map<string, { data: Uint8Array; type: ImageType }>();
  const bytes = await readFileBytes(pathname, maxBytesFor("deliverable")).catch(() => null);
  if (!bytes) return media;
  const found = await extractMedia(bytes, [...keys]);
  for (const [key, data] of found) {
    const ext = (/\.([a-z0-9]+)$/i.exec(key)?.[1] ?? "").toLowerCase();
    const type: ImageType | null = ext === "png" ? "png" : ext === "jpg" || ext === "jpeg" ? "jpg" : ext === "gif" ? "gif" : ext === "bmp" ? "bmp" : null;
    if (type) media.set(scopedKey(versionId, key), { data, type });
  }
  return media;
}

/**
 * One uploaded chapter version as chapter text (read back, picture keys scoped) with its
 * pictures, or null when it is not a Word file or reads as nothing. `blocking` lists what
 * the reader could not carry (such a version is never approved).
 */
export async function versionChapterText(version: { id: string; fileName: string; blobPathname: string | null }): Promise<{ text: string; media: Map<string, { data: Uint8Array; type: ImageType }>; blocking: string[] } | null> {
  if (!isWordFile(version.fileName)) return null;
  const { readback, text } = await ensureReadback(version.id);
  if (!text) return null;
  const keys = readback.assets.map((a) => a.key);
  const media = keys.length && version.blobPathname ? await loadVersionMedia(version.id, version.blobPathname, keys) : new Map<string, { data: Uint8Array; type: ImageType }>();
  return { text: scopeImageKeys(text, version.id, keys), media, blocking: readback.blocking };
}

export async function loadChapterTexts(projectDbId: string, expected: readonly number[], source: ChapterTextSource): Promise<LoadedChapterTexts> {
  const [runs, items] = await Promise.all([
    db.generationCheckpoint.findMany({
      where: { projectId: projectDbId, chapterNumber: { in: [...expected] }, status: "COMPLETED" },
      select: { chapterNumber: true, fullOutput: true },
    }),
    source === "ai" ? Promise.resolve([]) : chapterReviewItems(projectDbId),
  ]);
  const aiText = new Map(runs.filter((r) => r.fullOutput).map((r) => [r.chapterNumber, r.fullOutput as string]));
  const byChapter = chapterItems(items, expected);

  const chapters: LoadedChapter[] = [];
  const pending: number[] = [];
  const missing: number[] = [];
  const withPictures: { versionId: string; pathname: string; keys: string[] }[] = [];

  for (const n of expected) {
    const item = byChapter.get(n);
    const approved = item ? approvedVersion(item.versions) : null;
    let used = false;
    if (approved && source !== "ai" && isWordFile(approved.fileName)) {
      const { readback, text } = await ensureReadback(approved.id);
      if (text && readback.blocking.length === 0) {
        const keys = readback.assets.map((a) => a.key);
        const scoped = scopeImageKeys(text, approved.id, keys);
        chapters.push({ number: n, text: scoped, origin: "approved", versionId: approved.id });
        if (keys.length && approved.file.blobPathname) withPictures.push({ versionId: approved.id, pathname: approved.file.blobPathname, keys });
        used = true;
      }
    }
    if (used) continue;
    if (source === "approved") {
      pending.push(n);
      continue;
    }
    const ai = aiText.get(n);
    if (ai) chapters.push({ number: n, text: ai, origin: "ai", versionId: null });
    else missing.push(n);
  }

  if (source === "approved" && pending.length) {
    throw new AssemblyError(CHAPTER_REVIEW_TEXT.notAllApproved(pending), 409, "CHAPTERS_NOT_APPROVED", { pending });
  }
  if (missing.length) {
    throw new AssemblyError(`The report can be assembled once every chapter is written. Still to come: Chapter ${missing.join(", ")}.`, 409, "CHAPTERS_NOT_READY", { missing });
  }

  const media = new Map<string, { data: Uint8Array; type: ImageType }>();
  for (const w of withPictures) for (const [key, value] of await loadVersionMedia(w.versionId, w.pathname, w.keys)) media.set(key, value);

  const allApproved = chapters.length > 0 && chapters.every((c) => c.origin === "approved");
  return {
    chapters,
    media,
    builtFrom: allApproved ? Object.fromEntries(chapters.map((c) => [String(c.number), c.versionId as string])) : null,
    source: source === "ai" ? "ai" : allApproved ? "approved" : "working-copy",
  };
}
