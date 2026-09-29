/**
 * Phase D5: a Mode 5 project's secondary dataset.
 *
 * Once Chapter 3 is written, the worker (or the founder / the COO) fetches the
 * data its model names: the model is read from Chapter 3 (model-spec.ts, one
 * Claude call, reused while Chapter 3 is unchanged), the series come from the
 * World Bank and the CBN (secondary-data-fetcher.ts), and the result is kept as
 * a CSV in the private store with a ProjectFile row (category secondary_data)
 * whose extractedText holds the whole record as JSON. A new fetch replaces the
 * old one (soft delete) until Chapter 4 starts; from then on it is frozen,
 * because Chapter 4 was written from it. Chapters 4 and 5 read it through
 * secondaryDataForChapter().
 *
 * No schema change: the last good copy of each series (the fallback when a
 * source does not answer) lives in Setting rows, "secondary_data_cache:…".
 */

import crypto from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { AnthropicError } from "@/lib/anthropic";
import { buildPrivatePath } from "@/lib/files/paths";
import { deleteStoredFile, putPrivateFile } from "@/lib/files/storage";
import {
  correlationMatrix,
  correlationTableText,
  datasetCsv,
  datasetNotes,
  describeDataset,
  statsTableText,
  type ColumnStats,
  type CorrelationMatrix,
  type Dataset,
  type MissingItem,
} from "@/lib/data-fetchers/dataset-csv";
import { extractModelSpec, ModelSpecError, type ModelSpec } from "@/lib/data-fetchers/model-spec";
import { fetchSecondaryData, type CachedSeries, type SeriesCache } from "@/lib/data-fetchers/secondary-data-fetcher";
import type { RequestLogEntry } from "@/lib/data-fetchers/timed-fetch";
import { lockProjectRow } from "@/lib/generation/generation-state";
import type { PromptSecondaryData } from "@/lib/generation/prompt-loader";
import { getApprovedModeSettings } from "@/lib/services/research-mode";
import { ModeNotApprovedError } from "@/lib/services/mode-errors";

type Tx = Prisma.TransactionClient;

export const SECONDARY_DATA_CATEGORY = "secondary_data";
export const SECONDARY_DATA_SUBSYSTEM = "secondary_data";
const PATH_TARGET = "secondary-data";

export class SecondaryDataError extends Error {
  constructor(
    message: string,
    readonly status: 404 | 409 | 502 | 503 = 409,
    readonly code?: string,
    readonly details?: { missing?: MissingItem[]; requests?: RequestLogEntry[] }
  ) {
    super(message);
  }
}

/**
 * A short, human-readable diagnostic for the orchestrator's `reasonDetail`
 * (or any log). The message on a `NOTHING_FETCHED` error is generic; the
 * useful information lives on `details.missing` (per-variable reasons) and
 * `details.requests` (per-URL status/ms/timedOut). We fold both into a
 * capped string so the "Needs attention" panel and the SecondaryDataCard
 * can show them.
 */
export function summarizeSecondaryDataFailure(error: unknown, maxLen = 1000): string {
  const base = error instanceof Error ? error.message : String(error);
  if (!(error instanceof SecondaryDataError) || !error.details) return base.slice(0, maxLen);
  const lines: string[] = [base];
  const missing = error.details.missing ?? [];
  if (missing.length) {
    lines.push("");
    lines.push(`Missing (${missing.length}):`);
    for (const m of missing) lines.push(`  • ${m.symbol} (${m.name}): ${m.reason}`);
  }
  const requests = error.details.requests ?? [];
  if (requests.length) {
    const failed = requests.filter((r) => !r.ok);
    const slowest = Math.max(0, ...requests.map((r) => r.ms));
    lines.push("");
    lines.push(`Requests: ${requests.length} · failed ${failed.length} · slowest ${(slowest / 1000).toFixed(1)} s`);
    for (const r of failed.slice(0, 12)) {
      const shape = r.timedOut ? "timed out" : r.status ? `HTTP ${r.status}` : "network error";
      lines.push(`  • ${shape} in ${(r.ms / 1000).toFixed(1)} s — ${r.url}`);
      if (r.error) lines.push(`      ${r.error}`);
    }
    if (failed.length > 12) lines.push(`  … and ${failed.length - 12} more`);
  }
  return lines.join("\n").slice(0, maxLen);
}

