/**
 * Thin wrapper over the Zotero Web API v3 for EduCraft's organizational
 * group library. Raw fetch, no SDK — same style as the Paystack client.
 */

const ZOTERO_BASE_URL = "https://api.zotero.org";

function groupId(): string {
  const id = process.env.ZOTERO_GROUP_ID;
  if (!id) throw new Error("ZOTERO_GROUP_ID is not set");
  return id;
}

function apiKey(): string {
  const key = process.env.ZOTERO_API_KEY;
  if (!key) throw new Error("ZOTERO_API_KEY is not set");
  return key;
}

export class ZoteroError extends Error {}

async function zoteroFetchRaw(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${ZOTERO_BASE_URL}/groups/${groupId()}${path}`, {
    ...init,
    headers: {
      "Zotero-API-Key": apiKey(),
      "Zotero-API-Version": "3",
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ZoteroError(`Zotero request failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return res;
}

async function zoteroFetch(path: string, init?: RequestInit): Promise<any> {
  const res = await zoteroFetchRaw(path, init);
  if (res.status === 204) return null;
  return res.json();
}

/** Permanently deletes a collection (and its items' membership in it). */
export async function deleteCollection(collectionKey: string): Promise<void> {
  const res = await zoteroFetchRaw(`/collections/${collectionKey}`);
  const version = res.headers.get("last-modified-version");
  await zoteroFetchRaw(`/collections/${collectionKey}`, {
    method: "DELETE",
    headers: version ? { "If-Unmodified-Since-Version": version } : {},
  });
}

/** Creates one collection and returns its key. */
export async function createCollection(name: string): Promise<string> {
  const json = await zoteroFetch("/collections", {
    method: "POST",
    body: JSON.stringify([{ name }]),
  });
  const created = json?.successful?.["0"];
  if (!created?.key) throw new ZoteroError("Zotero did not return a collection key");
  return created.key;
}

export interface ZoteroItemInput {
  title: string;
  authors: string; // "Family, G.; Family2, G2." — split on ";" into creators
  doi: string;
  year: number | null;
  journal: string | null;
  abstract: string | null;
}

function parseAuthors(authors: string): { creatorType: "author"; firstName: string; lastName: string }[] {
  return authors
    .split(";")
    .map((a) => a.trim())
    .filter(Boolean)
    .map((a) => {
      const [lastName, firstName] = a.split(",").map((s) => s.trim());
      return { creatorType: "author" as const, lastName: lastName || a, firstName: firstName || "" };
    });
}

/**
 * Imports items into a collection, batched by the caller (Zotero accepts up
 * to 50 per request; callers here send far fewer to stay inside a single
 * step's time budget). Returns each input's assigned Zotero item key, in order.
 */
export async function importItems(
  collectionKey: string,
  items: ZoteroItemInput[]
): Promise<(string | null)[]> {
  if (items.length === 0) return [];

  const payload = items.map((item) => ({
    itemType: "journalArticle",
    title: item.title,
    creators: parseAuthors(item.authors),
    abstractNote: item.abstract ?? "",
    publicationTitle: item.journal ?? "",
    date: item.year ? String(item.year) : "",
    DOI: item.doi,
    url: `https://doi.org/${item.doi}`,
    collections: [collectionKey],
  }));

  const json = await zoteroFetch("/items", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const successful: Record<string, { key: string }> = json?.successful ?? {};
  return items.map((_, i) => successful[String(i)]?.key ?? null);
}

/**
 * Attaches the Unpaywall-resolved PDF as a linked-URL child attachment —
 * the public Zotero API can't trigger the desktop client's automatic PDF
 * fetch, so this is what stands in for "PDF retrieval": every item ends up
 * with a working link to its actual full text.
 */
export async function addLinkedPdfAttachment(parentItemKey: string, pdfUrl: string): Promise<void> {
  await zoteroFetch("/items", {
    method: "POST",
    body: JSON.stringify([
      {
        itemType: "attachment",
        linkMode: "linked_url",
        parentItem: parentItemKey,
        url: pdfUrl,
        title: "Full Text PDF",
        contentType: "application/pdf",
      },
    ]),
  });
}
