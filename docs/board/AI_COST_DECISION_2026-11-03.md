# AI Cost: the Decision and the Numbers

**EduCraft HQ — board memo · 3 November 2026 · prepared for Prince Amadin (CEO)**

---

## The decision in one paragraph

EduCraft will **not** build or self-host its own language model. The report pipeline stays on the
Claude API, re-engineered so that the one measured leak — regenerating a whole chapter to fix a
three-paragraph fault — is replaced by an in-place repair that costs about 2% as much. The company's
moat is kept where it actually lives: the prompt library, the 71 formatting rules, the anti-AI voice
rules, the 89-check quality gate and the orchestrator — all EduCraft's own property — while the
model behind them stays a swappable commodity.

---

## 1. What we measured (not estimated)

On 3 November every Claude API call EduCraft HQ has ever made was measured from the usage log
(510 calls; the report is reproducible with `npm run report:ai-cost`, and the frozen baseline is
`scripts/tmp/ai-cost-baseline-2026-11-03.json`).

| Fact | Measured value |
|---|---|
| All-time Claude spend, everything included | **₦32,402** |
| Full reports generated to date | 11 |
| **Median cost of a full report** | **₦2,905** |
| Mean cost of a full report | ₦2,580 |
| Most expensive report ever (EC-00010) | **₦5,609** |
| What the finance structure already funds per ₦70,000 report (claude_api pot, 6% of referred revenue) | **₦4,200** |

**The working assumption of ₦15,000–20,000 per report is not in the data.** No report has ever
cost more than ₦5,609. The figure that alarmed us was the *build period's total spend* (development,
testing and rewrites concentrated in September–October) read against single reports, compounded by
two reporting defects fixed today: timed-out calls were logged at ₦0 and refusals were logged as
successes, so the dashboard under-reported, and the claude_api pot carried development debt
(−₦19,643, reset 1 October) that made ongoing costs feel worse than they were.

**The leak itself, however, is real and was correctly diagnosed:**

| Where every naira went (all-time) | ₦ | Share |
|---|---|---|
| First attempts (the actual writing, research, checks) | ₦23,469 | 72% |
| **Whole-chapter re-generations** | **₦6,464** | **20%** |
| Gate re-checks of rewritten text | ₦1,614 | 5% |
| Empty replies re-asked (silent retries) | ₦756 | 2% |
| Second tries (`_notool` / `_retry` re-sends) | ₦99 | <1% |

On the only two **real client reports**, waste was far worse than the average: **EC-00010 spent 62%
of its ₦5,609 on rewrites and re-checks; EC-00002 spent 61% of its ₦4,308** — each rewrite
re-paying a chapter's full plan and every part (₦450–2,200) to fix faults like a cross-reference, an
undefined equation symbol, or a table never referred to.

## 2. Why we are not building our own model

A full report is only ~18,000 output tokens of work. At 1,000 reports/year that is roughly 50–500
GPU-hours; a dedicated A100 bills 8,760 hours/year (~$15,800 ≈ **₦23.7M — five times the entire
historical Claude spend — to sit idle over 95% of the time**). Training a competitive model from
scratch is a multi-million-dollar exercise that would produce something weaker than freely available
open-weight models; and renting open weights (Qwen3-32B ≈ $0.10/$0.30 per million tokens) is already
matched by **Claude Haiku 5.5 at $0.10/$0.50 — $0.05/$0.25 on the half-price Batch API** — with no
GPUs, no ML-ops hire, and no Lagos power dependency. "Build our own model" would convert a small,
per-report cost into a larger fixed cost plus an engineering liability.

**Recorded trigger to revisit:** volume past ~5,000 reports/year *and* Haiku measurably failing the
89-check gate on bulk chapters. Until both hold, the fine-tuned open-weight option stays on the
shelf.

## 3. What shipped today (3 November 2026)

