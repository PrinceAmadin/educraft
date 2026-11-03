/**
 * Demo data for the EduCraft HQ walkthrough videos (chapter review / quality gate).
 *
 * Creates a self-contained report project whose chapters sit in the three states
 * a recording needs: Chapter 1 approved, Chapter 2 waiting for the COO's
 * approval, Chapter 3 still being written — plus a COO login to film it with.
 *
 * SAFETY: this writes a login whose password is in the script, so it refuses to
 * run against anything but a database on this machine. Point DATABASE_URL at a
 * throwaway local Postgres (see docs/demo-recording.md) before running it.
 *
 *   npm run demo:seed          # create
 *   npm run demo:terminate     # remove every row it made
 *
 * Nothing here is a real client, a real order or a real quality result: it is a
 * fixture for recording the real screens.
 */
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { ensureDeliverables } from "@/lib/services/deliverables";
import { ensureChapterDrafts } from "@/lib/services/chapter-review";
import { ensureReadback } from "@/lib/services/chapter-readback";
import { chapterTextHash } from "@/lib/quality/chapter-hash";
import { buildPrivatePath } from "@/lib/files/paths";
import { deleteStoredFile, putPrivateFile, readFileBytes } from "@/lib/files/storage";
import { DEMO, assertLocalDatabase } from "./demo-constants";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const rand24 = () => randomBytes(12).toString("hex");

// ─── The chapter text the fixture's AI drafts are built from ─────────────────
// Short on purpose: enough to read as a real chapter on camera, not a whole report.

const CHAPTER_TEXT: Record<number, string> = {
  1: `[H1]
CHAPTER ONE
INTRODUCTION

[H2]
1.1 Background to the Study

Mobile money services have spread quickly across Nigerian urban markets over the past decade. Traders who once held cash overnight now settle balances through agent networks and mobile wallets, and the change has altered how small businesses record income and manage working capital (Adeyemi, 2021).

Market traders occupy a particular position in this shift. They transact in small amounts, many times a day, with customers who may or may not hold a bank account. The question of whether mobile money improves their measured business performance therefore cannot be answered from aggregate banking statistics alone.

[H2]
1.2 Statement of the Problem

Although adoption figures are published regularly, little evidence connects mobile money use to the operating performance of individual traders in Lagos State. Studies at national level report broad gains, yet traders themselves describe uneven experiences with charges, downtime and agent liquidity.

[H2]
1.3 Aim and Objectives of the Study

The aim of this study is to examine the effect of mobile money adoption on the business performance of market traders in Lagos State.

The objectives are:

1. To determine the level of mobile money adoption among market traders in Lagos State.
2. To examine the relationship between mobile money adoption and recorded sales turnover.
3. To assess the effect of mobile money adoption on access to working capital.
4. To identify the constraints traders face in using mobile money services.

[H2]
1.4 Research Questions

1. What is the level of mobile money adoption among market traders in Lagos State?
2. What relationship exists between mobile money adoption and recorded sales turnover?
3. What effect does mobile money adoption have on access to working capital?
4. What constraints do traders face in using mobile money services?

[H2]
1.5 Research Hypotheses

H01: Mobile money adoption has no significant effect on the recorded sales turnover of market traders in Lagos State.

H02: Mobile money adoption has no significant effect on access to working capital among market traders in Lagos State.

[H2]
1.6 Significance of the Study

The findings offer market associations and service providers evidence drawn from traders themselves rather than from provider-side transaction counts.

[H2]
1.7 Scope of the Study

The study covers registered traders in three Lagos State markets and considers the period from 2019 to 2025.`,
  2: `[H1]
CHAPTER TWO
LITERATURE REVIEW

[H2]
2.1 Conceptual Framework

Mobile money is understood here as the storage and transfer of value through a mobile network account, whether or not it is linked to a deposit account at a licensed bank. Business performance is treated as a composite of recorded turnover, access to working capital and the assessment traders make of their own stability.

[H2]
2.2 Theoretical Framework

[H3]
2.2.1 Technology Acceptance Model

The Technology Acceptance Model holds that perceived usefulness and perceived ease of use together explain intention to adopt a technology (Davis, 1989). Applied to market traders, perceived usefulness attaches less to the technology itself than to whether customers will pay through it.

[H3]
2.2.2 Financial Intermediation Theory

Financial intermediation theory explains the gain from moving payments onto an account-based system: records accumulate, and those records can support a credit assessment the trader could not otherwise obtain.

[H2]
2.3 Empirical Review

Adeyemi (2021) surveyed traders in Ibadan and reported higher recorded turnover among adopters, though the study did not separate adoption from pre-existing business size. Okonkwo and Bassey (2019) found a weaker association in rural markets, attributing the difference to agent liquidity.

Evidence from East African markets is more settled, with several studies reporting improved consumption smoothing among adopting households. The Nigerian picture differs in that bank branch coverage is denser, so mobile money substitutes for cash rather than for a bank account.

[H2]
2.4 Gap in the Literature

No study located by this review examines Lagos State market traders specifically, and none separates the effect of adoption from the prior scale of operation. This study addresses both gaps.`,
};