/** Everything one fetch produced, kept as JSON on the ProjectFile row. */
export interface StoredSecondaryData {
  version: 1;
  fetchedAt: string;
  fetchedBy: { userId: string; role: "WORKER" | "ADMIN" };
  chapterThreeHash: string;
  spec: ModelSpec;
  /** False when the spec was read again from Chapter 3 (a Claude call); true when an unchanged Chapter 3 let the last one be reused. */
  specReused: boolean;
  specCostNaira: number;
  dataset: Dataset;
  csv: string;
  notes: string[];
  missing: MissingItem[];
  stats: ColumnStats[];
  correlation: CorrelationMatrix;
  requests: RequestLogEntry[];
}

// ─── The fallback copies (Setting rows) ──────────────────────────────────────

export const settingSeriesCache: SeriesCache = {
  async get(key) {
    const row = await db.setting.findUnique({ where: { key }, select: { value: true } });
    if (!row) return null;
    try {
      const v = JSON.parse(row.value) as CachedSeries;
      return v && typeof v.values === "object" && typeof v.savedAt === "string" ? v : null;
    } catch {
      return null;
    }
  },
  async set(key, series) {
    const value = JSON.stringify(series);
    await db.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  },
};

// ─── Reading ─────────────────────────────────────────────────────────────────

export interface LatestSecondaryData {
  fileId: string;
  fileName: string;
  data: StoredSecondaryData;
}

export async function latestSecondaryData(projectDbId: string, client: Tx | typeof db = db): Promise<LatestSecondaryData | null> {
  const row = await client.projectFile.findFirst({
    where: { projectId: projectDbId, category: SECONDARY_DATA_CATEGORY, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, fileName: true, extractedText: true },
  });
  if (!row?.extractedText) return null;
  try {
    const data = JSON.parse(row.extractedText) as StoredSecondaryData;
    return data?.version === 1 ? { fileId: row.id, fileName: row.fileName, data } : null;
  } catch {
    return null;
  }
}

const formatDay = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" });

/** What Chapters 4 and 5 of a Mode 5 project are given (undefined for every other chapter and mode). */
export function promptSecondaryData(data: StoredSecondaryData): PromptSecondaryData {
  return {
    period: { start: data.dataset.start, end: data.dataset.end },
    equation: data.spec.equation,
    technique: data.spec.technique,
    fetchedOn: formatDay(data.fetchedAt),
    notes: data.notes,
    csv: data.csv.trim(),
    statsTable: statsTableText(data.stats),
    correlationTable: correlationTableText(data.correlation),
    missing: data.missing.map((m) => `${m.symbol} (${m.name}): ${m.reason}`),
  };
}

export async function secondaryDataForChapter(client: Tx | typeof db, projectDbId: string, mode: number, chapter: number): Promise<PromptSecondaryData | undefined> {
  if (mode !== 5 || chapter < 4) return undefined;
  const latest = await latestSecondaryData(projectDbId, client);
  return latest ? promptSecondaryData(latest.data) : undefined;
}

/** The JSON both routes answer with (and the card reads). */
export function secondaryDataResponse(projectCode: string, latest: LatestSecondaryData) {
  const d = latest.data;
  return {
    ok: true,
    projectCode,
    fileId: latest.fileId,
    fileName: latest.fileName,
    fetchedAt: d.fetchedAt,
    spec: d.spec,
    period: { start: d.dataset.start, end: d.dataset.end, frequency: d.dataset.frequency },
    columns: d.dataset.columns.map((c) => ({
      symbol: c.symbol,
      name: c.name,
      role: c.role,
      source: c.source,
      code: c.code,
      unit: c.unit,
      sourceNote: c.sourceNote,
      years: Object.keys(c.values).length,
    })),
    csvData: d.csv,
    notes: d.notes,
    rowCount: d.dataset.end - d.dataset.start + 1,
    missing: d.missing,
    stats: d.stats,
    correlation: d.correlation,
    requests: d.requests,
    costNaira: Math.round(d.specCostNaira * 100) / 100,
    specReused: d.specReused,
  };
}

