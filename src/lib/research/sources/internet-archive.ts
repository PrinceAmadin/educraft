/**
 * Internet Archive catalogue search (advancedsearch.php). Access "is granted
 * for scholarship and research purposes only": we read catalogue records and
 * cite them; nothing is downloaded or copied.
 */

import { ARCHIVE_SOURCES, plainText, type ArchiveRecord } from "@/lib/research/source-policy";
import { politeFetchJson } from "@/lib/research/sources/http";

interface RawDoc {
  identifier?: string;
  title?: string | string[];
  date?: string;
  year?: string | number;
  creator?: string | string[];
  publisher?: string | string[];
  description?: string | string[];
}

const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export async function searchInternetArchive(query: string, fromYear?: number | null, toYear?: number | null, rows = 8): Promise<ArchiveRecord[]> {
  const terms = [`(${query.replace(/[()]/g, " ")})`, "mediatype:texts"];
  if (fromYear || toYear) terms.push(`year:[${fromYear ?? 1600} TO ${toYear ?? new Date().getUTCFullYear()}]`);
  const params = new URLSearchParams({ q: terms.join(" AND "), rows: String(rows), output: "json" });
  for (const f of ["identifier", "title", "date", "year", "creator", "publisher", "description"]) params.append("fl[]", f);
  const json = await politeFetchJson<{ response?: { docs?: RawDoc[] } }>(`https://archive.org/advancedsearch.php?${params}`);
  const out: ArchiveRecord[] = [];
  for (const d of json.response?.docs ?? []) {
    const id = typeof d.identifier === "string" && /^[A-Za-z0-9._-]{1,200}$/.test(d.identifier) ? d.identifier : null;
    const title = plainText(first(d.title), 300);
    if (!id || !title) continue;
    const date = plainText(d.date ? String(d.date).slice(0, 10) : d.year ? String(d.year) : null, 20);
    const by = plainText(first(d.creator) ?? first(d.publisher), 120);
    out.push({
      source: "INTERNET_ARCHIVE",
      title,
      date,
      holder: by ? `${by} (Internet Archive)` : "Internet Archive",
      reference: id,
      url: `https://archive.org/details/${id}`,
      recordType: ARCHIVE_SOURCES.INTERNET_ARCHIVE.recordType,
      description: plainText(first(d.description), 400),
    });
  }
  return out;
}