/**
 * What the AI wrote first. The specialist upload (CHAPTER_TEXT above) is the
 * corrected version of this, so the read-back genuinely differs from the draft
 * and the COO has real changes to review.
 */
const CHAPTER_AI_TEXT: Record<number, string> = {
  1: `[H1]
CHAPTER ONE
INTRODUCTION

[H2]
1.1 Background to the Study

Mobile money services have spread across Nigerian urban markets over the past decade. Traders who once held cash overnight now settle balances through agent networks and mobile wallets (Adeyemi, 2021).

[H2]
1.2 Statement of the Problem

Although adoption figures are published regularly, little evidence connects mobile money use to the operating performance of individual traders in Lagos State.

[H2]
1.3 Aim and Objectives of the Study

The aim of this study is to examine the effect of mobile money adoption on the business performance of market traders in Lagos State.

The objectives are:

1. To determine the level of mobile money adoption among market traders in Lagos State.
2. To examine the relationship between mobile money adoption and recorded sales turnover.
3. To assess the effect of mobile money adoption on access to working capital.
4. To identify the constraints traders face in using mobile money services.

[H2]
1.4 Research Questions

1. What is the level of mobile money adoption among market traders in Lagos State?
2. What relationship exists between mobile money adoption and recorded sales turnover?

[H2]
1.5 Research Hypotheses

H01: Mobile money adoption has no significant effect on the recorded sales turnover of market traders in Lagos State.

[H2]
1.6 Significance of the Study

The findings offer market associations and service providers evidence drawn from traders themselves.

[H2]
1.7 Scope of the Study

The study covers registered traders in Lagos State markets.`,
  2: `[H1]
CHAPTER TWO
LITERATURE REVIEW

[H2]
2.1 Conceptual Framework

Mobile money is understood here as the storage and transfer of value through a mobile network account. Business performance is treated as a composite of recorded turnover and access to working capital.

[H2]
2.2 Theoretical Framework

The Technology Acceptance Model holds that perceived usefulness and perceived ease of use together explain intention to adopt a technology (Davis, 1989).

Financial intermediation theory explains the gain from moving payments onto an account-based system.

[H2]
2.3 Empirical Review

Adeyemi (2021) surveyed traders in Ibadan and reported higher recorded turnover among adopters. Okonkwo and Bassey (2019) found a weaker association in rural markets.

[H2]
2.4 Gap in the Literature

No study located by this review examines Lagos State market traders specifically.`,
};

