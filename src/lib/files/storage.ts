import { createReadStream, promises as fs } from "fs";
import path from "path";
import { Readable } from "stream";
import { BlobNotFoundError, del, get, head, issueSignedToken } from "@vercel/blob";
import { handleUploadPresigned, type HandleUploadPresignedBody } from "@vercel/blob/client";
import { getVercelOidcToken } from "@vercel/oidc";
import { contentTypeFor } from "@/lib/files/policy";
import { parsePrivatePath } from "@/lib/files/paths";

/**
 * The ONLY code that touches the private file store (chapters, final
 * documents, message attachments). Nothing here is reachable by URL: files go
 * out through our download routes, which check who is asking first.
 *
 * Credentials, in order:
 *  1. PRIVATE_BLOB_READ_WRITE_TOKEN, when the store is connected with a token;
 *  2. otherwise the deployment's Vercel OIDC token with the store's id
 *     (PRIVATE_BLOB_STORE_ID, default the educraft-private store).
 * Every call passes its credentials explicitly. The SDK's own fallback would
 * otherwise reach for BLOB_READ_WRITE_TOKEN, the PUBLIC intake store, and a
 * private file must never land there. No credentials means an error, never a
 * fallback.
 *
 * Local development can use PRIVATE_FILES_DRIVER=local instead: files are kept
 * in .private-files/ (git-ignored). That driver refuses to run on Vercel.
 */

/** educraft-private, created 2026-09-23 (private access, iad1). Not a secret: useless without a credential. */
const DEFAULT_PRIVATE_STORE_ID = "store_5iS5bgfUBfa2KK30";

export class StorageNotConfigured extends Error {}

export type StorageDriver = "blob" | "local";

export function storageDriver(): StorageDriver {
  if (process.env.PRIVATE_FILES_DRIVER === "local") {
    if (process.env.VERCEL) throw new StorageNotConfigured("The local file driver is for development only");
    return "local";
  }
  return "blob";
}

function storeId(): string {
  return (process.env.PRIVATE_BLOB_STORE_ID || DEFAULT_PRIVATE_STORE_ID).trim();
}

const bareStoreId = (id: string) => id.replace(/^store_/, "").toLowerCase();

type BlobAuth = { token: string } | { oidcToken: string; storeId: string };

async function blobAuth(): Promise<BlobAuth> {
  const token = process.env.PRIVATE_BLOB_READ_WRITE_TOKEN?.trim();
  if (token) {
    // "vercel_blob_rw_<storeId>_<secret>": refuse a token for any other store.
    const tokenStore = token.split("_")[3]?.toLowerCase();
    if (!tokenStore || tokenStore !== bareStoreId(storeId())) {
      throw new StorageNotConfigured("PRIVATE_BLOB_READ_WRITE_TOKEN is not for the private store");
    }
    return { token };
  }
  let oidcToken = "";
  try {
    oidcToken = (await getVercelOidcToken()).trim();
  } catch {
    oidcToken = "";
  }
  if (!oidcToken) {
    throw new StorageNotConfigured("No credentials for the private file store (Vercel OIDC or PRIVATE_BLOB_READ_WRITE_TOKEN)");
  }
  return { oidcToken, storeId: storeId() };
}

// ── Local driver (development) ───────────────────────────────

const LOCAL_ROOT = path.join(process.cwd(), ".private-files");

function localPath(pathname: string): string {
  if (!parsePrivatePath(pathname)) throw new Error("Invalid private path");
  const full = path.join(LOCAL_ROOT, ...pathname.split("/"));
  if (!full.startsWith(LOCAL_ROOT + path.sep)) throw new Error("Invalid private path");
  return full;
}

export async function writeLocalFile(pathname: string, body: ReadableStream<Uint8Array>, maxBytes: number): Promise<number> {
  if (storageDriver() !== "local") throw new StorageNotConfigured("Not using the local driver");
  const target = localPath(pathname);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const handle = await fs.open(target, "wx"); // never overwrite
  let size = 0;
  try {
    const reader = body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error("File is too large");
      await handle.write(value);
    }
  } catch (error) {
    await handle.close();
    await fs.rm(target, { force: true });
    throw error;
  }
  await handle.close();
  return size;
}

// ── Common operations ────────────────────────────────────────

export interface StoredFileInfo {
  size: number;
  contentType: string;
  uploadedAt: Date;
  url: string;
}