export type SecondaryDataResponse = ReturnType<typeof secondaryDataResponse>;

export interface SecondaryDataStatus {
  /** Approved in Mode 5: the only projects with a dataset. */
  eligible: boolean;
  mode: number | null;
  chapterThreeReady: boolean;
  chapterFourStarted: boolean;
  latest: SecondaryDataResponse | null;
}

export async function secondaryDataStatus(projectDbId: string, projectCode: string): Promise<SecondaryDataStatus> {
  const [mode, checkpoints, latest] = await Promise.all([
    db.researchMode.findUnique({ where: { projectId: projectDbId }, select: { modeNumber: true, isLocked: true } }),
    db.generationCheckpoint.findMany({ where: { projectId: projectDbId, chapterNumber: { in: [3, 4] } }, select: { chapterNumber: true, status: true } }),
    latestSecondaryData(projectDbId),
  ]);
  return {
    eligible: Boolean(mode?.isLocked && mode.modeNumber === 5),
    mode: mode?.isLocked ? mode.modeNumber : null,
    chapterThreeReady: checkpoints.some((c) => c.chapterNumber === 3 && c.status === "COMPLETED"),
    chapterFourStarted: checkpoints.some((c) => c.chapterNumber === 4),
    latest: latest ? secondaryDataResponse(projectCode, latest) : null,
  };
}

// ─── Fetching ────────────────────────────────────────────────────────────────

async function costSince(projectDbId: string, since: Date): Promise<number> {
  const sum = await db.aiUsageLog.aggregate({
    where: { projectId: projectDbId, subsystem: SECONDARY_DATA_SUBSYSTEM, createdAt: { gte: since } },
    _sum: { costNaira: true },
  });
  return sum._sum.costNaira ?? 0;
}

const CHAPTER_FOUR_STARTED = "Chapter 4 has been started from this data, so the data can no longer change.";

