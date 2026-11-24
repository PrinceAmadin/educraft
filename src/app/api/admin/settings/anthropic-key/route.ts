import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { badRequest, requireSuperAdmin, serverError } from "@/lib/api";
import { rateLimited } from "@/lib/rate-limit";
import { getAnthropicKeyStatus } from "@/lib/anthropic-key";
import { AnthropicKeySaveError, clearAnthropicKey, setAnthropicKey } from "@/lib/services/anthropic-key";

/**
 * The Anthropic API key, changed from the admin settings instead of a Vercel
 * environment variable.
 *
 * Founder only. The `/api/admin/settings` row in `rbac.ts` already restricts
 * every route under it to SUPER_ADMIN; `requireSuperAdmin()` here is the
 * second lock, so the card being rendered on a page the CFO can open could
 * never let the CFO write the key. No response ever carries the key — only
 * the masked status.
 */

export const dynamic = "force-dynamic";
// It makes an outbound call to Anthropic to prove the key, like the fx-rate refresh.
export const maxDuration = 30;

const NO_STORE = { "Cache-Control": "no-store" } as const;

const setKeySchema = z.object({
  key: z.string().min(1, "Paste the API key").max(400),
  /** Optional: a new Claude account's credit, which also restarts the spend window. */
  balanceUsd: z.coerce.number().min(0).max(100_000).optional(),
});

/** GET — the masked status both screens render. */
export async function GET() {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  try {
    return NextResponse.json({ status: await getAnthropicKeyStatus() }, { headers: NO_STORE });
  } catch (error) {
    return serverError("GET /api/admin/settings/anthropic-key", error);
  }
}

/** POST — save a new key (checked against Anthropic first). */
export async function POST(req: NextRequest) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  const limited = await rateLimited(guard.session.userId, "anthropic-key", 10);
  if (limited) return limited;

  const parsed = setKeySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Please check the form", parsed.error.flatten());

  try {
    const result = await setAnthropicKey(
      { key: parsed.data.key, balanceUsd: parsed.data.balanceUsd ?? null },
      { userId: guard.session.userId },
    );
    return NextResponse.json({ ok: true, ...result }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof AnthropicKeySaveError) {
      return NextResponse.json({ error: error.message }, { status: error.status, headers: NO_STORE });
    }
    return serverError("POST /api/admin/settings/anthropic-key", error);
  }
}

/** DELETE — forget the saved key so ANTHROPIC_API_KEY takes over again. */
export async function DELETE() {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  const limited = await rateLimited(guard.session.userId, "anthropic-key", 10);
  if (limited) return limited;

  try {
    const status = await clearAnthropicKey({ userId: guard.session.userId });
    return NextResponse.json({ ok: true, status }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof AnthropicKeySaveError) {
      return NextResponse.json({ error: error.message }, { status: error.status, headers: NO_STORE });
    }
    return serverError("DELETE /api/admin/settings/anthropic-key", error);
  }
}
