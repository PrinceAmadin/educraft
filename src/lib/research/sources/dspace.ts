/**
 * University and national repositories running DSpace 7 (the same REST API).
 * UNILAG and ABU are searched. The National Library of Nigeria and the
 * University of Ibadan are listed but switched off in source-policy.ts: their
 * terms forbid commercial use without written permission.
 */

import { ARCHIVE_SOURCES, plainText, type ArchiveRecord, type ArchiveSourceKey } from "@/lib/research/source-policy";
import { politeFetchJson, SourceHttpError } from "@/lib/research/sources/http";

interface Repository {
  api: string;
  site: string;
  holder: string;
}

const REPOSITORIES: Partial<Record<ArchiveSourceKey, Repository>> = {
  UNILAG: { api: "https://api-ir.unilag.edu.ng/server/api", site: "https://ir.unilag.edu.ng", holder: "University of Lagos Repository" },
  ABU: { api: "https://kubanni-backend.abu.edu.ng/server/api", site: "https://kubanni.abu.edu.ng", holder: "Ahmadu Bello University, Kashim Ibrahim Library (Kubanni)" },
  NATIONAL_LIBRARY: { api: "https://nigeriareposit.nln.gov.ng/server/api", site: "https://nigeriareposit.nln.gov.ng", holder: "National Library of Nigeria, National Repository" },
  IBADAN: { api: "https://repository.ui.edu.ng/server/api", site: "https://repository.ui.edu.ng", holder: "University of Ibadan Repository" },
};

type Meta = Record<string, { value?: string }[] | undefined>;

interface RawItem {
  uuid?: string;
  handle?: string | null;
  name?: string;
  metadata?: Meta;
}

const meta = (m: Meta | undefined, key: string) => m?.[key]?.map((x) => x.value).filter(Boolean).join("; ") ?? "";

export async function searchDspace(source: ArchiveSourceKey, query: string, size = 8): Promise<ArchiveRecord[]> {
  const repo = REPOSITORIES[source];
  if (!repo) throw new SourceHttpError(`${source} is not a DSpace repository`, null);
  if (!ARCHIVE_SOURCES[source].enabled) throw new SourceHttpError(`${ARCHIVE_SOURCES[source].label} is switched off`, null);
  const params = new URLSearchParams({ query, dsoType: "ITEM", size: String(size) });
  const json = await politeFetchJson<{
    _embedded?: { searchResult?: { _embedded?: { objects?: { _embedded?: { indexableObject?: RawItem } }[] } } };
  }>(`${repo.api}/discover/search/objects?${params}`, 25_000);
  const out: ArchiveRecord[] = [];
  for (const o of json._embedded?.searchResult?._embedded?.objects ?? []) {
    const it = o._embedded?.indexableObject;
    const uuid = typeof it?.uuid === "string" && /^[0-9a-f-]{36}$/i.test(it.uuid) ? it.uuid : null;
    const title = plainText(it?.name, 300);
    if (!it || !uuid || !title) continue;
    const handle = typeof it.handle === "string" && /^[0-9.]+\/[0-9]+$/.test(it.handle) ? it.handle : null;
    const type = plainText(meta(it.metadata, "dc.type"), 60);
    const author = plainText(meta(it.metadata, "dc.contributor.author"), 120);
    out.push({
      source,
      title,
      date: plainText(meta(it.metadata, "dc.date.issued"), 20),
      holder: repo.holder,
      reference: handle ? `hdl:${handle}` : null,
      url: handle ? `${repo.site}/handle/${handle}` : `${repo.site}/items/${uuid}`,
      recordType: ARCHIVE_SOURCES[source].recordType,
      description: plainText([author ? `By ${author}.` : "", type ? `${type}.` : "", meta(it.metadata, "dc.description.abstract")].join(" "), 400),
    });
  }
  return out;
}
