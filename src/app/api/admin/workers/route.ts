import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { createWorker } from "@/lib/services/workers";
import { createWorkerSchema } from "@/lib/validations/workers";
import { listWorkerDirectory } from "@/lib/services/operations/workers-ops";
import { workerDirectoryQuerySchema } from "@/lib/validations/operations";
import { parseQuery } from "@/lib/services/operations/route-helpers";

export const dynamic = "force-dynamic";

/** GET ?dept=&status=&q=&page= — the worker directory with live status and performance. */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  try {
    const q = parseQuery(req, workerDirectoryQuerySchema);
    const result = await listWorkerDirectory({ dept: q.dept === "all" ? undefined : q.dept, status: q.status, q: q.q, page: q.page });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return serverError("GET /api/admin/workers", error);
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }

  const parsed = createWorkerSchema.safeParse(body);
  if (!parsed.success) return badRequest("Please check the form", parsed.error.flatten());

  try {
    const worker = await createWorker(parsed.data);
    return NextResponse.json(worker, { status: 201 });
  } catch (error) {
    return serverError("POST /api/admin/workers", error);
  }
}
