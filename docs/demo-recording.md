# Recording a walkthrough video

How to film EduCraft HQ's real screens without touching production.

The demo scripts build a complete report project whose chapters sit in the
states a chapter-review video needs, plus a COO login to film it with. They run
against a **throwaway Postgres on your own machine**, never the live database.

---

## Why not just record production

Three reasons, and the scripts enforce the first one:

1. **The demo COO password is written in the source.** A login with a known
   password on the live HQ would let anyone who sees the script — a video
   editor, say — sign in as a COO. `demo:seed` and `demo:terminate` refuse to
   run unless `DATABASE_URL` points at `localhost`.
2. **Real client names, universities and project titles** would be on screen,
   relying on blur to catch every one.
3. A demo project on the live database **lands in real revenue and operations
   figures** until it is deleted.

---

## One-time setup

You need PostgreSQL installed (`initdb` and `pg_ctl` on your PATH). Paths below
assume the EduCraft HQ project root.

### 1. Create a throwaway cluster

```bash
initdb -D ./.demo-pgdata -U postgres --auth=trust -E UTF8 --no-locale
```

### 2. Start it on a spare port

```bash
pg_ctl -D ./.demo-pgdata -l ./.demo-pgdata/pg.log -o "-p 55432 -c listen_addresses=127.0.0.1" start
```

### 3. Create the database

```bash
psql -h 127.0.0.1 -p 55432 -U postgres -c "CREATE DATABASE educraft_demo;"
```

### 4. Write `.env.demo` in the project root

It is gitignored. Nothing in it is a real secret.

```
DATABASE_URL="postgresql://postgres@127.0.0.1:55432/educraft_demo?schema=public&connect_timeout=60"
DIRECT_URL="postgresql://postgres@127.0.0.1:55432/educraft_demo?schema=public&connect_timeout=60"
AUTH_SECRET="demo-only-secret-not-used-anywhere-else-0123456789"
NEXTAUTH_SECRET="demo-only-secret-not-used-anywhere-else-0123456789"
AUTH_URL="http://localhost:3000"
NEXTAUTH_URL="http://localhost:3000"
SEED_ADMIN_EMAIL="demo.founder@educraft-demo.test"
SEED_ADMIN_PASSWORD="EduCraft@Demo2026"
PRIVATE_FILES_DRIVER="local"
QA_NOTIFY_ONLY="demo.founder@educraft-demo.test"
NEXT_PUBLIC_SITE_URL="http://localhost:3000"
ORCHESTRATOR_RUNNER="demo"
```

`PRIVATE_FILES_DRIVER=local` keeps the chapter `.docx` files in `.private-files/`
instead of the private Blob store. `QA_NOTIFY_ONLY` makes sure no alert can
reach the real COO or founder.

### 5. Build the schema and the base catalogue

```bash
npm run demo:migrate
```

```bash
npm run demo:base
```

```bash
npm run cashflow:seed -- --apply
```

The cashflow seed prints three `DRAW_UNFUNDED` warnings. Those are the known,
documented ones from the real structure — not a problem.

---

## Each recording session

```bash
npm run demo:seed
```

```bash
npm run demo:dev
```

Then sign in at <http://localhost:3000/login>:

| | |
|---|---|
| COO | `video.coo@educraft-demo.test` |
| Password | `EduCraft@Demo2026` |

The project is **EC-DEMO-01**, Documents tab:

<http://localhost:3000/admin/projects/EC-DEMO-01?tab=documents>

| Chapter | State on screen |
|---|---|
| Chapter 1 | Approved |
| Chapter 2 | Waiting for approval — **the subject of the video** |
| Chapters 3–5 | Being written |
| Complete project | Nothing uploaded, built from approved chapters |

Chapter 2 carries the specialist's note, the read-back summary
(`117 → 259 words · 4 → 6 headings`, a genuine before-and-after against the AI
draft), the passing quality check, and the **Approve** and **Return with
correction notes** buttons.

### Resetting between takes

Approving Chapter 2 is a real approval, so after a take that approves it:

```bash
npm run demo:terminate && npm run demo:seed
```

That signs you out — `demo:terminate` deletes the COO login, and HQ re-checks
the login on every request — so sign in again before the next take.

### When you are finished

```bash
npm run demo:terminate
```

```bash
pg_ctl -D ./.demo-pgdata stop
```

The cluster folder can then be deleted outright.

---

## Two things to watch on camera

**1. The staff wording says "AI draft".** The Documents tab is an internal
screen, so it says so plainly:

> Each chapter starts as an AI draft the specialist reviews in Word…

and Chapters 3–5 each read *"The AI is still writing this chapter."*

EduCraft never exposes internal automation to clients, so a public video must
not show those lines. Frame tightly on the chapter rows and their state chips
(Approved / Waiting for approval / Being written), or crop the explanatory line
under each heading. The state chips themselves say nothing about AI.

**2. 9:16 at 1080×1920 gives you the desktop layout.** At 1080px wide the app
renders the sidebar and the three-column overview, which reads small in a
portrait frame. For a phone-shaped video, record at a phone viewport (around
430×932) and scale up — that is also the layout 85% of EduCraft's users
actually see.

---

## What the demo data is, and is not

Everything the seed writes is a fixture: a fictional client, a fictional
specialist, and chapter text written for the demo. The **quality check results
are seeded as passing**, not computed — running the real gate costs Claude
credits and needs an API key. The screens, the states, the approval rules and
the Word read-back are all real: the file really is read back by
`src/lib/assembly/read-chapter-docx.ts`, and Approve really goes through
`approvalRefusals` in `src/lib/chapter-review.ts`.

The project is flagged as a test project (`testFlaggedAt`), so the founder's
Settings → Test data screen recognises it if a copy ever reaches a shared
database.
