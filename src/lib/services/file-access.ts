import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { ClientScope } from "@/lib/api";
import { deliverableGate, downloadName, extensionOf, type LockReason } from "@/lib/files/policy";

/**
 * Who may download which project file. The download routes ask here first and
 * answer 404 for anything the caller must not know exists.
 *
 *  - Admins: any file on the project.
 *  - The assigned worker: the brief's files and chapter uploads, never message
 *    attachments (client <-> EduCraft only) or files an admin hid. A replaced
 *    worker loses access at once, since the project is matched on workerId.
 *  - The client: released chapters/documents whose payment rule is met, and
 *    attachments in their own message thread.
 */

export interface DownloadableFile {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType: string | null;
  fileSize: number | null;
  storage: "EXTERNAL_LINK" | "PUBLIC_BLOB" | "PRIVATE_BLOB";
  blobPathname: string | null;
}

const fileSelect = {
  id: true,
  fileName: true,
  fileUrl: true,
  fileType: true,
  fileSize: true,
  storage: true,
  blobPathname: true,
} satisfies Prisma.ProjectFileSelect;

/** The files a worker may see on their assigned project. */
export const WORKER_FILE_WHERE = {
  deletedAt: null,
  hiddenFromWorkerAt: null,
  messageId: null,
  NOT: { category: "message_attachment" },
} satisfies Prisma.ProjectFileWhereInput;

const projectMatch = (idOrCode: string) => ({ OR: [{ id: idOrCode }, { projectId: idOrCode }] });

export async function fileForAdmin(projectIdOrCode: string, fileId: string): Promise<DownloadableFile | null> {
  return db.projectFile.findFirst({
    where: { id: fileId, deletedAt: null, project: projectMatch(projectIdOrCode) },
    select: fileSelect,
  });
}

export async function fileForWorker(workerId: string, projectIdOrCode: string, fileId: string): Promise<DownloadableFile | null> {
  return db.projectFile.findFirst({
    where: { id: fileId, ...WORKER_FILE_WHERE, project: { workerId, ...projectMatch(projectIdOrCode) } },
    select: fileSelect,
  });
}

export type ClientFileResult =
  | { kind: "ok"; file: DownloadableFile; downloadAs: string }
  | { kind: "locked"; reason: LockReason }
  | { kind: "missing" };

function readCode(code: string): string {
  try {
    return decodeURIComponent(code).trim().toUpperCase();
  } catch {
    return code.trim().toUpperCase();
  }
}

export async function fileForClient(scope: ClientScope, code: string, fileId: string): Promise<ClientFileResult> {
  const file = await db.projectFile.findFirst({
    where: {
      id: fileId,
      deletedAt: null,
      storage: "PRIVATE_BLOB",
      project: { projectId: readCode(code), clientId: { in: scope.clientIds } },
    },
    select: {
      ...fileSelect,
      messageId: true,
      project: { select: { projectId: true, status: true, downpaymentStatus: true, balanceStatus: true } },
      version: {
        select: {
          releaseNo: true,
          deliverable: { select: { title: true, access: true, archivedAt: true } },
        },
      },
    },
  });
  if (!file) return { kind: "missing" };

  // An attachment in the client's own thread (either side's).
  if (file.messageId) {
    return { kind: "ok", file, downloadAs: file.fileName };
  }

  // A released chapter or document.
  const v = file.version;
  if (!v || v.releaseNo == null || v.deliverable.archivedAt) return { kind: "missing" };
  const gate = deliverableGate(true, v.deliverable.access, file.project);
  if (gate.state === "locked") return { kind: "locked", reason: gate.reason };
  if (gate.state !== "open") return { kind: "missing" };
  const label = v.releaseNo > 1 ? `${v.deliverable.title} (version ${v.releaseNo})` : v.deliverable.title;
  return {
    kind: "ok",
    file,
    downloadAs: downloadName([file.project.projectId, label], extensionOf(file.fileName)),
  };
}