function typeFromPath(pathname: string): string {
  const parsed = parsePrivatePath(pathname);
  return (parsed && contentTypeFor(parsed.purpose, parsed.name)) || "application/octet-stream";
}

/** Metadata for a stored file, or null when there is no such file. */
export async function headFile(pathname: string): Promise<StoredFileInfo | null> {
  if (storageDriver() === "local") {
    try {
      const stat = await fs.stat(localPath(pathname));
      return { size: stat.size, contentType: typeFromPath(pathname), uploadedAt: stat.mtime, url: `local-file:${pathname}` };
    } catch {
      return null;
    }
  }
  const auth = await blobAuth();
  try {
    const h = await head(pathname, auth);
    return { size: h.size, contentType: h.contentType, uploadedAt: h.uploadedAt, url: h.url };
  } catch (error) {
    if (error instanceof BlobNotFoundError) return null;
    throw error;
  }
}

/** A stream of the file for a download response, or null when missing. */
export async function readFile(pathname: string): Promise<{ stream: ReadableStream<Uint8Array>; size: number } | null> {
  if (storageDriver() === "local") {
    try {
      const full = localPath(pathname);
      const stat = await fs.stat(full);
      const stream = Readable.toWeb(createReadStream(full)) as unknown as ReadableStream<Uint8Array>;
      return { stream, size: stat.size };
    } catch {
      return null;
    }
  }
  const auth = await blobAuth();
  const result = await get(pathname, { access: "private", ...auth });
  if (!result || result.statusCode !== 200) return null;
  return { stream: result.stream, size: result.blob.size };
}

/** The first bytes of a file (to check it really is what its name says). */
export async function readFirstBytes(pathname: string, count = 16): Promise<Uint8Array | null> {
  const file = await readFile(pathname);
  if (!file) return null;
  const reader = file.stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < count) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const out = new Uint8Array(Math.min(total, count));
  let offset = 0;
  for (const c of chunks) {
    const take = Math.min(c.byteLength, out.length - offset);
    out.set(c.subarray(0, take), offset);
    offset += take;
    if (offset >= out.length) break;
  }
  return out;
}

export async function deleteStoredFile(pathname: string): Promise<void> {
  if (storageDriver() === "local") {
    await fs.rm(localPath(pathname), { force: true });
    return;
  }
  await del(pathname, await blobAuth());
}

/**
 * Answers the browser's request for a presigned upload URL (from
 * `uploadPresigned` in @vercel/blob/client) for exactly `allowed.pathname`,
 * limited to one content type and size. Completion callbacks are not used:
 * the action that registers the file checks it instead.
 */
export async function presignedUploadResponse(
  request: Request,
  body: HandleUploadPresignedBody,
  allowed: { pathname: string; contentType: string; maxBytes: number }
): Promise<unknown> {
  if (body.type !== "blob.generate-presigned-url") throw new Error("Unexpected upload event");
  const auth = await blobAuth();
  return handleUploadPresigned({
    body,
    request,
    // Only needed to verify completion callbacks, which are never requested here.
    webhookPublicKey: "unused",
    getSignedToken: async (pathname) => {
      if (pathname !== allowed.pathname) throw new Error("Upload path does not match its ticket");
      const token = await issueSignedToken({
        ...auth,
        pathname,
        operations: ["put"],
        validUntil: Date.now() + 15 * 60_000,
        allowedContentTypes: [allowed.contentType],
        maximumSizeInBytes: allowed.maxBytes,
      });
      return {
        token,
        urlOptions: {
          allowedContentTypes: [allowed.contentType],
          maximumSizeInBytes: allowed.maxBytes,
          allowOverwrite: false,
          addRandomSuffix: false,
        },
      };
    },
  });
}

/** A cheap read-only check that the store answers with our credentials. */
export async function storageHealth(): Promise<{ driver: StorageDriver; ok: boolean; error?: string }> {
  let driver: StorageDriver = "blob";
  try {
    driver = storageDriver();
    if (driver === "local") return { driver, ok: true };
    await head("healthcheck/none.txt", await blobAuth()).catch((error: unknown) => {
      if (error instanceof BlobNotFoundError) return null;
      throw error;
    });
    return { driver, ok: true };
  } catch (error) {
    return { driver, ok: false, error: error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 200) : "unknown" };
  }
}
