/**
 * The National Archives (UK) Discovery catalogue API: Colonial Office files on
 * Nigeria, e.g. "Taxation in Nigeria", 1934–1943, CO 583/200/6. Open
 * Government Licence (commercial use allowed), at most one request a second
 * and 3,000 a day. SWITCHED OFF (source-policy.ts) until The National Archives
 * answers our registration email: their guidance asks API users to register
 * the IP address they call from, and Vercel has no fixed one.
 */

import { ARCHIVE_SOURCES, plainText, type ArchiveRecord } from "@/lib/research/source-policy";
import { politeFetch, SourceHttpError } from "@/lib/research/sources/http";

interface RawRecord {
  id?: string;
  reference?: string;
  title?: string;
  description?: string;
  coveringDates?: string;
  heldBy?: string[];
}

export async function searchNationalArchives(query: string, pageSize = 8): Promise<ArchiveRecord[]> {
  if (!ARCHIVE_SOURCES.NATIONAL_ARCHIVES.enabled) throw new SourceHttpError("The National Archives is switched off until registration", null);
  const params = new URLSearchParams({ "sps.searchQuery": query, "sps.resultsPageSize": String(pageSize) });
  const res = await politeFetch(`https://discovery.nationalarchives.gov.uk/API/search/records?${params}`);
  if (!res.ok) throw new SourceHttpError(`discovery.nationalarchives.gov.uk answered ${res.status}`, res.status);
  const json = (await res.json()) as { records?: RawRecord[] };
  const out: ArchiveRecord[] = [];
  for (const r of json.records ?? []) {
    const id = typeof r.id === "string" && /^[A-Za-z0-9_-]{4,60}$/.test(r.id) ? r.id : null;
    const title = plainText(r.title ?? r.description, 300);
    if (!id || !title) continue;
    out.push({
      source: "NATIONAL_ARCHIVES",
      title,
      date: plainText(r.coveringDates, 40),
      holder: plainText(r.heldBy?.[0], 120) ?? "The National Archives, Kew",
      reference: plainText(r.reference, 80),
      url: `https://discovery.nationalarchives.gov.uk/details/r/${id}`,
      recordType: ARCHIVE_SOURCES.NATIONAL_ARCHIVES.recordType,
      description: plainText(r.description, 400),
    });
  }
  return out;
}
