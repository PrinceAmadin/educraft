/**
 * UK Hansard (Open Parliament Licence v3.0: commercial use allowed, with the
 * attribution "Contains Parliamentary information licensed under the Open
 * Parliament Licence v3.0"). Searches debate titles, e.g. "Northern Nigeria
 * (Native Employes' Taxation)", Commons, 15 December 1924.
 */

import { ARCHIVE_SOURCES, plainText, type ArchiveRecord } from "@/lib/research/source-policy";
import { politeFetchJson } from "@/lib/research/sources/http";

export const HANSARD_ATTRIBUTION = "Contains Parliamentary information licensed under the Open Parliament Licence v3.0.";

interface RawDebate {
  DebateSection?: string;
  SittingDate?: string;
  House?: string;
  Title?: string;
  DebateSectionExtId?: string;
}

export async function searchHansard(query: string, fromYear?: number | null, toYear?: number | null, take = 8): Promise<ArchiveRecord[]> {
  const params = new URLSearchParams({ "queryParameters.searchTerm": query, "queryParameters.take": String(take) });
  if (fromYear) params.set("queryParameters.startDate", `${fromYear}-01-01`);
  if (toYear) params.set("queryParameters.endDate", `${toYear}-12-31`);
  const json = await politeFetchJson<{ Results?: RawDebate[] }>(`https://hansard-api.parliament.uk/search/debates.json?${params}`);
  const out: ArchiveRecord[] = [];
  for (const d of json.Results ?? []) {
    const title = plainText(d.Title, 300);
    const id = typeof d.DebateSectionExtId === "string" && /^[0-9a-f-]{36}$/i.test(d.DebateSectionExtId) ? d.DebateSectionExtId : null;
    const date = typeof d.SittingDate === "string" ? d.SittingDate.slice(0, 10) : null;
    const house = d.House === "Lords" ? "Lords" : "Commons";
    if (!title || !id || !date) continue;
    out.push({
      source: "HANSARD",
      title,
      date,
      holder: `UK Parliament, House of ${house}`,
      reference: `${house === "Lords" ? "HL" : "HC"} Deb ${date}`,
      url: `https://hansard.parliament.uk/${house}/${date}/debates/${id}`,
      recordType: ARCHIVE_SOURCES.HANSARD.recordType,
      description: plainText(d.DebateSection, 120),
    });
  }
  return out;
}
