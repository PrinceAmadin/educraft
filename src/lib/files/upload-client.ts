import { uploadPresigned } from "@vercel/blob/client";
import type { UploadPurpose } from "@/lib/files/policy";
import type { UploadTicketResponse } from "@/lib/files/upload-route";

/**
 * Browser side of a private upload: ask our route where to put the file (it
 * answers with a path and a ticket), send the file straight to storage, and
 * return what the page then submits with its action. Files never pass through
 * our functions (Vercel caps request bodies at 4.5 MB); big files go in parts.
 */

export interface UploadedRef {
  pathname: string;
  ticket: string;
  fileName: string;
  size: number;
}

export async function uploadPrivateFile(
  file: File,
  opts: {
    /** e.g. /api/worker/projects/EC-00008/upload */
    endpoint: string;
    purpose: UploadPurpose;
    targetId: string;
    onProgress?: (percent: number) => void;
    signal?: AbortSignal;
  }
): Promise<UploadedRef> {
  const res = await fetch(opts.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ purpose: opts.purpose, targetId: opts.targetId, fileName: file.name, size: file.size }),
    signal: opts.signal,
  });
  const data = (await res.json().catch(() => null)) as (UploadTicketResponse & { error?: string }) | null;
  if (!res.ok || !data?.pathname) throw new Error(data?.error ?? "The upload couldn't start. Try again.");

  if (data.driver === "local") {
    const put = await fetch(
      `/api/files/local-upload?path=${encodeURIComponent(data.pathname)}&ticket=${encodeURIComponent(data.ticket)}`,
      { method: "PUT", body: file, headers: { "Content-Type": data.contentType }, signal: opts.signal }
    );
    if (!put.ok) {
      const err = (await put.json().catch(() => null)) as { error?: string } | null;
      throw new Error(err?.error ?? "The upload failed. Try again.");
    }
    opts.onProgress?.(100);
  } else {
    try {
      await uploadPresigned(data.pathname, file, {
        access: "private",
        handleUploadUrl: opts.endpoint,
        clientPayload: data.ticket,
        contentType: data.contentType,
        multipart: data.multipart,
        abortSignal: opts.signal,
        onUploadProgress: (e) => opts.onProgress?.(Math.round(e.percentage)),
      });
    } catch (error) {
      if (opts.signal?.aborted) throw error;
      throw new Error("The upload failed. Check your connection and try again.");
    }
  }

  return { pathname: data.pathname, ticket: data.ticket, fileName: file.name, size: file.size };
}

export const humanSize = (n: number | null | undefined): string => {
  if (!n || n <= 0) return "";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};
