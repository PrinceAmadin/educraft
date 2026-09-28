/**
 * Phase D9: the scheduler that wakes the chapter orchestrator.
 *
 * Vercel runs this project's scheduled jobs once a day at most, so the
 * orchestrator's tick is called by the database instead: a Supabase scheduled
 * job (pg_cron) POSTs to /api/internal/orchestrator/tick every 30 seconds
 * (pg_net), with the secret kept in Supabase Vault. A second job clears the
 * scheduler's own history daily, because Supabase never does.
 *
 *   npm run orchestrator:schedule              what is there now, and what --apply would do (changes nothing)
 *   npm run orchestrator:schedule -- --apply   create or update the two jobs
 *   npm run orchestrator:schedule -- --status  the jobs and their last runs
 *   npm run orchestrator:schedule -- --remove  remove the two jobs (the secrets stay in the vault)
 *   … -- --url https://…                       another address than production's
 *   … -- --every 60                            seconds between ticks (default 30)
 *
 * Needs DIRECT_URL (or DATABASE_URL) and, for --apply, ORCHESTRATOR_TICK_SECRET:
 * the same value the deployment has in its environment. The secret is never
 * printed and never written to a file; it goes into the vault, and the job reads
 * it from there each time it fires.
 *
 * This is outside Prisma on purpose: the jobs live in the `cron` schema, which
 * no migration touches, so `prisma migrate diff` stays clean.
 */
import { PrismaClient } from "@prisma/client";

const TICK_JOB = "educraft-orchestrator-tick";
const CLEANUP_JOB = "educraft-cron-history-cleanup";
const URL_SECRET = "educraft_orchestrator_tick_url";
const KEY_SECRET = "educraft_orchestrator_tick_secret";
const DEFAULT_URL = "https://educraft-hq.vercel.app/api/internal/orchestrator/tick";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const url = value("url") ?? DEFAULT_URL;
const every = Math.round(Number(value("every") ?? 30));

/** What the job runs. It names the vault's secrets, never their values. */
const TICK_COMMAND = `select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name = '${URL_SECRET}'),
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = '${KEY_SECRET}')
  ),
  body := jsonb_build_object('depth', 1),
  timeout_milliseconds := 8000
) as request_id;`;

const CLEANUP_COMMAND = `delete from cron.job_run_details where end_time < now() - interval '7 days';`;

function fail(message: string): never {
  console.error(`\n${message}\n`);
  process.exit(1);
}

function versionAtLeast(version: string | null | undefined, major: number, minor: number): boolean {
  const [a, b] = (version ?? "0.0").split(".").map((n) => Number.parseInt(n, 10) || 0);
  return a > major || (a === major && b >= minor);
}

