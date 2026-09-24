import { NextRequest, NextResponse } from "next/server";
import {
  addWorkerNote,
  flagWorker,
  setWorkerMaxLoad,
  suspendWorker,
  unsuspendWorker,
} from "@/lib/services/operations/workers-ops";
import { setQaReviewer } from "@/lib/services/operations/qa-reviews";
import { opsError, opsGuard, parseBody } from "@/lib/services/operations/route-helpers";
import {
  workerFlagBodySchema,
  workerMaxLoadBodySchema,
  workerNoteBodySchema,
  workerQaReviewerBodySchema,
  workerSuspendBodySchema,
} from "@/lib/validations/operations";

export const dynamic = "force-dynamic";

/**
 * The COO's acts on a worker, one path segment each:
 *   POST  suspend { reason? } · POST unsuspend { note? } · POST flag { kind, reason, projectCode? }
 *   POST  notes { content }
 *   PATCH max-load { maxConcurrentProjects } · PATCH qa-reviewer { isQaReviewer }
 * (`login`, `assignments` and `metrics` have their own files and win over this route.)
 */
export async function POST(req: NextRequest, { params }: { params: { id: string; action: string } }) {
  const guard = await opsGuard();
  if (!guard.ok) return guard.response;
  try {
    switch (params.action) {
      case "suspend": {
        const body = await parseBody(req, workerSuspendBodySchema);
        if (!body.ok) return body.response;
        return NextResponse.json(await suspendWorker(params.id, guard.actor, body.data.reason));
      }
      case "unsuspend": {
        const body = await parseBody(req, workerSuspendBodySchema);
        if (!body.ok) return body.response;
        return NextResponse.json(await unsuspendWorker(params.id, guard.actor, body.data.reason));
      }
      case "flag": {
        const body = await parseBody(req, workerFlagBodySchema);
        if (!body.ok) return body.response;
        return NextResponse.json(await flagWorker(params.id, guard.actor, { kind: body.data.kind, reason: body.data.reason, projectCode: body.data.projectCode || undefined }), { status: 201 });
      }
      case "notes": {
        const body = await parseBody(req, workerNoteBodySchema);
        if (!body.ok) return body.response;
        return NextResponse.json(await addWorkerNote(params.id, guard.actor, body.data.content), { status: 201 });
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 404 });
    }
  } catch (error) {
    return opsError(`POST /api/admin/workers/[id]/${params.action}`, error);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string; action: string } }) {
  const guard = await opsGuard();
  if (!guard.ok) return guard.response;
  try {
    switch (params.action) {
      case "max-load": {
        const body = await parseBody(req, workerMaxLoadBodySchema);
        if (!body.ok) return body.response;
        return NextResponse.json(await setWorkerMaxLoad(params.id, guard.actor, body.data.maxConcurrentProjects));
      }
      case "qa-reviewer": {
        const body = await parseBody(req, workerQaReviewerBodySchema);
        if (!body.ok) return body.response;
        return NextResponse.json(await setQaReviewer(params.id, guard.actor, body.data.isQaReviewer));
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 404 });
    }
  } catch (error) {
    return opsError(`PATCH /api/admin/workers/[id]/${params.action}`, error);
  }
}
