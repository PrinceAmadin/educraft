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
  isPermanentMissing,
  MISSING_CODE_LABELS,
  statsTableText,
  type ColumnStats,
  type CorrelationMatrix,
  type Dataset,
  type MissingItem,
} from "@/lib/data-fetchers/dataset-csv";
import { routeDepartment, routingKey, type Domain, type DomainRouting } from "@/lib/data-fetchers/domain-map";
import { catalogueKeysForDomains, sourceNamesForDomains } from "@/lib/data-fetchers/indicator-catalogue";
import { extractModelSpec, ModelSpecError, type ModelSpec } from "@/lib/data-fetchers/model-spec";
import { fetchSecondaryData, type CachedSeries, type SeriesCache } from "@/lib/data-fetchers/secondary-data-fetcher";
import { MAX_UPLOAD_CHARS, parseUploadedDataset, UPLOAD_TEXT, UploadedDatasetError, uploadTemplateCsv } from "@/lib/data-fetchers/uploaded-dataset";
import { SOURCE_REGISTRY } from "@/lib/data-fetchers/source-registry";
import type { RequestLogEntry } from "@/lib/data-fetchers/timed-fetch";
import { lockProjectRow } from "@/lib/generation/generation-state";
import type { PromptSecondaryData } from "@/lib/generation/prompt-loader";
import { getApprovedModeSettings } from "@/lib/services/research-mode";
import { ModeNotApprovedError } from "@/lib/services/mode-errors";
import { loadChapterTexts } from "@/lib/services/chapter-texts";

type Tx = Prisma.TransactionClient;

export const SECONDARY_DATA_CATEGORY = "secondary_data";
export const SECONDARY_DATA_SUBSYSTEM = "secondary_data";
const PATH_TARGET = "secondary-data";

export class SecondaryDataError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 | 413 | 502 | 503 = 409,
    readonly code?: string,
    readonly details?: { missing?: MissingItem[]; requests?: RequestLogEntry[]; problems?: string[] }
  ) {
    super(message);
  }

  /**
   * Whether fetching again could change the answer. A source that did not
   * answer (503, or a NOTHING_FETCHED with a source that failed) could; a
   * project state (409) or variables no source publishes cannot.
   */
  get retryable(): boolean {
    if (this.status === 503) return true;
    if (this.code !== "NOTHING_FETCHED") return false;
    return (this.details?.missing ?? []).some((m) => !isPermanentMissing(m.code));
  }
}

/** Why nothing was fetched, in one sentence (for the card and the orchestrator's panel; for the founder to review). */
export const NOTHING_FETCHED_TEXT = {
  permanent: "None of this model's variables can be fetched automatically for this department. The specialist supplies the data: upload it on the card.",
  retryable: "Nothing could be fetched for this model. See what is missing below: fetch again later, or the specialist supplies the data.",
} as const;

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
    for (const m of missing) lines.push(`  • ${m.symbol} (${m.name})${m.code ? ` [${MISSING_CODE_LABELS[m.code]}]` : ""}: ${m.reason}`);
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
  /** The department's sources when it was fetched (absent on datasets fetched before 29 Sept 2026). */
  routing?: StoredRouting;
  /** "upload" when the specialist supplied it (absent = fetched). */
  origin?: "fetch" | "upload";
  /** For an upload: where the specialist says the data comes from. */
  uploadSource?: string;
}

export const MAX_UPLOAD_SOURCE = 200;
export const UPLOAD_SOURCE_REQUIRED = "Say where the data comes from (for example: CBN Statistical Bulletin 2023; NBS Labour Force Survey).";

export interface StoredRouting extends DomainRouting {
  offeredKeysHash: string;
}

/** What the card shows about where this project's data can come from. */
export interface RoutingView {
  department: string | null;
  basis: string;
  domains: Domain[];
  /** The sources the department's catalogue entries name, as the notes cite them. */
  sources: string[];
}

