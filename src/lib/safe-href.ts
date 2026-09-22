/**
 * Stored links (a worker's pasted file link, an intake attachment) are data,
 * not code. Only plain web links may ever become an `href`: a `javascript:` or
 * `data:` URL rendered as a link would run in an admin's session. React 18
 * does not block those, so every stored link goes through here.
 */

/** The link when it is an http(s) URL, else null (render the name as plain text). */
export function safeHref(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const { protocol } = new URL(url);
    return protocol === "https:" || protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

/** True for an https URL: what new stored links must be. */
export function isHttpsUrl(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}
