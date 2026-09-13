# EDUCRAFT REFERENCE VERIFICATION SYSTEM

## Layer 2b of the EduCraft Quality Standard — Version 1.0

---

## WHAT THIS SYSTEM DOES

The Reference Verification System answers one question: **are the references in this report real, relevant, and correctly used?**

This is the quality gate that prevents the single worst failure mode EduCraft has experienced — a supervisor rejecting a report because the literature review cited papers that had nothing to do with the project topic. That failure caused a full rework and was the only external supervisor rejection in EduCraft's history.

The system has three tiers. Tier 1 is already solved. Tiers 2 and 3 are the new builds.

---

## THE THREE TIERS — OVERVIEW

```
TIER 1: EXISTENCE CHECK           → Already solved by Zotero pipeline
TIER 2: BATCH RELEVANCE CHECK     → Runs on every chapter (NEW BUILD)
TIER 3: PER-CITATION COHERENCE    → Runs on flagged + sampled chapters (NEW BUILD)
```

| Tier | What it checks | When it runs | Method | Cost per project |
|---|---|---|---|---|
| Tier 1 | Does each reference actually exist? | During research phase (before writing) | Zotero DOI/metadata verification | Already included in workflow |
| Tier 2 | Are the references topically relevant to the project? | After chapter is written, before QA | AI batch classification | ~₦25–50 (5 AI calls) |
| Tier 3 | Does each specific citation actually support the specific claim? | On flagged chapters + 10% sample | AI per-citation check | ~₦50–100 (when triggered) |
| **Total** | | | | **~₦75–150 per FYP** |

At ₦70,000 per FYP, the verification cost is 0.1–0.2% of revenue. One prevented rejection saves the entire ₦70,000 plus rework cost.

---

## TIER 1 — EXISTENCE CHECK (ALREADY SOLVED)

### How It Currently Works

EduCraft's existing research paper finding pipeline:

```
1. Worker specifies number of papers needed for topic
2. AI retrieves paper DOI + metadata
3. Metadata compiled into .bib format
4. .bib imported to Zotero
5. Zotero pulls actual PDFs
6. APA v7 references generated from Zotero metadata
7. Worker cites these references in the report
```

Every reference in an EduCraft report already has:
- A verified DOI or ISBN
- Confirmed metadata (authors, title, journal, year, volume, pages)
- An actual PDF in Zotero (the paper exists and was retrieved)

### What Tier 1 Guarantees

- 100% of references are real publications (not fabricated)
- 100% of references have correct bibliographic information
- APA v7 formatting is automated from Zotero metadata

### What Tier 1 Does NOT Guarantee

- That the papers are **relevant** to the project topic (this is Tier 2)
- That each **specific citation** supports the **specific claim** it accompanies (this is Tier 3)

### No New Work Needed

Tier 1 is operational. No changes required.

---

## TIER 2 — BATCH RELEVANCE CHECK (NEW BUILD)

### Purpose

Catch the failure that caused EduCraft's only supervisor rejection: references that are real papers but have no meaningful connection to the project topic.

### When It Runs

After a chapter is written and submitted by the worker, **before** the chapter enters the QA queue. It runs automatically as part of the submission pipeline.

```
Worker submits chapter
        ↓
System extracts references used in this chapter
        ↓
Tier 2 runs (automatic, no human trigger needed)
        ↓
Results attached to the project record
        ↓
If PASS → chapter enters QA queue
If FAIL → chapter returned to worker with specific feedback
```

### What It Checks

For each chapter that contains citations (primarily Chapter 2, but also Chapters 1, 3, 4 where citations appear):

