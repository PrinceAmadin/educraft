import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { sendMail } from "@/lib/mailer";
import { ApplicationError, submitApplication } from "@/lib/services/applications";
import { ambassadorApplicationSchema } from "@/lib/validations/application";

/** Public — no auth. */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const parsed = ambassadorApplicationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please check the form", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
    const result = await submitApplication(parsed.data, { ip, send: sendMail, defer: (work) => waitUntil(work.catch(() => {})) });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof ApplicationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    }
    console.error("[POST /api/apply]", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
