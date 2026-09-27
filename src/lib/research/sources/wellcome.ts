/**
 * Wellcome Collection catalogue API (no key; data it creates is CC0). A
 * medicine and public-health collection, so the planner aims only health
 * points here. Their website blocks AI crawlers; this is the public API, called
 * by our server, never by Claude.
 */

import { ARCHIVE_SOURCES, plainText, type ArchiveRecord } from "@/lib/research/source-policy";
import { politeFetchJson } from "@/lib/research/sources/http";

interface RawWork {
  id?: string;
  title?: string;
  referenceNumber?: string;
  description?: string;
  workType?: { label?: string };
  production?: { dates?: { label?: string }[] }[];
}

export async function searchWellcome(query: string, pageSize = 8): Promise<ArchiveRecord[]> {
  const params = new URLSearchParams({ query, pageSize: String(pageSize), include: "production" });
  const json = await politeFetchJson<{ results?: RawWork[] }>(`https://api.wellcomecollection.org/catalogue/v2/works?${params}`);
  const out: ArchiveRecord[] = [];
  for (const w of json.results ?? []) {
    const id = typeof w.id === "string" && /^[a-z0-9]{6,12}$/.test(w.id) ? w.id : null;
    const title = plainText(w.title, 300);
    if (!id || !title) continue;
    const date = plainText(w.production?.[0]?.dates?.[0]?.label, 40);
    out.push({
      source: "WELLCOME",
      title,
      date,
      holder: `Wellcome Collection${w.workType?.label ? ` (${w.workType.label})` : ""}`,
      reference: plainText(w.referenceNumber, 80),
      url: `https://wellcomecollection.org/works/${id}`,
      recordType: ARCHIVE_SOURCES.WELLCOME.recordType,
      description: plainText(w.description, 400),
    });
  }
  return out;
}
