/**
 * D4: what the client's data-pause banner reads. Kept apart from data-pause.ts so
 * client pages don't load the Claude, Word and Excel code that service needs.
 * Client-safe fields only: never the specialist's files, the COO's notes or errors.
 */

import { db } from "@/lib/db";
import { readFormSpec, type DataFormField } from "@/lib/generation/dynamic-data-form";

/** What the client's banner shows: the request exactly as drafted, and only what is theirs to see. */
export interface ClientPauseView {
  id: string;
  status: "OPEN" | "SUBMITTED";
  title: string;
  description: string;
  checklist: string[];
  whatToSend: { label: string; description: string; required: boolean }[];
  fields: DataFormField[];
  answers: Record<string, string>;
  /** The specialist's note after asking for more (null the first time). */
  note: string | null;
  round: number;
  /** The files the client has sent (names only). */
  sent: { name: string; size: number | null }[];
  submittedAt: string | null;
}

/** The active, ready request of a project the caller has already scoped to the client, or null. */
export async function getClientPauseView(projectDbId: string): Promise<ClientPauseView | null> {
  const p = await db.pipelinePause.findFirst({
    where: { projectId: projectDbId, status: { in: ["OPEN", "SUBMITTED"] }, formStatus: "READY" },
    orderBy: { afterChapter: "asc" },
    select: {
      id: true,
      status: true,
      formTitle: true,
      formDescription: true,
      formSpec: true,
      formStatus: true,
      answers: true,
      workerNote: true,
      round: true,
      submittedAt: true,
      files: { where: { deletedAt: null, uploaderRole: "CLIENT" }, orderBy: { createdAt: "asc" }, select: { fileName: true, fileSize: true } },
    },
  });
  const form = p?.formStatus === "READY" ? readFormSpec(p.formSpec) : null;
  if (!p || !form) return null;
  return {
    id: p.id,
    status: p.status === "SUBMITTED" ? "SUBMITTED" : "OPEN",
    title: p.formTitle ?? form.title,
    description: p.formDescription ?? form.description,
    checklist: form.checklist,
    whatToSend: form.files.map((f) => ({ label: f.label, description: f.description, required: f.required })),
    fields: form.fields,
    answers: (p.answers ?? {}) as Record<string, string>,
    note: p.workerNote,
    round: p.round,
    sent: p.files.map((f) => ({ name: f.fileName, size: f.fileSize })),
    submittedAt: p.submittedAt?.toISOString() ?? null,
  };
}
