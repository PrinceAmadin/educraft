/**
 * Unpaywall resolves a DOI to a real, fetchable open-access PDF location.
 * This decides a reference's delivery track, not whether it survives: a
 * paper with a working free PDF goes on the open-access track (PDF delivered
 * via Drive), anything else stays as a verified reference-only (paywalled)
 * entry. Unpaywall's own "is_oa: true" is not trusted blindly — its data can
 * be stale (a paper delisted, a host now blocking automated fetches) — so
 * each candidate PDF URL is actually probed for PDF bytes.
 */

const UNPAYWALL_BASE_URL = "https://api.unpaywall.org/v2";
const LOOKUP_TIMEOUT_MS = 10_000;
const PROBE_TIMEOUT_MS = 8_000;
/** Distinct PDF URLs probed per paper — bounded so one step stays inside its time budget. */
const MAX_PROBES = 3;

function contactEmail(): string {
  return process.env.RESEARCH_CONTACT_EMAIL || "educraft611@gmail.com";
}

export interface OpenAccessResult {
  isOpenAccess: boolean;
  pdfUrl: string | null;
}

const PAYWALLED: OpenAccessResult = { isOpenAccess: false, pdfUrl: null };

/** Probes a URL with a tiny range request and confirms it actually serves a PDF. */
async function verifyServesPdf(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/pdf", Range: "bytes=0-1023" },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!res.ok && res.status !== 206) return false;
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("pdf")) return true;
    // Some hosts omit/mislabel content-type — fall back to the PDF magic bytes.
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.subarray(0, 5).toString("latin1") === "%PDF-";
  } catch {
    return false;
  }
}

/**
 * `extraPdfUrls` are other known PDF locations for the same DOI (e.g.
 * OpenAlex's) — probed after Unpaywall's own, since the two indexes don't
 * always know about the same copies.
 */
export async function resolveOpenAccessPdf(doi: string, extraPdfUrls: (string | null)[] = []): Promise<OpenAccessResult> {
  let json: any = null;
  try {
    const res = await fetch(
      `${UNPAYWALL_BASE_URL}/${encodeURIComponent(doi)}?email=${encodeURIComponent(contactEmail())}`,
      { signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) }
    );
    if (res.ok) json = await res.json().catch(() => null);
  } catch {
    // Unpaywall unreachable — the extra URLs still get their chance.
  }

  // Only a direct PDF link counts — a landing/abstract page is not "the PDF".
  // Unpaywall's best location first, then its other OA copies, then extras.
  const candidates: string[] = [];
  const push = (url: unknown) => {
    if (typeof url === "string" && url && !candidates.includes(url)) candidates.push(url);
  };
  if (json?.is_oa) {
    push(json.best_oa_location?.url_for_pdf);
    for (const loc of json.oa_locations ?? []) push(loc?.url_for_pdf);
  }
  for (const url of extraPdfUrls) push(url);

  for (const url of candidates.slice(0, MAX_PROBES)) {
    if (await verifyServesPdf(url)) return { isOpenAccess: true, pdfUrl: url };
  }
  return PAYWALLED;
}