async function main() {
  const connection = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connection) fail("DIRECT_URL is not set. Run this through `npm run orchestrator:schedule`, which loads .env.local.");
  if (!/^https:\/\//.test(url) && !flag("allow-http")) fail(`The tick address must be https (got ${url}).`);
  if (!Number.isFinite(every) || every < 5 || every > 3600) fail("--every is the seconds between ticks, from 5 to 3600.");

  const db = new PrismaClient({ datasources: { db: { url: connection } } });
  try {
    const extensions = await db.$queryRawUnsafe<{ name: string; default_version: string | null; installed_version: string | null }[]>(
      `select name, default_version, installed_version from pg_available_extensions where name in ('pg_cron', 'pg_net', 'supabase_vault') order by name`,
    );
    const ext = (name: string) => extensions.find((e) => e.name === name);
    const cron = ext("pg_cron");
    const net = ext("pg_net");
    const vault = ext("supabase_vault");
    console.log("Extensions on this database:");
    for (const name of ["pg_cron", "pg_net", "supabase_vault"]) {
      const e = ext(name);
      console.log(`  ${name.padEnd(16)} ${e ? (e.installed_version ? `on (${e.installed_version})` : `available (${e.default_version}), not switched on`) : "NOT AVAILABLE"}`);
    }
    if (!cron || !net) fail("This database does not offer pg_cron and pg_net, so it cannot call the tick. Use a Vercel Pro cron instead.");
    if (!vault?.installed_version) fail("Supabase Vault is not switched on for this database, so there is nowhere safe to keep the secret.");

    const cronOn = Boolean(cron.installed_version);
    // Schedules in seconds need pg_cron 1.5 or later (Supabase: Postgres 15.1.1.61 or later).
    const seconds = versionAtLeast(cron.installed_version ?? cron.default_version, 1, 5);
    const schedule = every < 60 ? (seconds ? `${every} seconds` : "* * * * *") : every % 60 === 0 && every <= 3540 ? `*/${every / 60} * * * *` : fail("Above 59 seconds, --every must be whole minutes.");
    if (every < 60 && !seconds) console.log(`\nThis pg_cron is older than 1.5, so it cannot run every ${every} seconds: the tick would run every minute instead.`);

    const jobs = cronOn
      ? await db.$queryRawUnsafe<{ jobid: bigint; jobname: string | null; schedule: string; active: boolean }[]>(`select jobid, jobname, schedule, active from cron.job where jobname in ('${TICK_JOB}', '${CLEANUP_JOB}') order by jobname`)
      : [];
    console.log("\nScheduled jobs now:");
    if (!jobs.length) console.log("  none");
    for (const j of jobs) console.log(`  ${String(j.jobname).padEnd(34)} ${j.schedule.padEnd(14)} ${j.active ? "active" : "switched off"}`);

    if (flag("status")) {
      if (!cronOn) return;
      const runs = await db.$queryRawUnsafe<{ jobname: string | null; status: string | null; start_time: Date | null; return_message: string | null }[]>(
        `select j.jobname, d.status, d.start_time, left(d.return_message, 80) as return_message
           from cron.job_run_details d join cron.job j on j.jobid = d.jobid
          where j.jobname in ('${TICK_JOB}', '${CLEANUP_JOB}')
          order by d.start_time desc limit 12`,
      );
      console.log("\nLast runs:");
      if (!runs.length) console.log("  none yet");
      for (const r of runs) console.log(`  ${r.start_time?.toISOString() ?? "—"}  ${String(r.jobname).padEnd(34)} ${r.status ?? ""}  ${r.return_message ?? ""}`);
      const answers = await db
        .$queryRawUnsafe<{ status_code: number | null; n: bigint; last: Date | null }[]>(`select status_code, count(*) as n, max(created) as last from net._http_response where created > now() - interval '30 minutes' group by status_code order by status_code`)
        .catch(() => []);
      console.log("\nWhat the tick address answered in the last 30 minutes (every request this database made):");
      if (!answers.length) console.log("  nothing");
      for (const a of answers) console.log(`  HTTP ${a.status_code ?? "no answer"}  × ${a.n}  (last ${a.last?.toISOString() ?? "—"})`);
      return;
    }

    if (flag("remove")) {
      if (!cronOn) return console.log("\npg_cron is not switched on: there is nothing to remove.");
      for (const name of [TICK_JOB, CLEANUP_JOB]) {
        if (jobs.some((j) => j.jobname === name)) {
          await db.$executeRawUnsafe(`select cron.unschedule('${name}')`);
          console.log(`\nRemoved ${name}.`);
        }
      }
      console.log("\nThe orchestrator is no longer woken by the database. Reports move only when someone presses Start, verifies data or retries a chapter.");
      return;
    }

    console.log("\nWhat --apply does:");
    if (!cronOn) console.log("  1. switches on pg_cron");
    if (!net.installed_version) console.log("  1. switches on pg_net");
    console.log(`  2. keeps the tick address (${url}) and the secret in Supabase Vault as ${URL_SECRET} and ${KEY_SECRET}`);
    console.log(`  3. schedules ${TICK_JOB}: "${schedule}"`);
    console.log(`  4. schedules ${CLEANUP_JOB}: "15 3 * * *" (clears the scheduler's history older than 7 days)`);
    console.log("\nThe tick job runs:\n");
    console.log(TICK_COMMAND.split("\n").map((l) => `    ${l}`).join("\n"));

    if (!flag("apply")) {
      console.log("\nNothing was changed. Add -- --apply to do it.");
      return;
    }

    const secret = process.env.ORCHESTRATOR_TICK_SECRET;
    if (!secret || secret.length < 32) fail("ORCHESTRATOR_TICK_SECRET is not set (or is shorter than 32 characters). It must be the value the deployment has.");

    if (!cronOn) await db.$executeRawUnsafe(`create extension if not exists pg_cron with schema pg_catalog`);
    if (!net.installed_version) await db.$executeRawUnsafe(`create extension if not exists pg_net with schema extensions`);

    for (const [name, secretValue, description] of [
      [URL_SECRET, url, "EduCraft HQ: the chapter orchestrator's tick address"],
      [KEY_SECRET, secret, "EduCraft HQ: the secret the scheduler sends with every tick (ORCHESTRATOR_TICK_SECRET)"],
    ] as const) {
      const existing = await db.$queryRaw<{ id: string }[]>`select id::text as id from vault.secrets where name = ${name}`;
      if (existing.length) await db.$executeRaw`select vault.update_secret(${existing[0].id}::uuid, ${secretValue}, ${name}, ${description})`;
      else await db.$executeRaw`select vault.create_secret(${secretValue}, ${name}, ${description})`;
    }
    console.log("\nThe address and the secret are in the vault.");

    await db.$executeRaw`select cron.schedule(${TICK_JOB}, ${schedule}, ${TICK_COMMAND})`;
    await db.$executeRaw`select cron.schedule(${CLEANUP_JOB}, '15 3 * * *', ${CLEANUP_COMMAND})`;
    console.log(`Scheduled ${TICK_JOB} ("${schedule}") and ${CLEANUP_JOB}.`);
    console.log("\nCheck it in a minute with: npm run orchestrator:schedule -- --status");
    console.log(`Undo it with:               npm run orchestrator:schedule -- --remove`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
