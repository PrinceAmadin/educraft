import crypto from "crypto";

/**
 * Google Drive v3 REST client — raw fetch, no `googleapis` dependency. Used
 * to deliver verified research PDFs to the client: "here are your actual
 * papers."
 *
 * Authenticated via OAuth refresh-token delegation (acting AS the founder's
 * own Google account), not a service account: service accounts carry zero
 * storage quota on a personal (non-Workspace) Drive, so every upload gets
 * rejected with a 403 even inside a folder they've been made an Editor on —
 * Google's own fix for this is exactly OAuth delegation or a Shared Drive,
 * and Shared Drives require Workspace, which EduCraft doesn't have.
 */

const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export class GoogleDriveError extends Error {}

function oauthCredentials(): { clientId: string; clientSecret: string; refreshToken: string } {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Google OAuth env vars are not set (GOOGLE_OAUTH_CLIENT_ID/CLIENT_SECRET/REFRESH_TOKEN)");
  }
  return { clientId, clientSecret, refreshToken };
}

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

/** Exchanges the long-lived refresh token for a short-lived access token, caching until near expiry. */
async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.accessToken;

  const { clientId, clientSecret, refreshToken } = oauthCredentials();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.access_token) {
    throw new GoogleDriveError(json?.error_description || `Google auth failed (${res.status})`);
  }

  cachedToken = { accessToken: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return cachedToken.accessToken;
}

async function driveFetch(path: string, init?: RequestInit): Promise<any> {
  const token = await getAccessToken();
  const res = await fetch(`${DRIVE_API_BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new GoogleDriveError(`Drive request failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return res.status === 204 ? null : res.json();
}

/** Permanently deletes a file or folder by id. */
export async function deleteFile(fileId: string): Promise<void> {
  await driveFetch(`/files/${fileId}`, { method: "DELETE" });
}

function researchRootFolderId(): string {
  const id = process.env.GOOGLE_DRIVE_RESEARCH_FOLDER_ID;
  if (!id) throw new Error("GOOGLE_DRIVE_RESEARCH_FOLDER_ID is not set");
  return id;
}

/** Finds a project's subfolder under the research root, creating (and sharing it link-viewable) if absent. */
export async function ensureProjectFolder(projectCode: string): Promise<{ folderId: string; webViewLink: string }> {
  const root = researchRootFolderId();
  const q = `'${root}' in parents and name = '${projectCode}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const existing = await driveFetch(`/files?q=${encodeURIComponent(q)}&fields=files(id,webViewLink)`);
  if (existing?.files?.[0]) return { folderId: existing.files[0].id, webViewLink: existing.files[0].webViewLink };

  const created = await driveFetch("/files?fields=id,webViewLink", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: projectCode, mimeType: "application/vnd.google-apps.folder", parents: [root] }),
  });

  // Anyone with the link can view — files inside inherit this, so it's set once per project folder.
  await driveFetch(`/files/${created.id}/permissions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  });

  return { folderId: created.id, webViewLink: created.webViewLink };
}

/** Downloads a PDF from an open-access URL and uploads it into the given Drive folder. */
export async function uploadPdfToFolder(
  folderId: string,
  fileName: string,
  pdfUrl: string
): Promise<string | null> {
  let bytes: Buffer;
  try {
    const pdfRes = await fetch(pdfUrl, {
      headers: { Accept: "application/pdf" },
      signal: AbortSignal.timeout(25_000),
    });
    if (!pdfRes.ok) {
      console.error("[google-drive] PDF fetch not ok", pdfUrl, pdfRes.status);
      return null;
    }
    bytes = Buffer.from(await pdfRes.arrayBuffer());
  } catch (error) {
    console.error("[google-drive] PDF fetch threw", pdfUrl, error);
    return null;
  }
  // Judge by the bytes, not the header — some hosts serve real PDFs as
  // application/octet-stream, others serve an HTML login page labelled PDF.
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") {
    console.error("[google-drive] URL did not serve a PDF", pdfUrl);
    return null;
  }

  const boundary = `educraft-${crypto.randomBytes(8).toString("hex")}`;
  const metadata = JSON.stringify({ name: fileName, parents: [folderId] });

  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`),
    bytes,
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  const token = await getAccessToken();
  const res = await fetch(`${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[google-drive] upload failed", res.status, body.slice(0, 300));
    return null;
  }
  const json = await res.json().catch(() => null);
  return json?.id ?? null;
}

/**
 * Creates a Google Doc in the folder from HTML (Drive converts it on upload).
 * It inherits the folder's anyone-with-the-link view permission.
 */
export async function createDocInFolder(
  folderId: string,
  name: string,
  html: string
): Promise<{ id: string; webViewLink: string }> {
  const boundary = `educraft-${crypto.randomBytes(8).toString("hex")}`;
  const metadata = JSON.stringify({
    name,
    parents: [folderId],
    mimeType: "application/vnd.google-apps.document",
  });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n`),
    Buffer.from(html, "utf8"),
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  const token = await getAccessToken();
  const res = await fetch(`${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id,webViewLink`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.id) {
    throw new GoogleDriveError(`Could not create the Google Doc (${res.status})`);
  }
  return { id: json.id, webViewLink: json.webViewLink };
}