export function routingView(department: string | null): RoutingView {
  const r = routeDepartment(department);
  return { department: r.department, basis: r.basis, domains: r.domains, sources: sourceNamesForDomains(r.domains).map((n) => SOURCE_REGISTRY[n].label) };
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
    routingBasis: d.routing?.basis ?? null,
    origin: d.origin ?? "fetch",
    uploadSource: d.uploadSource ?? null,
  };
}

export type SecondaryDataResponse = ReturnType<typeof secondaryDataResponse>;

export interface SecondaryDataStatus {
  /** Approved in Mode 5: the only projects with a dataset. */
  eligible: boolean;
  mode: number | null;
  chapterThreeReady: boolean;
  chapterFourStarted: boolean;
  /** Where this department's data can come from (null until a mode is approved). */
  routing: RoutingView | null;
  /**
   * For supplying the data by hand: the model's variables and period (from the
   * last reading of Chapter 3) and a CSV with every value already fetched
   * filled in. Null until Chapter 3 has been read once (a Fetch does that).
   */
  upload: { period: { start: number; end: number }; variables: { symbol: string; name: string }[]; templateCsv: string } | null;
  latest: SecondaryDataResponse | null;
}

export async function secondaryDataStatus(projectDbId: string, projectCode: string): Promise<SecondaryDataStatus> {
  const [mode, checkpoints, latest, reading] = await Promise.all([
    db.researchMode.findUnique({ where: { projectId: projectDbId }, select: { modeNumber: true, isLocked: true, department: true } }),
    db.generationCheckpoint.findMany({ where: { projectId: projectDbId, chapterNumber: { in: [3, 4] } }, select: { chapterNumber: true, status: true } }),
    latestSecondaryData(projectDbId),
    savedModelReading(projectDbId),
  ]);
  const spec = reading?.spec ?? latest?.data.spec ?? null;
  const sameModel = latest && (!reading || reading.chapterThreeHash === latest.data.chapterThreeHash);
  return {
    upload: spec
      ? {
          period: spec.period,
          variables: spec.variables.map((v) => ({ symbol: v.symbol, name: v.name })),
          templateCsv: uploadTemplateCsv(spec, sameModel ? latest.data.dataset : null),
        }
      : null,
    routing: mode?.isLocked ? routingView(mode.department) : null,
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

// ─── The model reading (kept per project, so a failed fetch or an upload never reads Chapter 3 twice) ──

/** The last reading of a project's model, in a Setting row (not a ProjectFile: a file means "the dataset exists" to the orchestrator). */
interface SavedModelReading {
  chapterThreeHash: string;
  /** Which catalogue entries Claude was offered (the department's domains and the catalogue at the time). */
  offeredKeysHash: string;
  spec: ModelSpec;
  costNaira: number;
  savedAt: string;
}

const modelReadingKey = (projectDbId: string) => `secondary_data_model:${projectDbId}`;

function offeredKeysHash(routing: DomainRouting): string {
  return crypto.createHash("sha256").update(`${routingKey(routing.domains)}|${catalogueKeysForDomains(routing.domains).join(",")}`).digest("hex");
}

async function savedModelReading(projectDbId: string): Promise<SavedModelReading | null> {
  const row = await db.setting.findUnique({ where: { key: modelReadingKey(projectDbId) }, select: { value: true } });
  if (!row) return null;
  try {
    const v = JSON.parse(row.value) as SavedModelReading;
    return v && typeof v.chapterThreeHash === "string" && v.spec && Array.isArray(v.spec.variables) ? v : null;
  } catch {
    return null;
  }
}

/**
 * Everything a fetch needs before any source is asked: Mode 5 approved,
 * Chapter 3 written, Chapter 4 not started, the department's routing, and the
 * model (read from Chapter 3 with one Claude call, reused while Chapter 3 and
 * the offered catalogue entries are unchanged).
 */
async function prepareModel(projectDbId: string): Promise<{
  project: { id: string; projectId: string };
  routing: StoredRouting;
  chapterThreeHash: string;
  spec: ModelSpec;
  specReused: boolean;
  specCostNaira: number;
}> {
  const project = await db.project.findUnique({ where: { id: projectDbId }, select: { id: true, projectId: true } });
  if (!project) throw new SecondaryDataError("Project not found", 404);

  let settings: Awaited<ReturnType<typeof getApprovedModeSettings>>;
  try {
    settings = await getApprovedModeSettings(project.id);
  } catch (error) {
    if (error instanceof ModeNotApprovedError) throw new SecondaryDataError(error.message, 409, "MODE_NOT_APPROVED");
    throw error;
  }
  if (settings.mode !== 5) throw new SecondaryDataError(`Secondary data is fetched for Mode 5 (secondary data) projects only. This project was approved in Mode ${settings.mode}.`, 409, "NOT_MODE_5");
  const route = routeDepartment(settings.department);
  const routing: StoredRouting = { ...route, offeredKeysHash: offeredKeysHash(route) };

  const [chapterThree, chapterFour] = await Promise.all([
    db.generationCheckpoint.findUnique({ where: { projectId_chapterNumber: { projectId: project.id, chapterNumber: 3 } }, select: { status: true, fullOutput: true } }),
    db.generationCheckpoint.findUnique({ where: { projectId_chapterNumber: { projectId: project.id, chapterNumber: 4 } }, select: { id: true } }),
  ]);
  if (chapterFour) throw new SecondaryDataError(CHAPTER_FOUR_STARTED, 409, "GENERATION_STARTED");
  const aiText = chapterThree?.status === "COMPLETED" ? chapterThree.fullOutput?.trim() : null;
  if (!aiText) throw new SecondaryDataError("Chapter 3 must be written first: the variables and the period are read from it.", 409, "CHAPTER_3_NOT_READY");
  // Chapter review: the model is read from the COO-approved Chapter 3 when there is one.
  const chapterText =
    (await loadChapterTexts(project.id, [3], "canonical")
      .then((t) => t.chapters[0]?.text.trim() || null)
      .catch(() => null)) ?? aiText;

  const chapterThreeHash = crypto.createHash("sha256").update(chapterText).digest("hex");
  const saved = await savedModelReading(project.id);
  if (saved && saved.chapterThreeHash === chapterThreeHash && saved.offeredKeysHash === routing.offeredKeysHash) {
    return { project, routing, chapterThreeHash, spec: saved.spec, specReused: true, specCostNaira: 0 };
  }

  const started = new Date(Date.now() - 1_000);
  let spec: ModelSpec;
  let specCostNaira = 0;
  try {
    spec = await extractModelSpec(chapterText, {
      domains: routing.domains,
      department: routing.matched ?? routing.department,
      usage: { projectId: project.id, subsystem: SECONDARY_DATA_SUBSYSTEM, step: "read_model_spec", chapterNumber: 3 },
    });
  } catch (error) {
    if (error instanceof ModelSpecError) throw new SecondaryDataError(`${error.message} The COO checks Chapter 3.`, 409, "NO_MODEL");
    if (error instanceof AnthropicError) throw new SecondaryDataError("Chapter 3 could not be read just now. Try again in a minute.", 503);
    throw error;
  } finally {
    specCostNaira = await costSince(project.id, started).catch(() => 0);
  }
  const reading: SavedModelReading = { chapterThreeHash, offeredKeysHash: routing.offeredKeysHash, spec, costNaira: specCostNaira, savedAt: new Date().toISOString() };
  const value = JSON.stringify(reading);
  // Paid for: a failed save only costs a second reading next time.
  await db.setting.upsert({ where: { key: modelReadingKey(project.id) }, create: { key: modelReadingKey(project.id), value }, update: { value } }).catch((error) => {
    console.warn(`[secondary-data] ${project.projectId}: the model reading could not be saved`, (error as Error).message);
  });
  return { project, routing, chapterThreeHash, spec, specReused: false, specCostNaira };
}

export async function runSecondaryDataFetch(projectDbId: string, actor: { userId: string; role: "WORKER" | "ADMIN" }): Promise<LatestSecondaryData & { projectCode: string }> {
  const { project, routing, chapterThreeHash, spec, specReused, specCostNaira } = await prepareModel(projectDbId);

  const result = await fetchSecondaryData(spec, { cache: settingSeriesCache, routing });
  if (!result.dataset.columns.some((c) => c.source)) {
    const permanent = result.missing.every((m) => isPermanentMissing(m.code));
    throw new SecondaryDataError(permanent ? NOTHING_FETCHED_TEXT.permanent : NOTHING_FETCHED_TEXT.retryable, 502, "NOTHING_FETCHED", {
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
    routing,
  };

  return storeDataset(project, stored, actor, `${project.projectId} secondary data ${result.dataset.start}-${result.dataset.end}.csv`);
}

/**
 * The specialist's own dataset, when the sources cannot supply the model's
 * variables: checked against the model Chapter 3 specifies (the same model
 * reading a fetch uses), then kept exactly as a fetched one is, replacing it.
 * Chapters 4 and 5 are written from it; the orchestrator sees "the dataset
 * exists" the moment it is stored.
 */
export async function uploadSecondaryData(
  projectDbId: string,
  actor: { userId: string; role: "WORKER" | "ADMIN" },
  input: { csv: string; source: string }
): Promise<LatestSecondaryData & { projectCode: string }> {
  const source = input.source.replace(/\s+/g, " ").trim();
  if (source.length < 3) throw new SecondaryDataError(UPLOAD_SOURCE_REQUIRED, 400, "SOURCE_REQUIRED");
  if (source.length > MAX_UPLOAD_SOURCE) throw new SecondaryDataError(`Keep "where the data comes from" under ${MAX_UPLOAD_SOURCE} characters.`, 400, "SOURCE_REQUIRED");
  if (input.csv.length > MAX_UPLOAD_CHARS) throw new SecondaryDataError(UPLOAD_TEXT.tooLarge, 413, "UPLOAD_INVALID");

  const { project, routing, chapterThreeHash, spec, specReused, specCostNaira } = await prepareModel(projectDbId);
  const previous = await latestSecondaryData(project.id);
  let parsed: ReturnType<typeof parseUploadedDataset>;
  try {
    parsed = parseUploadedDataset(input.csv, spec, { sourceDescription: source, previous: previous?.data.chapterThreeHash === chapterThreeHash ? previous.data.dataset : null });
  } catch (error) {
    if (error instanceof UploadedDatasetError) throw new SecondaryDataError(error.message, 400, "UPLOAD_INVALID", { problems: error.problems });
    throw error;
  }
  const { dataset, missing } = parsed;
  const stored: StoredSecondaryData = {
    version: 1,
    fetchedAt: new Date().toISOString(),
    fetchedBy: actor,
    chapterThreeHash,
    spec,
    specReused,
    specCostNaira,
    dataset,
    csv: datasetCsv(dataset),
    notes: [...datasetNotes(dataset), ...spec.notes],
    missing,
    stats: describeDataset(dataset),
    correlation: correlationMatrix(dataset),
    requests: [],
    routing,
    origin: "upload",
    uploadSource: source,
  };
  return storeDataset(project, stored, actor, `${project.projectId} secondary data ${dataset.start}-${dataset.end} (supplied).csv`);
}

/** Keeps a dataset: the CSV in the private store and its record on a ProjectFile, replacing the previous one, unless Chapter 4 has started. */
async function storeDataset(
  project: { id: string; projectId: string },
  stored: StoredSecondaryData,
  actor: { userId: string; role: "WORKER" | "ADMIN" },
  fileName: string
): Promise<LatestSecondaryData & { projectCode: string }> {
  const bytes = new Uint8Array(Buffer.from(stored.csv, "utf8"));
  const pathname = buildPrivatePath({ projectDbId: project.id, purpose: "source", targetId: PATH_TARGET, random: crypto.randomBytes(12).toString("hex"), ext: "csv" });
  const { url } = await putPrivateFile(pathname, bytes, "text/csv");

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
