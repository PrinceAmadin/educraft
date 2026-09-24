import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { TransitionError, createProjectManual, listProjects } from "@/lib/services/projects";
import { getExpectedHours } from "@/lib/services/operations/pipeline";
import { statusAge } from "@/lib/operations/pipeline-stages";
import { createProjectSchema } from "@/lib/validations/projects";
import { projectListQuerySchema } from "@/lib/validations/operations";
import { parseQuery } from "@/lib/services/operations/route-helpers";

export const dynamic = "force-dynamic";

/**
 * GET ?status=&stage=&workerId=&dept=&deadline=&q=&page= — the pipeline as
 * JSON: the same rows the projects page shows, with days in status.
 */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  try {
    const q = parseQuery(req, projectListQuerySchema);
    const now = new Date();
    const [result, expected] = await Promise.all([
      listProjects(
        {
          status: q.status,
          stage: q.stage,
          workerId: q.workerId === "all" ? undefined : q.workerId,
          department: q.dept === "all" ? undefined : q.dept,
          deadline: q.deadline,
          flag: q.flag,
          q: q.q,
          page: q.page,
        },
        now
      ),
      getExpectedHours(),
    ]);
    return NextResponse.json({
      ...result,
      rows: result.rows.map((row) => {
        const age = statusAge(row.statusLog[0]?.createdAt ?? row.createdAt, row.status, expected, now);
        return {
          id: row.id,
          projectId: row.projectId,
          status: row.status,
          projectTitle: row.projectTitle,
          client: { fullName: row.client.fullName, department: row.client.department, university: row.client.university?.abbreviation ?? null },
          service: row.service.serviceName,
          worker: row.worker ? { id: row.worker.id, fullName: row.worker.fullName } : null,
          ambassador: row.ambassador ? { fullName: row.ambassador.fullName, tier: row.ambassador.tier } : null,
          deadline: (row.internalDeadline ?? row.clientDeadline)?.toISOString() ?? null,
          atRisk: row.atRisk,
          revisionCount: row.revisionCount,
          daysInStatus: age.days,
          statusAgeTone: age.tone,
          statusSince: (row.statusLog[0]?.createdAt ?? row.createdAt).toISOString(),
        };
      }),
    });
  } catch (error) {
    return serverError("GET /api/admin/projects", error);
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

  const parsed = createProjectSchema.safeParse(body);
  if (!parsed.success) return badRequest("Please check the form", parsed.error.flatten());

  if (parsed.data.proBono && guard.session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Only the super admin can create pro bono projects" }, { status: 403 });
  }

  try {
    const result = await createProjectManual(parsed.data, guard.session.userId);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof TransitionError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return serverError("POST /api/admin/projects", error);
  }
}
