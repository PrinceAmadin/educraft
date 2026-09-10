---
name: educraft-api
description: EduCraft HQ backend conventions — API routes, auth and role guards, Prisma queries, the project pipeline state machine, payments, commissions, and ID generation. Use when building API routes, server actions, database queries, or business logic.
---

# EduCraft API

## API route pattern

```typescript
// src/app/api/admin/projects/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!["SUPER_ADMIN", "OPS_MANAGER"].includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const projects = await db.project.findMany({
      include: {
        client: { select: { id: true, code: true, fullName: true } },
        worker: { select: { id: true, code: true, fullName: true } },
        service: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({ projects });
  } catch (error) {
    console.error("[GET /api/admin/projects]", error);
    return NextResponse.json({ error: "Failed to load projects" }, { status: 500 });
  }
}
```

Rules:
- **Auth first, always.** Session check, then role check, before any query. No protected route without both.
- Validate request bodies with a Zod schema from `src/lib/validations/`; return `400` with the flattened issues on failure.
- Wrap every DB operation in try/catch. Log with a route tag; return a human-readable message, never the raw error or stack.
- Status codes: 200 ok, 201 created, 400 validation, 401 no session, 403 wrong role, 404 not found, 409 illegal state transition, 500 unexpected.
- Business logic lives in `src/lib/services/*` — routes stay thin (auth, validate, call service, respond).

## Role-based access

| Role | Routes | Scope |
|---|---|---|
| SUPER_ADMIN | `/api/admin/*` | Everything |
| OPS_MANAGER | `/api/admin/*` | No deletes, no pricing changes, no founder financials |
| WORKER | `/api/worker/*` | **Own records only** |
| AMBASSADOR | `/api/ambassador/*` | **Own records only** |
| CLIENT | `/api/client/*` | Own projects only |

Scoped roles must filter by the caller's own id in the `where` clause — never trust an id from the request body or query string:

```typescript
const worker = await db.worker.findUnique({ where: { userId: session.user.id } });
if (!worker) return NextResponse.json({ error: "Worker profile not found" }, { status: 404 });

const projects = await db.project.findMany({ where: { workerId: worker.id } });
```

For a single-record fetch, scope the lookup rather than fetching then checking:
`db.project.findFirst({ where: { id, workerId: worker.id } })` → 404 if null.

## Prisma patterns

- Always `select` or `include` explicitly on list endpoints; never return whole user rows (password hashes, tokens).
- Paginate lists (`take` / `skip` or cursor). Default `take: 50`.
- Use `db.$transaction([...])` when a status change, a log entry, a payment, and a notification must land together.
- Money: store in the smallest sensible unit / `Decimal`; convert with `Number()` only at the response boundary.
- Never run bare `prisma` commands. Use `npm run db:migrate`, `npm run db:seed`, `npm run db:generate`, `npm run db:studio` (they load `.env.local` via dotenv-cli).

## Project pipeline state machine

Enforce transitions centrally — `src/lib/services/projects.ts`. Reject anything not in this table with `409`.

| From | To | Requirement |
|---|---|---|
| NEW | DOWNPAYMENT_VERIFIED | `downpaymentStatus === "Verified"` |
| DOWNPAYMENT_VERIFIED | REQUIREMENTS_CONFIRMED | `title` and `serviceId` set |
| REQUIREMENTS_CONFIRMED | ASSIGNED | `workerId` set |
| ASSIGNED | IN_PROGRESS | `workerAccepted === true` |
| IN_PROGRESS | AWAITING_CLIENT_INPUT | pauses the deadline clock |
| AWAITING_CLIENT_INPUT | IN_PROGRESS | resumes the deadline clock |
| IN_PROGRESS | SUBMITTED | at least one `ProjectFile` uploaded |
| SUBMITTED | IN_QA_REVIEW | — |
| IN_QA_REVIEW | APPROVED | `qaStatus === "Passed"` |
| IN_QA_REVIEW | REVISION_NEEDED | increments `revisionCount` |
| REVISION_NEEDED | SUBMITTED | new file uploaded |
| APPROVED | BALANCE_VERIFIED | `balanceStatus === "Verified"` |
| BALANCE_VERIFIED | DELIVERED | — |
| DELIVERED | SUPERVISOR_CORRECTIONS | — |
| SUPERVISOR_CORRECTIONS | DELIVERED | — |
| DELIVERED | COMPLETED | 7 days elapsed since delivery, or client confirms |

Any status → ON_HOLD, CANCELLED, REFUNDED, DISPUTED (admin only, reason required).

Additional invariants:
- No advancement past NEW without a verified downpayment.
- No assignment without confirmed requirements.
- No delivery without `qaStatus === "Passed"` **and** verified balance.
- `revisionCount > 3` → flag for founder review (notify SUPER_ADMIN, do not block).
- Deadline alerts: 5 days (gentle), 3 days (urgent), 1 day (critical), passed → OVERDUE.
- AWAITING_CLIENT_INPUT pauses the deadline clock — track paused duration and shift `deadline` on resume.

**Every status change MUST write a `ProjectStatusLog`**, in the same transaction:

```typescript
await db.$transaction([
  db.project.update({ where: { id: projectId }, data: { status: next } }),
  db.projectStatusLog.create({
    data: { projectId, fromStatus: current, toStatus: next, changedById: session.user.id, note },
  }),
]);
```

## Payments

45% downpayment up front (work begins), 55% balance after QA approval (delivery unlocks).

```typescript
await db.payment.create({
  data: {
    code: await generateId("PAYMENT"),      // EC-PAY-XXXXX
    projectId,
    type: "DOWNPAYMENT",                    // DOWNPAYMENT | BALANCE | COMMISSION | WORKER_PAYOUT | REFUND
    direction: "INBOUND",                   // INBOUND (client → EduCraft) | OUTBOUND (payouts)
    amount,
    reference,                              // bank/transfer reference — required for verification
    status: "PENDING",                      // PENDING | VERIFIED | FAILED
    verifiedById: null,
  },
});
```

Verification is a deliberate admin action that sets `status: "VERIFIED"`, `verifiedById`, `verifiedAt` — never auto-verify.

## Commission calculation

- Worker: **40%** of project total, always.
- Ambassador by tier: Bronze **10%**, Silver **12%**, Gold **15%**, Platinum **15%** + quarterly bonus.
- Parent ambassador: **5%** of a sub-ambassador's referral total (max 1 level deep, max 5 subs, parent must be Silver+).
- EduCraft: the remainder.

**Ambassador commission is created when the client's downpayment is verified**, not on completion. Compute from the project total, not the downpayment amount.

```typescript
const TIER_RATE = { BRONZE: 0.10, SILVER: 0.12, GOLD: 0.15, PLATINUM: 0.15 } as const;
const WORKER_RATE = 0.40;
const PARENT_RATE = 0.05;
```

## ID generation

| Entity | Format |
|---|---|
| Project | `EC-XXXXX` |
| Client | `EC-C-XXXXX` |
| Worker | `EC-W-XXXXX` |
| Ambassador | `EC-A-XXXXX` |
| Payment | `EC-PAY-XXXXX` |

Generate in a shared helper, uppercase alphanumeric, collision-checked against the DB, and created inside the same transaction as the record.

## Never

- Return data for a record the caller does not own (worker/ambassador/client scopes).
- Skip the `ProjectStatusLog` on a status change.
- Hardcode mock data — query the DB and return zeros/empty arrays when there is nothing.
- Put secrets in code — `.env.local` locally, Vercel env vars in production.
- Expose internal automation/AI details in client-facing responses.
