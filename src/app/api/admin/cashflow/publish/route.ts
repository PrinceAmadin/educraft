import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { badRequest, requireSuperAdmin, serverError } from "@/lib/api";
import { CashflowPublishError, publishCashflow } from "@/lib/services/cashflow";
import { refreshAllTiers } from "@/lib/services/ambassador-platform/conversions";
import { revalidateCommandCenter } from "@/lib/services/command-center/cache";
import { publishCashflowSchema, toStructure } from "@/lib/validations/cashflow";

/**
 * Publish a new cashflow version (the founder only). A tier change recounts
 * every ambassador after the response, so the page never waits on it.
 */
export async function POST(req: NextRequest) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }
  const parsed = publishCashflowSchema.safeParse(body);
  if (!parsed.success) return badRequest("The structure has an invalid shape", parsed.error.flatten());
  try {
    const result = await publishCashflow({
      structure: toStructure(parsed.data.structure),
      reason: parsed.data.reason ?? null,
      actorId: guard.session.userId,
      basedOnVersion: parsed.data.basedOnVersion ?? null,
    });
    revalidateCommandCenter();
    if (result.tiersChanged) {
      waitUntil(
        refreshAllTiers()
          .then((r) => {
            if (r.changed.length) console.log(`[cashflow] v${result.versionNumber}: ${r.changed.map((c) => `${c.ambassadorId} ${c.from} -> ${c.to}`).join(", ")}`);
          })
          .catch((error) => console.error("[cashflow] tier refresh after publish failed", error))
      );
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof CashflowPublishError) {
      return NextResponse.json({ error: error.message, violations: error.violations }, { status: error.status });
    }
    return serverError("POST /api/admin/cashflow/publish", error);
  }
}
