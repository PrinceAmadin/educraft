import crypto from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { HandleUploadPresignedBody } from "@vercel/blob/client";
import { db } from "@/lib/db";
import {
  canUpload,
  contentTypeFor,
  extensionOf,
  maxBytesFor,
  UPLOAD_PURPOSES,
  type UploaderRole,
  type UploadPurpose,
} from "@/lib/files/policy";
import { buildPrivatePath, parsePrivatePath } from "@/lib/files/paths";
import { issueTicket, UPLOAD_WINDOW_MS, verifyTicket } from "@/lib/files/ticket";
import { presignedUploadResponse, StorageNotConfigured, storageDriver } from "@/lib/files/storage";

/**
 * The body of every POST /api/{worker|admin|client}/projects/[id]/upload.
 * The route checks who is calling and which project first, then hands over.
 *
 * Two kinds of request arrive here:
 *  1. From our page: { purpose, targetId, fileName, size }. We choose a random
 *     path and return it with a ticket.
 *  2. From @vercel/blob's `uploadPresigned` in the browser: a request for a
 *     presigned URL for that path, carrying the ticket as clientPayload. We
 *     check the ticket and let exactly that path be written.
 * With the local development driver the browser PUTs the file to
 * /api/files/local-upload instead of step 2.
 */

/** Files above this go up in parts (retried separately), which is kinder to phone connections. */
export const MULTIPART_OVER_BYTES = 8 * 1024 * 1024;
const DAILY_UPLOADS_PER_USER = 100;

const requestSchema = z.object({
  purpose: z.enum(UPLOAD_PURPOSES as [UploadPurpose, ...UploadPurpose[]]),
  targetId: z.string().trim().min(3).max(40).regex(/^[a-z0-9-]+$/),
  fileName: z.string().trim().min(1).max(200),
  size: z.number().int().positive(),
});

export interface UploadTicketResponse {
  pathname: string;
  ticket: string;
  contentType: string;
  driver: "blob" | "local";
  multipart: boolean;
}

export async function handleUploadRequest(
  req: Request,
  ctx: {
    userId: string;
    role: UploaderRole;
    projectDbId: string;
    /** Null when this caller may upload for that purpose/target now, else the reason they can't. */
    checkTarget: (purpose: UploadPurpose, targetId: string) => Promise<string | null>;
  }
): Promise<NextResponse> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    // Step 2: the browser SDK asking for a presigned URL.
    if (json && typeof json === "object" && (json as { type?: string }).type === "blob.generate-presigned-url") {
      const body = json as HandleUploadPresignedBody & { type: "blob.generate-presigned-url" };
      const pathname = body.payload.pathname;
      const ticket = body.payload.clientPayload ?? "";
      const parsed = parsePrivatePath(pathname);
      if (!parsed || parsed.projectDbId !== ctx.projectDbId || !verifyTicket(ticket, pathname, ctx.userId, UPLOAD_WINDOW_MS)) {
        return NextResponse.json({ error: "This upload is not allowed. Try again." }, { status: 403 });
      }
      const refusal = await ctx.checkTarget(parsed.purpose, parsed.targetId);
      if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });
      const contentType = contentTypeFor(parsed.purpose, parsed.name);
      if (!contentType) return NextResponse.json({ error: "That kind of file can't be uploaded here." }, { status: 400 });
      const result = await presignedUploadResponse(req, body, {
        pathname,
        contentType,
        maxBytes: maxBytesFor(parsed.purpose),
      });
      return NextResponse.json(result);
    }

    // Step 1: our page asking where to upload.
    const parsed = requestSchema.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    const { purpose, targetId, fileName, size } = parsed.data;

    if (!canUpload(ctx.role, purpose)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const contentType = contentTypeFor(purpose, fileName);
    if (!contentType) {
      return NextResponse.json({ error: "That kind of file can't be uploaded here." }, { status: 400 });
    }
    if (size > maxBytesFor(purpose)) {
      return NextResponse.json(
        { error: `That file is too large (the limit is ${Math.round(maxBytesFor(purpose) / 1024 / 1024)} MB).` },
        { status: 400 }
      );
    }
    const refusal = await ctx.checkTarget(purpose, targetId);
    if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });

    const today = await db.projectFile.count({
      where: { uploadedBy: ctx.userId, storage: "PRIVATE_BLOB", createdAt: { gte: new Date(Date.now() - 86_400_000) } },
    });
    if (today >= DAILY_UPLOADS_PER_USER) {
      return NextResponse.json({ error: "Upload limit reached for today. Try again tomorrow." }, { status: 429 });
    }

    const pathname = buildPrivatePath({
      projectDbId: ctx.projectDbId,
      purpose,
      targetId,
      random: crypto.randomBytes(12).toString("hex"),
      ext: extensionOf(fileName),
    });
    const response: UploadTicketResponse = {
      pathname,
      ticket: issueTicket(pathname, ctx.userId),
      contentType,
      driver: storageDriver(),
      multipart: size > MULTIPART_OVER_BYTES,
    };
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof StorageNotConfigured) {
      console.error("[upload] private file store is not configured:", error.message);
      return NextResponse.json({ error: "File uploads aren't available right now. Tell an admin." }, { status: 503 });
    }
    console.error("[upload]", error);
    return NextResponse.json({ error: "The upload couldn't start. Try again." }, { status: 500 });
  }
}
