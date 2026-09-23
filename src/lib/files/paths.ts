import type { UploadPurpose } from "@/lib/files/policy";

/**
 * Private-store paths: projects/{projectCuid}/{purpose}/{targetCuid}/{random}.{ext}
 *
 * Only internal ids and a random name: no student names, project codes or
 * matric numbers ever appear in a path (the original file name lives on the
 * ProjectFile row). The server always chooses the path; an upload can only
 * land where a ticket for that exact path allows.
 */

const ID = /^[a-z0-9]{8,40}$/;
const TARGET = /^[a-z0-9-]{3,40}$/;
const NAME = /^[a-f0-9]{24}\.[a-z0-9]{1,6}$/;

export interface PrivatePath {
  projectDbId: string;
  purpose: UploadPurpose;
  targetId: string;
  name: string;
}

export function buildPrivatePath(input: {
  projectDbId: string;
  purpose: UploadPurpose;
  targetId: string;
  random: string;
  ext: string;
}): string {
  return `projects/${input.projectDbId}/${input.purpose}/${input.targetId}/${input.random}.${input.ext}`;
}

export function parsePrivatePath(pathname: string): PrivatePath | null {
  const parts = pathname.split("/");
  if (parts.length !== 5 || parts[0] !== "projects") return null;
  const [, projectDbId, purpose, targetId, name] = parts;
  if (!ID.test(projectDbId) || !TARGET.test(targetId) || !NAME.test(name)) return null;
  if (purpose !== "deliverable" && purpose !== "message") return null;
  return { projectDbId, purpose, targetId, name };
}

/** Message attachments are uploaded before the message exists, so their target is the thread. */
export const MESSAGE_TARGET = "thread";
