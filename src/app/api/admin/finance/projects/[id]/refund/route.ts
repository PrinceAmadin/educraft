import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdminRoles, serverError } from "@/lib/api";
import { rateLimited } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { getRefundPreview, processRefund, RefundError } from "@/lib/services/finance/refunds";
import type { RefundStage } from "@/lib/finance/refund-rules";
import { FinanceFileError, putFinanceFile } from "@/lib/services/finance/finance-files";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/** The refund preview (detected stage, money in, reversible commissions, worker partial). Founder + CFO. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdminRoles(["CO_CEO_CFO"]);
  if (!guard.ok) return guard.response;
  const limited = await rateLimited(guard.session.userId, "refund", 5);
  if (limited) return limited;
  try {
    return NextResponse.json(await getRefundPreview(params.id));
  } catch (error) {
    if (error instanceof RefundError) return NextResponse.json({ error: error.message }, { status: 404 });
    return serverError("GET /api/admin/projects/[id]/refund", error);
  }
}

/** Process a refund decision (multipart: fields + an optional bank confirmation). Founder + CFO only. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdminRoles(["CO_CEO_CFO"]);
  if (!guard.ok) return guard.response;
  const limited = await rateLimited(guard.session.userId, "refund", 5);
  if (limited) return limited;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return badRequest("Expected a form submission");
  }

  const stage = Number(form.get("stage"));
  const amount = Number(form.get("amount"));
  const reason = String(form.get("reason") ?? "").trim();
  const workerPartial = Number(form.get("workerPartial") ?? 0);
  if (![1, 2, 3, 4].includes(stage)) return badRequest("Pick a refund stage");
  if (!Number.isFinite(amount) || amount < 0) return badRequest("Enter a refund amount");
  if (reason.length < 3) return badRequest("A reason is required");

  let reverseRecordIds: string[] = [];
  const raw = form.get("reverseRecordIds");
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) reverseRecordIds = parsed.filter((x): x is string => typeof x === "string").slice(0, 200);
    } catch {
      return badRequest("Could not read the list of commissions to reverse");
    }
  }

  // An optional bank-transfer confirmation, stored under the finance root.
  let bankConfirmationFileId: string | null = null;
  const file = form.get("file");
  if (file instanceof File && file.size > 0) {
    const project = await db.project.findFirst({ where: { OR: [{ id: params.id }, { projectId: params.id }] }, select: { id: true } });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    try {
      const saved = await putFinanceFile({ purpose: "bank_confirmation", targetId: project.id, fileName: file.name, bytes: new Uint8Array(await file.arrayBuffer()), uploadedById: guard.session.userId });
      bankConfirmationFileId = saved.id;
    } catch (error) {
      if (error instanceof FinanceFileError) return NextResponse.json({ error: error.message }, { status: 400 });
      throw error;
    }
  }

  try {
    const result = await processRefund(
      params.id,
      { stage: stage as RefundStage, amount: Math.round(amount), reason, reverseRecordIds, workerPartial: Math.round(workerPartial), bankConfirmationFileId },
      guard.session.userId
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof RefundError) return NextResponse.json({ error: error.message }, { status: 409 });
    return serverError("POST /api/admin/projects/[id]/refund", error);
  }
}