**Input to the AI verifier:**
1. The project title
2. The project abstract (or aim + objectives if abstract isn't written yet)
3. The department
4. The list of all references cited in this chapter (title + authors + year for each)

**The AI classifies each reference into one of four categories:**

| Classification | Definition | Example |
|---|---|---|
| **CORE** | Directly addresses the project's central topic, methodology, or research question | A paper on "Microstrip Patch Antenna Design for 5G" cited in a project about 5G antenna design |
| **CLOSELY_RELATED** | Adjacent field, foundational theory, methodology source, or comparison benchmark | A paper on "Substrate Material Properties for Microwave Applications" cited in the same project |
| **TANGENTIAL** | Shares keywords but addresses a different actual subject | A paper on "5G Network Coverage Planning" cited in an antenna design project — same keyword "5G" but different subject |
| **IRRELEVANT** | No substantive connection to the project | A paper on "Social Media Marketing Strategies" cited in an antenna design project |

### The AI Prompt (Tier 2)

```
You are a research relevance classifier for academic project quality control.

PROJECT INFORMATION:
Title: {project_title}
Abstract/Objectives: {project_abstract_or_objectives}
Department: {department}
Chapter being reviewed: {chapter_number} — {chapter_title}

REFERENCES CITED IN THIS CHAPTER:
{for each reference:}
  [{index}] {author} ({year}). {title}. {journal/source}.

TASK:
For each reference, classify its relevance to the project as:
  CORE — directly addresses the project's central topic, methodology, 
         or research question
  CLOSELY_RELATED — adjacent field, foundational theory, methodology 
                    source, or comparison benchmark that supports the 
                    project's argument
  TANGENTIAL — shares keywords with the project but addresses a 
               different actual subject
  IRRELEVANT — no substantive connection to the project topic

For each reference, provide:
1. Classification (one of the four above)
2. One-sentence justification (maximum 30 words)

RESPOND IN THIS EXACT FORMAT:
[1] CORE — Directly addresses microstrip patch antenna design parameters for the same frequency band.
[2] CLOSELY_RELATED — Provides substrate material characterisation used in the antenna design methodology.
[3] TANGENTIAL — Discusses 5G network planning, not antenna hardware design.

Do not explain your reasoning beyond the one-sentence justification.
Do not add preamble or commentary.
Classify every reference listed.
```

### Pass/Fail Rules

A chapter PASSES Tier 2 if ALL three conditions are met:

| Rule | Threshold | Rationale |
|---|---|---|
| **Rule 1** | ≥75% of references classified as CORE or CLOSELY_RELATED | Ensures the majority of cited work is genuinely relevant |
| **Rule 2** | Zero references classified as IRRELEVANT | Even one irrelevant reference signals pipeline drift — where there's one, there are usually more |
| **Rule 3** | TANGENTIAL references ≤15% of total | High tangential rate is a leading indicator that the AI verifier is being generous |

### Failure Actions

| Outcome | Action | Who Sees It |
|---|---|---|
| **PASS** (all 3 rules met) | Chapter proceeds to QA queue | Results logged but no alert |
| **SOFT FAIL** (Rule 1 or 3 violated, but no IRRELEVANT) | Chapter returned to worker with list of TANGENTIAL references + suggestion to replace or justify | Worker + Admin notification |
| **HARD FAIL** (any IRRELEVANT found) | Chapter returned to worker with critical alert. All IRRELEVANT + TANGENTIAL references flagged for replacement. | Worker + Admin alert + project flagged |
| **HARD FAIL triggers Tier 3** | The failing chapter is automatically queued for Tier 3 per-citation coherence check after the worker revises and resubmits | System automatic |

### Worker Feedback Format

When a chapter fails Tier 2, the worker receives this structured feedback:

```
REFERENCE RELEVANCE CHECK — FAILED
Project: EC-00234
Chapter: 2 — Literature Review

SUMMARY:
Total references in chapter: 38
CORE: 24 (63%) ← Below 75% threshold
CLOSELY_RELATED: 5 (13%)
TANGENTIAL: 7 (18%) ← Above 15% threshold
IRRELEVANT: 2 (5%) ← Must be zero

FLAGGED REFERENCES:

IRRELEVANT (must be replaced):
[12] Adebayo, K. (2021). Social media marketing strategies 
     for SMEs in Lagos. → No connection to antenna design.
[29] Okonkwo, P. (2020). Agricultural supply chain 
     optimization in Southern Nigeria. → No connection to 
     antenna design.

TANGENTIAL (review and replace if possible):
[7]  Chen, W. (2019). 5G network planning and coverage 
     optimization. → Discusses network planning, not antenna 
     hardware.
[15] Ibrahim, A. (2022). Signal propagation in urban 
     environments. → Related to RF but not specific to 
     antenna design.
... (remaining tangential listed)

ACTION REQUIRED:
1. Replace all IRRELEVANT references with topic-relevant papers
2. Review TANGENTIAL references — replace where better 
   alternatives exist
3. Resubmit chapter for re-verification
```

### Edge Cases

**Edge Case 1 — Foundational/Seminal Works:**
A paper like "Balanis, C. (2016). Antenna Theory: Analysis and Design" will always be classified as CORE or CLOSELY_RELATED for any antenna project, even though it's a textbook not specific to the exact topic. This is correct behaviour — foundational texts are legitimate citations.

**Edge Case 2 — Methodology Sources:**
A statistics textbook cited in Chapter 3 for methodology justification may appear TANGENTIAL to the project topic but is actually CLOSELY_RELATED to the methodology. The AI prompt handles this by including "methodology source" in the CLOSELY_RELATED definition.

**Edge Case 3 — Cross-Disciplinary Projects:**
A Biomedical Engineering project might legitimately cite both engineering papers and medical papers. The AI should recognise that both domains are relevant to the project. The project abstract/objectives provided as context makes this possible.

**Edge Case 4 — Very Niche Topics:**
For extremely specialised topics, fewer CORE papers may exist. The system should not penalise a project for having more CLOSELY_RELATED than CORE if the topic is genuinely niche. The 75% threshold is CORE + CLOSELY_RELATED combined, which handles this.

**Edge Case 5 — Chapter 1 vs Chapter 2 References:**
Chapter 1 (Introduction) often cites broader contextual sources that would be TANGENTIAL in Chapter 2. The threshold is applied per-chapter, so Chapter 1 may naturally have a higher TANGENTIAL ratio than Chapter 2. Consider applying a relaxed threshold for Chapter 1: ≥60% CORE/CLOSELY_RELATED instead of 75%.

---

## TIER 3 — PER-CITATION COHERENCE CHECK (NEW BUILD)

### Purpose

Verify that each specific in-text citation actually supports the specific claim it accompanies. This catches a subtler failure than Tier 2: a reference can be topically relevant to the project but still not support the particular sentence where it's cited.

### When It Runs

Tier 3 is more expensive than Tier 2 (one AI call per citation vs. one per chapter), so it runs selectively:

| Trigger | Condition | Rationale |
|---|---|---|
| **Tier 2 failure** | Any chapter that failed Tier 2 and was revised | The revision needs verification |
| **Bad-worker flag** | Worker has 3+ Tier 2 flags in the last 30 days | Performance pattern — this worker cites loosely |
| **High-risk client** | Client whose supervisor has previously rejected EduCraft work | Paranoid mode for known-difficult supervisors |
| **Random sample** | 10% of all chapters that passed Tier 2 | Quality monitoring baseline |

### What It Checks

For each in-text citation in the chapter:

**Input:**
1. The sentence containing the citation (the claim being made)
2. The cited reference's title and abstract (retrieved from Zotero metadata or the database)

**The AI evaluates whether the source supports the claim.**

### The AI Prompt (Tier 3)

```
You are a citation coherence checker for academic quality control.

For each citation below, determine whether the cited source 
actually supports the claim being made in the sentence.

{for each citation:}

CITATION [{index}]:
Claim in the report: "{sentence_containing_citation}"
Cited source: {author} ({year}). {title}.
Source abstract: "{abstract_text}"

Classify as:
  SUPPORTS — the source substantively supports the claim
  PARTIALLY_SUPPORTS — the source is related but doesn't 
                       fully support the specific claim
  DOES_NOT_SUPPORT — the source does not support this 
                     specific claim
  CANNOT_DETERMINE — insufficient information to judge 
                     (abstract unavailable or too vague)

Provide a one-sentence justification (max 25 words).

FORMAT:
[1] SUPPORTS — Source directly reports the antenna gain value cited in this sentence.
[2] DOES_NOT_SUPPORT — Source discusses network planning, not the impedance bandwidth claimed here.
[3] PARTIALLY_SUPPORTS — Source discusses similar frequency range but different antenna geometry.
```

### Pass/Fail Rules

| Rule | Threshold | Action |
|---|---|---|
| ≥85% of citations classified as SUPPORTS | PASS | Proceed to QA |
| 70–84% SUPPORTS | SOFT FAIL | Return to worker with list of weak citations for review |
| <70% SUPPORTS | HARD FAIL | Return to worker with critical alert; senior domain reviewer must review before re-submission |
| Any citation classified as DOES_NOT_SUPPORT in a critical claim (objectives, key findings, methodology justification) | HARD FAIL regardless of overall percentage | The most important claims must have solid citation support |

### Worker Feedback Format (Tier 3)

```
CITATION COHERENCE CHECK — SOFT FAIL
Project: EC-00234
Chapter: 2 — Literature Review

SUMMARY:
Total in-text citations checked: 42
SUPPORTS: 33 (79%) ← Below 85% threshold
PARTIALLY_SUPPORTS: 5 (12%)
DOES_NOT_SUPPORT: 3 (7%)
CANNOT_DETERMINE: 1 (2%)

CITATIONS THAT DO NOT SUPPORT THEIR CLAIMS:

[14] Claim: "Microstrip antennas typically achieve gains 
     between 6 and 8 dBi (Chen, 2019)."
     Source: Chen (2019) discusses 5G network coverage, not 
     antenna gain values.
     → Replace with a source that reports antenna gain data.

[23] Claim: "The FR-4 substrate has a dielectric constant of 
     4.4 (Ibrahim, 2022)."
     Source: Ibrahim (2022) discusses signal propagation 
     models, not substrate properties.
     → Replace with a materials datasheet or characterisation 
        paper.

[31] Claim: "Recent studies have shown efficiency improvements 
     of up to 15% (Okonkwo, 2021)."
     Source: Okonkwo (2021) reports on supply chain efficiency, 
     not antenna efficiency.
     → This citation appears to be from an unrelated field. 
        Replace entirely.

PARTIALLY SUPPORTING (review recommended):
[8]  Claim: "Patch antennas offer low-profile characteristics 
     suitable for mobile devices (Pozar, 2012)."
     Source: Pozar (2012) is a general antenna textbook — 
     supports the concept but doesn't make this specific 
     claim about mobile devices.
     → Acceptable, but consider adding a more specific source.

ACTION REQUIRED:
1. Replace or correct all DOES_NOT_SUPPORT citations
2. Review PARTIALLY_SUPPORTS citations for possible improvement
3. Resubmit for re-verification
```

### Handling Abstract Availability

Tier 3 needs the abstract of each cited source. Sources of abstracts:

| Priority | Source | When Available |
|---|---|---|
| 1 | Stored in EduCraft database (from Zotero import) | If the reference was found through EduCraft's pipeline |
| 2 | Retrieved via DOI lookup (Crossref API) | For most published papers |
| 3 | Retrieved via title search (Google Scholar scraping / Semantic Scholar API) | Fallback for papers without DOI |
| 4 | CANNOT_DETERMINE classification | If no abstract can be found |

The system should attempt sources 1–3 automatically. Only if all three fail does it classify as CANNOT_DETERMINE. A high CANNOT_DETERMINE rate (>15%) triggers a warning — it may mean the references are from obscure or non-indexed sources.

---

## INTEGRATION WITH WORKBASE

### Database Additions

New models needed in the Prisma schema:

```prisma
model ReferenceVerification {
  id              String   @id @default(cuid())
  projectId       String
  project         Project  @relation(fields: [projectId], references: [id])
  chapterNumber   Int
  tier            Int      // 2 or 3
  status          String   // PASS, SOFT_FAIL, HARD_FAIL
  totalReferences Int
  coreCount       Int
  closelyRelatedCount Int
  tangentialCount Int
  irrelevantCount Int
  // Tier 3 specific
  supportsCount       Int?
  partiallySupportsCount Int?
  doesNotSupportCount Int?
  cannotDetermineCount Int?
  // Details
  details         Json     // Full classification results per reference
  feedback        String?  // Generated worker feedback text
  runAt           DateTime @default(now())
  
  // Worker performance tracking
  workerId        String?
  worker          Worker?  @relation(fields: [workerId], references: [id])
}
```

Add to Worker model:
```prisma
  tier2FlagCount      Int      @default(0)  // Rolling 30-day count
  tier2LastFlagDate   DateTime?
  referenceVerifications ReferenceVerification[]
```

Add to Project model:
```prisma
  referenceVerifications ReferenceVerification[]
```

### API Endpoints

```
POST /api/verification/tier2
  Body: { projectId, chapterNumber }
  Triggers: Tier 2 batch relevance check
  Returns: { status, summary, details, feedback }
  
POST /api/verification/tier3
  Body: { projectId, chapterNumber }
  Triggers: Tier 3 per-citation coherence check
  Returns: { status, summary, details, feedback }

GET /api/verification/results/:projectId
  Returns: All verification results for a project

GET /api/verification/worker-flags/:workerId
  Returns: Worker's Tier 2 flag history (last 30 days)

GET /api/verification/dashboard
  Returns: Aggregate verification stats (pass rates, 
           common failure patterns, worker rankings)
```

### Pipeline Integration

The verification runs as part of the project status transition:

```
Worker submits chapter (status: SUBMITTED)
        ↓
System automatically triggers Tier 2 for the chapter
        ↓
    ┌── PASS → Chapter enters QA queue (status: IN_QA_REVIEW)
    │
    ├── SOFT FAIL → Chapter returned to worker (status: REVISION_NEEDED)
    │               Worker sees feedback with flagged references
    │               Worker revises and resubmits
    │               Tier 2 runs again on resubmission
    │
    └── HARD FAIL → Chapter returned with critical alert
                    Worker's tier2FlagCount incremented
                    If tier2FlagCount >= 3 in 30 days → worker flagged
                    On resubmission → both Tier 2 AND Tier 3 run
```

### Admin Dashboard Integration

The verification dashboard shows:

```
REFERENCE VERIFICATION — This Month
────────────────────────────────────

Tier 2 Results:
  Chapters checked:        156
  Pass rate:               87%
  Soft fail rate:          10%
  Hard fail rate:          3%
  Most common failure:     TANGENTIAL references exceeding 15%

Tier 3 Results:
  Chapters checked:        23 (flagged + sampled)
  Pass rate:               82%
  Most common failure:     Citation does not support specific claim

Worker Performance:
  Workers with 0 flags:    12
  Workers with 1-2 flags:  3
  Workers with 3+ flags:   1 (Emeka — flagged for review)

Top Failure Pattern:
  "5G" keyword papers cited in hardware design chapters
  → Workers finding network-level papers instead of 
    component-level papers
  → Recommendation: update research prompt to specify 
    "component design" not just "5G"
```

This dashboard is valuable because it reveals **systemic patterns**, not just individual failures. If multiple workers are making the same citation error, the problem is the research prompt, not the workers.

---

## COST PROJECTIONS AT SCALE

### Per-Project Cost

| Tier | AI Calls | Cost per Call (estimate) | Total |
|---|---|---|---|
| Tier 2 (5 chapters × 1 call each) | 5 | ₦5–10 | ₦25–50 |
| Tier 3 (only when triggered) | 0–40 | ₦2–5 | ₦0–100 |
| **Average per FYP** | | | **₦50–80** |

### Annual Cost at Scale

| Scale | Projects/Year | Tier 2 Cost | Tier 3 Cost | Total | % of Revenue |
|---|---|---|---|---|---|
| Current (100) | 100 | ₦5,000 | ₦2,000 | ₦7,000 | 0.01% |
| Growth (500) | 500 | ₦25,000 | ₦10,000 | ₦35,000 | 0.01% |
| Target (5,000) | 5,000 | ₦250,000 | ₦100,000 | ₦350,000 | 0.05% |
| ₦1B Goal (15,000) | 15,000 | ₦750,000 | ₦300,000 | ₦1,050,000 | 0.11% |

At the ₦1B target, reference verification costs roughly **₦1M per year** — less than the revenue from **15 projects**. One prevented supervisor rejection per month pays for the entire system.

---

## THE SAMPLING LOGIC FOR TIER 3

### Decision Tree

```
Chapter submitted and passes Tier 2
        ↓
    Was this chapter previously flagged by Tier 2?
    YES → Run Tier 3 (100% of re-submissions after a flag)
    NO  ↓
    
    Does this worker have 3+ Tier 2 flags in the last 30 days?
    YES → Run Tier 3 (every chapter from flagged workers)
    NO  ↓
    
    Has this client's supervisor previously rejected EduCraft work?
    YES → Run Tier 3 (paranoid mode for high-risk supervisors)
    NO  ↓
    
    Random selection: is this chapter in the 10% sample?
    YES → Run Tier 3
    NO  → Skip Tier 3 (chapter proceeds to QA with Tier 2 PASS only)
```

### Random Sampling Implementation

The 10% sample must be truly random and non-gameable:

```javascript
// On each chapter submission that passes Tier 2:
const shouldRunTier3 = Math.random() < 0.10;
// Store the decision with the verification record
// so it can be audited later
```

Workers should NOT know whether their chapter was sampled. The system runs Tier 3 silently as a background process — the worker doesn't wait for it (they already passed Tier 2). If Tier 3 finds issues in a sampled chapter, the QA reviewer sees the results alongside their manual review, but the project isn't pulled back to the worker unless the QA reviewer decides it should be.

This design means:
- **Workers don't experience delay** from Tier 3 sampling (no UX impact)
- **QA reviewers get extra data** when reviewing sampled chapters
- **Systemic issues surface** through aggregate dashboard data
- **The system learns** which workers and which topic areas need more scrutiny

---

## REFERENCE DATA STORAGE

### What Gets Stored Per Reference

When references are imported through the Zotero pipeline, store them in a dedicated table:

```prisma
model Reference {
  id          String   @id @default(cuid())
  projectId   String
  project     Project  @relation(fields: [projectId], references: [id])
  doi         String?
  isbn        String?
  title       String
  authors     String   // Formatted author string
  year        Int
  journal     String?  // Journal name or book publisher
  volume      String?
  pages       String?
  abstract    String?  // Stored for Tier 3 lookups
  url         String?
  sourceType  String   // journal, book, conference, website, thesis
  zoteroKey   String?  // Link back to Zotero
  
  // Verification results
  tier2Classification String?  // CORE, CLOSELY_RELATED, TANGENTIAL, IRRELEVANT
  tier3Results        Json?    // Per-citation results where this reference was checked
  
  createdAt   DateTime @default(now())
}
```

**Why store abstracts:** Tier 3 needs the abstract to check whether a source supports a specific claim. If we store the abstract once during the Zotero import, we never need to retrieve it again. This saves API calls to Crossref/Semantic Scholar on every Tier 3 run.

**Storage cost:** A typical abstract is 200–300 words (~1,500 characters). For an FYP with 50 references, that's ~75KB of abstract text. At 15,000 projects/year with 50 references each, that's ~56GB of abstract storage per year. Trivial for PostgreSQL.

---

## BUILDING WITH CLAUDE CODE — IMPLEMENTATION GUIDE

### Phase 1 — Tier 2 (Build First)

**Priority:** HIGH — this is the most impactful tier.

1. Create the `ReferenceVerification` and `Reference` database models
2. Build the Tier 2 AI prompt as a server-side function
3. Build the reference extraction function (parse .docx, find all in-text citations, match to reference list)
4. Build the classification aggregation logic (count CORE, CLOSELY_RELATED, etc.)
5. Build the pass/fail evaluation against the three rules
6. Build the worker feedback generation
7. Integrate into the project status transition pipeline (after SUBMITTED, before IN_QA_REVIEW)
8. Build the admin dashboard verification stats view

**Claude Code prompt for Phase 1:**

```
Build the Tier 2 Reference Verification system. This runs 
automatically when a worker submits a chapter.

The system:
1. Extracts all references cited in the submitted chapter
2. Sends them to Claude API with the project title and 
   abstract for relevance classification
3. Each reference is classified as CORE, CLOSELY_RELATED, 
   TANGENTIAL, or IRRELEVANT
4. Applies three pass/fail rules:
   - ≥75% must be CORE or CLOSELY_RELATED
   - Zero IRRELEVANT allowed
   - TANGENTIAL must be ≤15%
5. If PASS → chapter moves to QA queue
6. If FAIL → chapter returned to worker with structured 
   feedback listing every flagged reference

Use the Anthropic API (claude-sonnet-4-6) for the 
classification. Store results in ReferenceVerification table.
Build a verification results view on the admin project 
detail page.

Reference the full spec document for the exact AI prompt, 
pass/fail thresholds, and feedback format.
```

### Phase 2 — Tier 3 (Build After Tier 2 Is Stable)

**Priority:** MEDIUM — valuable but depends on Tier 2 working first.

1. Build the per-citation extraction function (extract each citation + its surrounding sentence)
2. Build the abstract retrieval function (check database first, then Crossref API, then Semantic Scholar)
3. Build the Tier 3 AI prompt as a server-side function
4. Build the sampling logic (flagged chapters, bad workers, high-risk clients, 10% random)
5. Build the Tier 3 pass/fail evaluation
6. Build the QA reviewer view (Tier 3 results shown alongside manual review)
7. Integrate worker flag tracking (tier2FlagCount rolling 30-day window)

### Phase 3 — Dashboard & Analytics (Build After Both Tiers Work)

1. Build the verification dashboard (pass rates, failure patterns, worker rankings)
2. Build the systemic pattern detection (same failure across multiple workers = prompt problem)
3. Build the worker performance alerts (3+ flags in 30 days)

---

## TESTING THE SYSTEM

### Test Cases

Before going live, run these test scenarios:

**Test 1 — Perfect Chapter:**
Submit a chapter where all references are genuinely relevant. Expected: Tier 2 PASS with ≥90% CORE/CLOSELY_RELATED.

**Test 2 — Mixed Chapter:**
Submit a chapter with 70% relevant references and 30% tangential. Expected: Tier 2 SOFT FAIL (below 75% threshold, TANGENTIAL above 15%).

**Test 3 — Bad Chapter (Simulated Rejection Scenario):**
Submit a chapter modelled after the real rejection — literature review with papers unrelated to the topic. Expected: Tier 2 HARD FAIL with IRRELEVANT references flagged.

**Test 4 — Cross-Disciplinary Project:**
Submit a Biomedical Engineering chapter citing both engineering and medical papers. Expected: both domains classified as CORE/CLOSELY_RELATED (not TANGENTIAL).

**Test 5 — Foundational Textbook:**
Submit a chapter citing Balanis (2016) Antenna Theory for an antenna project. Expected: classified as CORE or CLOSELY_RELATED (not TANGENTIAL just because it's a textbook).

**Test 6 — Chapter 1 Relaxed Threshold:**
Submit Chapter 1 with broader contextual references. Expected: passes with the relaxed 60% threshold for Chapter 1.

**Test 7 — Tier 3 Claim-Citation Mismatch:**
Submit a chapter where a citation accompanies a claim it doesn't actually support (e.g., citing a network planning paper for an antenna gain value). Expected: Tier 3 flags the specific citation as DOES_NOT_SUPPORT.

---

## FUTURE ENHANCEMENTS (NOT IN INITIAL BUILD)

These are worth noting for the roadmap but should NOT be built until the core system is stable:

1. **Reference Freshness Check:** Flag references older than 10 years (except seminal works). Already required for Nursing (NMCN rule) — could be generalised.

2. **Citation Density Check:** Flag chapters where citations are clustered in the first few pages and absent from the rest. Suggests the writer front-loaded references and then drifted into unsupported claims.

3. **Self-Citation Detection:** Flag projects where more than 20% of references are from the same author or research group. May indicate the research prompt is too narrow.

4. **Reference Reuse Across Projects:** If the same set of references appears in multiple EduCraft projects on different topics, flag as template reuse (workers copying reference lists between projects).

5. **Automated Research Prompt Improvement:** When Tier 2 consistently flags the same failure pattern (e.g., "network papers instead of component papers for 5G projects"), automatically suggest prompt modifications to the research pipeline.

---

## METRICS AND SUCCESS CRITERIA

### 30-Day Check (After Deployment)

- [ ] Tier 2 runs automatically on every chapter submission
- [ ] Workers receive structured feedback within 30 seconds of submission
- [ ] Pass rate stabilises (not 100% — if it's 100%, the threshold is too low)
- [ ] At least one SOFT FAIL caught that would have been missed manually
- [ ] Admin dashboard shows aggregate verification stats

### 90-Day Check

- [ ] Tier 3 running on flagged + sampled chapters
- [ ] Worker flag tracking operational
- [ ] Zero supervisor rejections due to irrelevant references
- [ ] Systemic patterns identified and acted on (research prompt improvements)
- [ ] Cost per project within projected range (₦50–80)

### 12-Month Check

- [ ] System has processed 1,000+ chapters
- [ ] False positive rate below 5% (good chapters incorrectly flagged)
- [ ] False negative rate below 2% (bad chapters incorrectly passed)
- [ ] Reference-related supervisor rejections: zero
- [ ] Cost at scale matches projections

---

*Version 1.0 — Session 4 output. Ready for Claude Code implementation in the order specified: Tier 2 first, Tier 3 second, Dashboard third.*
