/**
 * The Supreme Court of Nigeria's own judgment record: the data service behind
 * supremecourt.gov.ng (robots.txt allows everything; no terms page). It holds
 * about 180 judgments (none from 2015 to 2021) and searches by party name,
 * suit number and date only, so it CONFIRMS cases found elsewhere; it cannot
 * find cases on a subject. Every judgment carries its PDF.
 */

import { OFFICIAL_LOOKUPS_PER_CASE, matchJudgment, partyTokens } from "@/lib/research/source-policy";
import { politeFetch, politeFetchJson, SourceHttpError } from "@/lib/research/sources/http";

const BASE = "https://supreme-cms.supremecourt.gov.ng/api/v1.0";
/** The court's PDFs live on its own S3 bucket; nothing else is downloaded. */
const PDF_HOST = "scnwebsites3.s3.af-south-1.amazonaws.com";
export const MAX_JUDGMENT_PDF_BYTES = 25 * 1024 * 1024;

export interface CourtJudgment {
  caseId: number;
  suitNumber: string | null;
  petitioner: string | null;
  respondent: string | null;
  /** YYYY-MM-DD */
  date: string | null;
  year: number | null;
  leadJudge: string | null;
  panel: string | null;
  citation: string | null;
  pdfUrl: string | null;
}

interface RawJudgment {
  case_id: number;
  suitNo?: string | null;
  petitioner?: string | null;
  respondent?: string | null;
  dateJudgement?: string | null;
  year?: number | string | null;
  leadJudgeName?: string | null;
  mainjudge?: string | null;
  judgeName?: string | null;
  citation?: string | null;
  pdfFile?: string | null;
}

function clean(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim();
  return s ? s : null;
}

function toJudgment(r: RawJudgment): CourtJudgment {
  const date = clean(r.dateJudgement);
  const yearNum = typeof r.year === "number" ? r.year : Number.parseInt(String(r.year ?? date?.slice(0, 4) ?? ""), 10);
  const pdf = clean(r.pdfFile);
  return {
    caseId: r.case_id,
    suitNumber: clean(r.suitNo),
    petitioner: clean(r.petitioner),
    respondent: clean(r.respondent),
    date,
    year: Number.isFinite(yearNum) ? yearNum : null,
    leadJudge: clean(r.leadJudgeName) ?? clean(r.mainjudge),
    panel: clean(r.judgeName),
    citation: clean(r.citation),
    pdfUrl: pdf && isCourtPdf(pdf) ? pdf : null,
  };
}

export function isCourtPdf(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === PDF_HOST && u.pathname.toLowerCase().endsWith(".pdf");
  } catch {
    return false;
  }
}

/** Judgments whose parties contain `party`, optionally within a range of years. */
export async function searchByParty(party: string, fromYear?: number | null, toYear?: number | null): Promise<CourtJudgment[]> {
  const params = new URLSearchParams({ caseTitle: party });
  if (fromYear) params.set("judgmentDate", `${fromYear}-01-01`);
  if (toYear) params.set("judgmentDate2", `${toYear}-12-31`);
  const json = await politeFetchJson<{ success?: boolean; data?: RawJudgment[] }>(`${BASE}/judgment-new/search?${params}`);
  return (json.data ?? []).filter((r) => r && typeof r.case_id === "number").map(toJudgment);
}

export interface Confirmation {
  judgment: CourtJudgment | null;
  lookups: number;
}

/**
 * Looks a found case up in the court's record by its most distinctive party
 * names (at most OFFICIAL_LOOKUPS_PER_CASE lookups). Confirmed only when a
 * record's parties contain every distinctive name and the year agrees within
 * a year. A lookup that fails is treated as "not confirmed", never as an error.
 */
export async function confirmCase(caseName: string, year: number | null): Promise<Confirmation> {
  const tokens = partyTokens(caseName).slice(0, OFFICIAL_LOOKUPS_PER_CASE);
  let lookups = 0;
  for (const token of tokens) {
    lookups++;
    let records: CourtJudgment[];
    try {
      records = await searchByParty(token, year ? year - 1 : null, year ? year + 1 : null);
    } catch (error) {
      if (error instanceof SourceHttpError) continue;
      throw error;
    }
    const matches = records.filter((r) => matchJudgment(caseName, year, r));
    if (matches.length > 0) {
      matches.sort((a, b) => Math.abs((a.year ?? 0) - (year ?? a.year ?? 0)) - Math.abs((b.year ?? 0) - (year ?? b.year ?? 0)));
      return { judgment: matches[0], lookups };
    }
  }
  return { judgment: null, lookups };
}

/** The judgment's PDF from the court's bucket, refused unless it is a real PDF under the size cap. */
export async function downloadJudgmentPdf(url: string): Promise<Uint8Array> {
  if (!isCourtPdf(url)) throw new SourceHttpError("Not a Supreme Court judgment PDF", null);
  const res = await politeFetch(url, { timeoutMs: 30_000, accept: "application/pdf" });
  if (!res.ok) throw new SourceHttpError(`The judgment PDF answered ${res.status}`, res.status);
  const length = Number(res.headers.get("content-length") ?? 0);
  if (length > MAX_JUDGMENT_PDF_BYTES) throw new SourceHttpError("The judgment PDF is over 25 MB", res.status);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > MAX_JUDGMENT_PDF_BYTES) throw new SourceHttpError("The judgment PDF is over 25 MB", res.status);
  const head = new TextDecoder().decode(bytes.slice(0, 5));
  if (head !== "%PDF-") throw new SourceHttpError("The judgment file is not a PDF", res.status);
  return bytes;
}

/** "Chirunim Elechi v. The State" from the record's parties. */
export function judgmentTitle(j: CourtJudgment): string {
  const title = (s: string | null) => (s ? s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()) : "");
  return [title(j.petitioner), title(j.respondent)].filter(Boolean).join(" v. ");
}
