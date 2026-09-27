/**
 * The points a source stage searches (D3b), as stored in ProjectBrief.points.
 * Pure: read by the stage, the card view and the chapter inputs.
 */

import type { Prisma } from "@prisma/client";
import type { ArchiveAttempt } from "./archive-fetcher";
import type { FoundCase } from "./legal-source-fetcher";
import type { ArchiveRecord } from "./source-policy";

export interface StoredPoint {
  index: number;
  text: string;
  /** History: the planned catalogue searches, in order. */
  attempts: ArchiveAttempt[];
  /** Searches spent on this point. */
  searches: number;
  outcome: "PENDING" | "FOUND" | "NONE";
  queries: string[];
  /** Law: cases the search step found, waiting for the confirm step. */
  pendingCases?: FoundCase[];
  /** History: records the latest query round returned, waiting for the judge. */
  pendingRecords?: ArchiveRecord[];
  note?: string;
}

export function readPoints(json: Prisma.JsonValue | null | undefined): StoredPoint[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((raw, i) => {
    const p = (raw ?? {}) as Partial<StoredPoint>;
    if (typeof p.text !== "string") return [];
    return [
      {
        index: typeof p.index === "number" ? p.index : i,
        text: p.text,
        attempts: Array.isArray(p.attempts) ? p.attempts : [],
        searches: typeof p.searches === "number" ? p.searches : 0,
        outcome: p.outcome === "FOUND" || p.outcome === "NONE" ? p.outcome : "PENDING",
        queries: Array.isArray(p.queries) ? p.queries.filter((q): q is string => typeof q === "string") : [],
        ...(Array.isArray(p.pendingCases) ? { pendingCases: p.pendingCases } : {}),
        ...(Array.isArray(p.pendingRecords) ? { pendingRecords: p.pendingRecords } : {}),
        ...(typeof p.note === "string" ? { note: p.note } : {}),
      },
    ];
  });
}