async function main(): Promise<void> {
  assertLocalDatabase("demo:seed");
  console.log("\nSeeding EduCraft HQ demo data (chapter review walkthrough)\n");

  const passwordHash = await bcrypt.hash(DEMO.password, 10);

  // ── The COO login the video is filmed with ────────────────────────────────
  const coo = await db.user.upsert({
    where: { email: DEMO.cooEmail },
    update: { passwordHash, role: "COO", isActive: true },
    create: { email: DEMO.cooEmail, displayName: "Demo COO", passwordHash, role: "COO", isActive: true },
  });
  await db.execProfile.upsert({
    where: { userId: coo.id },
    update: { fullName: "Demo COO", title: "Chief Operating Officer" },
    create: { userId: coo.id, fullName: "Demo COO", title: "Chief Operating Officer", email: DEMO.cooEmail },
  });
  console.log(`  COO login        ${DEMO.cooEmail}`);

  // ── The specialist whose upload the COO reviews ───────────────────────────
  const workerUser = await db.user.upsert({
    where: { email: DEMO.workerEmail },
    update: { passwordHash, role: "WORKER", isActive: true },
    create: { email: DEMO.workerEmail, displayName: "Demo Specialist", passwordHash, role: "WORKER", isActive: true },
  });
  const worker = await db.worker.upsert({
    where: { workerId: DEMO.workerCode },
    update: { userId: workerUser.id, status: "Active" },
    create: {
      workerId: DEMO.workerCode,
      userId: workerUser.id,
      fullName: "Demo Specialist",
      phone: "08000000001",
      email: DEMO.workerEmail,
      status: "Active",
    },
  });
  console.log(`  Specialist       ${DEMO.workerCode}`);

  // ── The project ───────────────────────────────────────────────────────────
  const service = await db.service.findFirstOrThrow({ where: { serviceCode: "FYP-FULL" } });
  const university = await db.university.findFirstOrThrow({ orderBy: { name: "asc" } });

  const client = await db.client.upsert({
    where: { clientId: DEMO.clientCode },
    update: {},
    create: {
      clientId: DEMO.clientCode,
      fullName: "Adaeze Nwosu",
      phone: "08000000002",
      email: DEMO.clientEmail,
      universityId: university.id,
      faculty: "Faculty of Management Sciences",
      department: "Business Administration",
      level: "400",
    },
  });

  const price = service.basePrice;
  const project = await db.project.upsert({
    where: { projectId: DEMO.projectCode },
    update: { status: "IN_PROGRESS" },
    create: {
      projectId: DEMO.projectCode,
      clientId: client.id,
      serviceId: service.id,
      workerId: worker.id,
      projectTitle: "Mobile Money Adoption and the Business Performance of Market Traders in Lagos State",
      status: "IN_PROGRESS",
      price,
      downpaymentAmount: price * 0.45,
      balanceAmount: price * 0.55,
      downpaymentStatus: "Verified",
      balanceStatus: "Unpaid",
      chapterCount: 5,
      referencingStyle: "APA_7TH",
      clientDeadline: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000),
      internalDeadline: new Date(Date.now() + 18 * 24 * 60 * 60 * 1000),
      expectedDeliveryAt: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000),
      assignedDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      workerAccepted: true,
      workerAcceptedDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      // Marked as a test project, so the founder's cleanup tooling recognises it.
      testFlaggedAt: new Date(),
      testFlagNote: "Demo data for the walkthrough videos (scripts/demo-seed.ts).",
    },
  });
  console.log(`  Project          ${DEMO.projectCode}`);

  // ── An approved research mode, so the Report tab reads normally ───────────
  await db.researchMode.upsert({
    where: { projectId: project.id },
    update: {},
    create: {
      projectId: project.id,
      modeNumber: 2,
      modeName: "SURVEY",
      department: "Business Administration",
      referencingStyle: "APA_7TH",
      cooApprovedBy: coo.id,
      cooApprovedByName: "Demo COO",
      cooApprovedAt: new Date(),
      isLocked: true,
    },
  });

  // -- Chapters 1 and 2 written; Chapter 3 being written --------------------
  // Two passes: the corrected text is built first and its bytes kept aside as
  // the specialist upload, then the checkpoint is set back to the rougher text
  // the AI wrote, so the COO compares two genuinely different documents.
  const applicableFor = (n: number) => (n === 1 ? 47 : 46);

  async function setChapterText(chapterNumber: number, text: string): Promise<void> {
    const outputHash = chapterTextHash(text);
    await db.generationCheckpoint.upsert({
      where: { projectId_chapterNumber: { projectId: project.id, chapterNumber } },
      update: { status: "COMPLETED", fullOutput: text, outputHash, completedAt: new Date() },
      create: {
        projectId: project.id,
        chapterNumber,
        status: "COMPLETED",
        fullOutput: text,
        outputHash,
        promptText: "(demo fixture - the real prompt is assembled by src/lib/generation/prompt-loader.ts)",
        briefText: "(demo fixture)",
        promptMeta: { demo: true },
        startedAt: new Date(Date.now() - 60 * 60 * 1000),
        completedAt: new Date(),
      },
    });
    await db.chapterCheck.upsert({
      where: {
        projectId_chapterNumber_subject_textHash: { projectId: project.id, chapterNumber, subject: "AI_TEXT", textHash: outputHash },
      },
      update: { status: "PASSED", settledAt: new Date() },
      create: {
        projectId: project.id,
        chapterNumber,
        subject: "AI_TEXT",
        textHash: outputHash,
        status: "PASSED",
        applicable: applicableFor(chapterNumber),
        passedCount: applicableFor(chapterNumber),
        rewritable: true,
        settledAt: new Date(),
      },
    });
  }

  // Pass 1 - build the corrected text as a document and keep its bytes.
  for (const key of Object.keys(CHAPTER_TEXT)) await setChapterText(Number(key), CHAPTER_TEXT[Number(key)]);
  await ensureDeliverables(project.id);
  await ensureChapterDrafts(project.id);

  const correctedBytes = new Map<number, Uint8Array>();
  for (const chapterNumber of [1, 2]) {
    const item = await db.projectDeliverable.findFirstOrThrow({
      where: { projectId: project.id, kind: "CHAPTER", chapter: chapterNumber, archivedAt: null },
      include: { versions: { orderBy: { version: "desc" }, include: { file: true } } },
    });
    const built = item.versions.find((v) => v.submittedByRole === "SYSTEM");
    if (!built || !built.file.blobPathname) throw new Error(`Chapter ${chapterNumber}: nothing was built to use as the upload`);
    const bytes = await readFileBytes(built.file.blobPathname, 50 * 1024 * 1024);
    if (!bytes) throw new Error(`Chapter ${chapterNumber}: could not read what was built`);
    correctedBytes.set(chapterNumber, bytes);
    // Drop it: the AI draft on record is the rougher one built next.
    const builtPath = built.file.blobPathname;
    await db.deliverableVersion.delete({ where: { id: built.id } });
    await db.projectFile.delete({ where: { id: built.fileId } }).catch(() => undefined);
    await deleteStoredFile(builtPath).catch(() => undefined);
  }

  // Pass 2 - the AI draft the specialist started from.
  for (const key of Object.keys(CHAPTER_AI_TEXT)) await setChapterText(Number(key), CHAPTER_AI_TEXT[Number(key)]);
  await ensureChapterDrafts(project.id);

  await db.generationCheckpoint.upsert({
    where: { projectId_chapterNumber: { projectId: project.id, chapterNumber: 3 } },
    update: { status: "WRITING" },
    create: {
      projectId: project.id,
      chapterNumber: 3,
      status: "WRITING",
      promptText: "(demo fixture)",
      briefText: "(demo fixture)",
      promptMeta: { demo: true },
      startedAt: new Date(),
    },
  });

  // ── The orchestrator run (chapter review only applies to a written report) ─
  await db.orchestratorRun.upsert({
    where: { projectId: project.id },
    update: { status: "GENERATING", currentChapter: 3 },
    create: {
      projectId: project.id,
      status: "GENERATING",
      currentChapter: 3,
      runner: process.env.ORCHESTRATOR_RUNNER ?? "demo",
      startedById: coo.id,
      startedByName: "Demo COO",
      startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      // Parked far ahead and leased, so no tick picks a fixture up and spends credits.
      nextCheckAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      lockedUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    },
  });

  console.log("  AI drafts        built for Chapters 1 and 2");

  // ── The specialist's uploads: the draft, re-registered as their version ───
  for (const chapterNumber of [1, 2]) {
    const item = await db.projectDeliverable.findFirstOrThrow({
      where: { projectId: project.id, kind: "CHAPTER", chapter: chapterNumber, archivedAt: null },
      include: { versions: { orderBy: { version: "desc" } } },
    });
    if (item.versions.some((v) => v.submittedByRole !== "SYSTEM")) {
      console.log(`  Chapter ${chapterNumber}        upload already present`);
      continue;
    }
    const bytes = correctedBytes.get(chapterNumber);
    if (!bytes) throw new Error(`Chapter ${chapterNumber}: no corrected document to upload`);

    const pathname = buildPrivatePath({
      projectDbId: project.id,
      purpose: "deliverable",
      targetId: item.id,
      random: rand24(),
      ext: "docx",
    });
    await putPrivateFile(pathname, bytes, DOCX);
    const file = await db.projectFile.create({
      data: {
        projectId: project.id,
        deliverableId: item.id,
        fileName: `Chapter ${chapterNumber} (reviewed).docx`,
        fileUrl: `local-file:${pathname}`,
        fileSize: bytes.byteLength,
        fileType: DOCX,
        category: "from_worker",
        uploadedBy: workerUser.id,
        uploaderRole: "WORKER",
        storage: "PRIVATE_BLOB",
        blobPathname: pathname,
      },
    });
    const version = await db.deliverableVersion.create({
      data: {
        deliverableId: item.id,
        version: (item.versions[0]?.version ?? 0) + 1,
        fileId: file.id,
        status: "SUBMITTED",
        submittedById: workerUser.id,
        submittedByRole: "WORKER",
        workerNote:
          chapterNumber === 1
            ? "Reviewed and corrected. Tightened 1.2 and checked every citation against the reference list."
            : "Reviewed and corrected. Expanded the empirical review and fixed the heading levels in 2.2.",
      },
    });
    // Read it back with the real reader, so the summary the COO sees is genuine.
    const { readback, text } = await ensureReadback(version.id);
    console.log(
      `  Chapter ${chapterNumber}        uploaded + read back (${readback.blocking.length} blocking, ${(readback.summary?.placeholders ?? []).length} blanks)`,
    );

    // The chapter gate's verdict on the upload: without a passing row the COO cannot approve.
    const uploadHash = chapterTextHash(text ?? "");
    const applicable = chapterNumber === 1 ? 47 : 46;
    await db.chapterCheck.upsert({
      where: {
        projectId_chapterNumber_subject_textHash: { projectId: project.id, chapterNumber, subject: "UPLOAD", textHash: uploadHash },
      },
      update: { status: "PASSED", versionId: version.id, settledAt: new Date() },
      create: {
        projectId: project.id,
        chapterNumber,
        subject: "UPLOAD",
        versionId: version.id,
        textHash: uploadHash,
        status: "PASSED",
        applicable,
        passedCount: applicable,
        rewritable: true,
        settledAt: new Date(),
      },
    });

    // Chapter 1 is already approved; Chapter 2 is what the COO approves on camera.
    if (chapterNumber === 1) {
      await db.deliverableVersion.update({
        where: { id: version.id },
        data: { status: "RELEASED", releaseNo: 1, releasedAt: new Date(), reviewedById: coo.id, reviewedAt: new Date() },
      });
      console.log("  Chapter 1        approved");
    }
  }

  console.log(
    [
      "",
      "Done.",
      "",
      "  Sign in at  http://localhost:3000/login",
      `  COO         ${DEMO.cooEmail}`,
      `  Password    ${DEMO.password}`,
      "",
      `  Project     ${DEMO.projectCode} — Documents tab`,
      "              Chapter 1  Approved",
      "              Chapter 2  Waiting for approval   <- the subject of the video",
      "              Chapter 3  Being written",
      "",
      "  Remove it all with:  npm run demo:terminate",
      "",
    ].join("\n"),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void db.$disconnect());
