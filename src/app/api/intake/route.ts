import { NextRequest, NextResponse } from "next/server";
import { IntakeError, submitIntake } from "@/lib/services/intake";
import { intakeSubmitSchema } from "@/lib/validations/intake";

/** Public — no auth. Rate limiting is a later concern. */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const parsed = intakeSubmitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please check the form", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const result = await submitIntake(parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof IntakeError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("[POST /api/intake]", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