export async function runSecondaryDataFetch(projectDbId: string, actor: { userId: string; role: "WORKER" | "ADMIN" }): Promise<LatestSecondaryData & { projectCode: string }> {
  const project = await db.project.findUnique({ where: { id: projectDbId }, select: { id: true, projectId: true } });
  if (!project) throw new SecondaryDataError("Project not found", 404);

  let mode: number;
  try {
    mode = (await getApprovedModeSettings(project.id)).mode;
  } catch (error) {
    if (error instanceof ModeNotApprovedError) throw new SecondaryDataError(error.message, 409, "MODE_NOT_APPROVED");
    throw error;
  }
  if (mode !== 5) throw new SecondaryDataError(`Secondary data is fetched for Mode 5 (secondary data) projects only. This project was approved in Mode ${mode}.`, 409, "NOT_MODE_5");

  const [chapterThree, chapterFour] = await Promise.all([
    db.generationCheckpoint.findUnique({ where: { projectId_chapterNumber: { projectId: project.id, chapterNumber: 3 } }, select: { status: true, fullOutput: true } }),
    db.generationCheckpoint.findUnique({ where: { projectId_chapterNumber: { projectId: project.id, chapterNumber: 4 } }, select: { id: true } }),
  ]);
  if (chapterFour) throw new SecondaryDataError(CHAPTER_FOUR_STARTED, 409, "GENERATION_STARTED");
  const chapterText = chapterThree?.status === "COMPLETED" ? chapterThree.fullOutput?.trim() : null;
  if (!chapterText) throw new SecondaryDataError("Chapter 3 must be written first: the variables and the period are read from it.", 409, "CHAPTER_3_NOT_READY");

  const chapterThreeHash = crypto.createHash("sha256").update(chapterText).digest("hex");
  const previous = await latestSecondaryData(project.id);
  let spec: ModelSpec;
  let specReused = false;
  let specCostNaira = 0;
  if (previous && previous.data.chapterThreeHash === chapterThreeHash) {
    spec = previous.data.spec;
    specReused = true;
  } else {
    const started = new Date(Date.now() - 1_000);
    try {
      spec = await extractModelSpec(chapterText, { usage: { projectId: project.id, subsystem: SECONDARY_DATA_SUBSYSTEM, step: "read_model_spec", chapterNumber: 3 } });
    } catch (error) {
      if (error instanceof ModelSpecError) throw new SecondaryDataError(`${error.message} The COO checks Chapter 3.`, 409, "NO_MODEL");
      if (error instanceof AnthropicError) throw new SecondaryDataError("Chapter 3 could not be read just now. Try again in a minute.", 503);
      throw error;
    } finally {
      specCostNaira = await costSince(project.id, started).catch(() => 0);
    }
  }

  const result = await fetchSecondaryData(spec, { cache: settingSeriesCache });
  if (!result.dataset.columns.some((c) => c.source)) {
    throw new SecondaryDataError("Nothing could be fetched for this model. See what is missing below; try again later or the specialist supplies the data.", 502, "NOTHING_FETCHED", {
      missing: result.missing,
      requests: result.requests,
    });
  }

  const csv = datasetCsv(result.dataset);
  const stored: StoredSecondaryData = {
    version: 1,
    fetchedAt: new Date().toISOString(),
    fetchedBy: actor,
    chapterThreeHash,
    spec,
    specReused,
    specCostNaira,
    dataset: result.dataset,
    csv,
    notes: [...datasetNotes(result.dataset), ...spec.notes],
    missing: result.missing,
    stats: describeDataset(result.dataset),
    correlation: correlationMatrix(result.dataset),
    requests: result.requests,
  };

  const bytes = new Uint8Array(Buffer.from(csv, "utf8"));
  const pathname = buildPrivatePath({ projectDbId: project.id, purpose: "source", targetId: PATH_TARGET, random: crypto.randomBytes(12).toString("hex"), ext: "csv" });
  const { url } = await putPrivateFile(pathname, bytes, "text/csv");
  const fileName = `${project.projectId} secondary data ${result.dataset.start}-${result.dataset.end}.csv`;

  try {
    const file = await db.$transaction(
      async (tx) => {
        // Same lock a chapter start takes, so a Chapter 4 starting now either waits for this dataset or refuses it.
        await lockProjectRow(tx, project.id);
        if (await tx.generationCheckpoint.findUnique({ where: { projectId_chapterNumber: { projectId: project.id, chapterNumber: 4 } }, select: { id: true } })) {
          throw new SecondaryDataError(CHAPTER_FOUR_STARTED, 409, "GENERATION_STARTED");
        }
        await tx.projectFile.updateMany({ where: { projectId: project.id, category: SECONDARY_DATA_CATEGORY, deletedAt: null }, data: { deletedAt: new Date() } });
        return tx.projectFile.create({
          data: {
            projectId: project.id,
            fileName,
            fileUrl: url,
            fileSize: bytes.byteLength,
            fileType: "text/csv",
            category: SECONDARY_DATA_CATEGORY,
            uploadedBy: actor.userId,
            uploaderRole: actor.role,
            storage: "PRIVATE_BLOB",
            blobPathname: pathname,
            extractedText: JSON.stringify(stored),
          },
          select: { id: true },
        });
      },
      { timeout: 20_000, maxWait: 10_000 }
    );
    return { fileId: file.id, fileName, data: stored, projectCode: project.projectId };
  } catch (error) {
    await deleteStoredFile(pathname).catch(() => {});
    throw error;
  }
}