| # | Change | Status | Effect |
|---|---|---|---|
| 1 | **Honest books**: timed-out calls now log an estimated cost (status `timeout`), refusals and no-tool replies log as errors, thinking tokens and batch flags are recorded, correct prices for Haiku 5.5/Sonnet 5.5 (incl. their 0.05× cache reads), per-model cache rates, indexes on the usage log | Shipped | Measurement is now trustworthy; the old books under-reported |
| 2 | **Burn-vs-funding card** on the AI usage page: actual Claude burn beside what the month's projects put into the claude_api pot, plus the per-report budget (₦4,200) | Shipped | The blind spot that let the pot go negative unnoticed is closed |
| 3 | **`npm run report:ai-cost`**: per-report cost, waste split (regenerations, retries, re-checks), by subsystem/model, baseline JSON | Shipped | The before/after instrument for this memo's next edition |
| 4 | **Surgical chapter repair**: a failed chapter check whose every failure is fixable in place (banned phrase, invented citation, table never referred to, undefined symbol…) is now patched by one ~₦30–60 call — exact find→replace pairs, applied only where the anchor occurs verbatim and exactly once — instead of regenerating the chapter for ₦450–2,200. Two repairs, then the old rewrite path; founder kill-switch (`chapter_check_repairs`) | Shipped (54-check proof suite; live pilot pending) | Attacks the measured 25% waste line directly; on an EC-00010-shaped report, ~₦3,000 of its ₦3,468 waste |
| 5 | **The uncapped button capped**: a human-triggered chapter re-generation previously reset its own counter — unlimited ₦450–2,200 clicks. Now capped at 6 total generations per chapter, with the confirmation dialog stating the real measured cost | Shipped | Closes the worst-case tail |
| 6 | **Empty replies no longer re-paid blind**: ~1 in 8 part calls returned thinking and no text and was re-sent identically; the retry now instructs the model to write immediately | Shipped | Measured incidence 1-in-8; expect most of the ₦756 line to disappear |
| 7 | **Reference abstracts trimmed 4,000 → 800 chars** in the chapter prompt (the single largest prompt item, re-sent every call; our own classifiers already use 500–700) | Shipped (new runs only) | Smaller cache writes/reads per run |
| 8 | **Opus retry calls now cache their system prompt** (aim/objectives/judge/abstract second tries re-read at 0.05×) | Shipped | Small, free |
| 9 | **Effort lever installed** (`generation_effort` Setting): chapter writing currently runs at Claude's default `high` effort, and by our own measurement half to two-thirds of every part's output tokens are *thinking that is then discarded*. The Setting flips plans/parts to `medium` or `low`, frozen per run | Shipped, **off by default** | Expected 20–30% off chapter spend (~₦500–700/report) — to be turned on only after a gate-validated pilot |

**Deliberately not done, with reasons on record:** the Message Batches API (50% off everything
nobody waits for — worth ~₦300–600/report, needs its own carefully-tested phase because the gate and
research runners must learn to park on a batch); the 1-hour cache option (real data pauses last days,
beyond any cache, so the doubled write price would cost more than it saves); replacing the
supervisor-page grouping call (a product feature, the founder's call, ~₦25/report).

## 4. How the result will be measured

The previous result is frozen (§1). After the next **10 real client reports** run through the
repaired pipeline, `npm run report:ai-cost -- --days 60` is run again and the two editions of this
table go to the board side by side:

| Metric | Baseline (3 Nov 2026) | Target | Next measurement |
|---|---|---|---|
| Median cost per report | ₦2,905 | **≤ ₦1,500** (with effort lever on) | — |
| Worst report in the window | ₦5,609 | **≤ ₦2,500** | — |
| Waste share (regens + retries + re-checks) | 28% overall; **61–62% on real client reports** | **≤ 10%** | — |
| Gate score | 85–89 / 89 | **unchanged — any lever that costs gate points is reverted** | — |
| Spend vs the ₦4,200/report the pot funds | median 69% | **≤ 35%** | — |

## 5. What this means at scale (projection, not measurement)

At the measured median and the post-change target, against the ₦4,200/report the cashflow structure
already allocates:

| Volume | At baseline ₦2,905 | At target ~₦1,200 | Pot funding |
|---|---|---|---|
| 1,000 reports/yr | ₦2.9M | **~₦1.2M** | ₦4.2M |
| 15,000 reports/yr (₦1bn plan) | ₦43.6M | **~₦18M (≈1.8% of revenue)** | ₦63M |

The AI line was never the threat to the ₦1bn plan; the unmeasured rewrite loop was, and it is now
instrumented, capped and largely replaced.

---

*Prepared from production data in `AiUsageLog` (510 calls) and the EduCraft cashflow structure v1.
Reproduce with `npm run report:ai-cost -- --all`. Baseline snapshot:
`scripts/tmp/ai-cost-baseline-2026-11-03.json` (git-ignored; keep a copy with this memo).*
