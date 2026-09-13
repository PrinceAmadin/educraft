# THE EDUCRAFT VOICE

## The Standard for How EduCraft Academic Work Reads

**Version 1.0 — Draft**

---

## WHAT THIS DOCUMENT IS

The EduCraft Voice is the standard of *how* work should read — separate from *what* it should contain (Structural Quality) and *how it should look* (Formatting Quality). Voice is Layer 2a of the EduCraft Quality Standard.

Every report EduCraft delivers is judged on whether it reads like:

- A **technically competent human** thinking through a real problem, OR
- An **AI generating plausible-sounding academic prose**

The difference is felt immediately by any supervisor, external examiner, or reader who has spent years around academic writing. The Voice standard exists to make that difference reproducible — so any worker, following the rules, can produce work that reads like EduCraft.

This document is extracted from:
- The EduCraft Masterclass (Days 2, 3, 4, 6)
- The Engineering Chapter Writing Guides (1–5)
- Prince's direct instructions across active projects

---

## PART 1 — THE FIVE CORE PRINCIPLES

Every rule in this document derives from these five principles. When in doubt, come back to these.

### PRINCIPLE 1 — TECHNICAL DEPTH OVER DECORATIVE LANGUAGE

Academic writing is not about sounding academic. It is about proving you understand the problem.

A simple sentence containing a verified fact is stronger than an elaborate sentence containing vague language.

*From the Chapter Two guide: "A simple sentence containing a verified engineering fact is stronger than an elaborate sentence containing vague academic language."*

### PRINCIPLE 2 — EVIDENCE FOR EVERY IMPORTANT CLAIM

Any claim that carries technical weight — a number, a limitation, a performance value, a historical fact — must be traceable to a real source.

Unverified claims signal an AI-generated report because AI generates plausible-sounding assertions without verifying them.

### PRINCIPLE 3 — SPECIFICITY OVER GENERALITY

Replace broad, sweeping statements with specific information.

- Weak: "technology is advancing rapidly"
- Strong: the actual technology, the actual performance requirement, the actual limitation

Every generic phrase is a place where a specific fact could go.

### PRINCIPLE 4 — LOGICAL FLOW, NOT TRANSITION WORDS

Paragraphs should connect through the *logic of the argument*, not through transition words at the start of each paragraph.

If a paragraph starts with "Firstly," "Moreover," "Furthermore," "Additionally," or "In light of the foregoing," it signals AI-generated writing. Human writers connect ideas by developing them, not by announcing them.

### PRINCIPLE 5 — THE WORK MUST STAY AT THE CENTRE

Every paragraph should relate back to the project. Chapter One is not an essay about the field. Chapter Two is not a glossary of the discipline. Chapter Three is not a survey of methods. Each chapter is a piece of the project's argument.

*From the Chapter One guide: "Keep the project itself at the centre of the discussion."*

---

## PART 2 — BANNED PHRASES AND CONSTRUCTIONS

These are automatic red flags. Their presence in any EduCraft report suggests the writer has not properly reviewed the AI output.

### 2.1 Banned Opening Phrases

Any paragraph or section that begins with these phrases must be rewritten:

- "In today's rapidly evolving technological landscape..."
- "In today's fast-paced world..."
- "It is important to note that..."
- "It should be noted that..."
- "It can clearly be seen that..."
- "It is worth mentioning that..."
- "In light of the foregoing..."
- "Needless to say..."
- "As we all know..."
- "In this modern era..."
- "In recent times..." (when used as a filler opener)
- "With the advent of..."

### 2.2 Banned Promotional Language

Academic writing does not sell. These words signal marketing, not scholarship:

- "Groundbreaking"
- "Revolutionary"
- "Innovative and revolutionary"
- "Cutting-edge" (when used loosely)
- "Game-changing"
- "Pivotal role"
- "Remarkable advancement"
- "Transformative"
- "State-of-the-art" (unless technically precise and cited)

### 2.3 Banned Transition Sequences

These signal AI-generated structure:

- "Firstly... Secondly... Thirdly..."
- "Moreover... Furthermore... Additionally..."
- "In addition... Besides... What is more..."
- Any paragraph starting with "Moreover" or "Furthermore"

A human writer moves between ideas by developing them, not by announcing transitions. If a paragraph *needs* a transition word to connect to the previous one, the logical connection is probably weak.

### 2.4 Banned Vague Qualifiers

Where specific values exist, use them:

| Vague | Specific |
|---|---|
| "high gain" | "7.8 dBi gain" |
| "wide bandwidth" | "3.1 GHz bandwidth" |
| "good efficiency" | "94.8% efficiency" |
| "high performance" | the actual measured parameter |
| "significant improvement" | the actual percentage or measured delta |
| "many researchers" | the actual number, or specific names |
| "increasingly important" | why it is important, with evidence |
| "highly efficient" | the efficiency value with source |

### 2.5 Banned Punctuation

- **No hyphens where commas belong.** Hyphenated dashes used mid-sentence as pauses are forbidden. Use commas.
  - Wrong: "The system — which was tested extensively — performed well."
  - Right: "The system, which was tested extensively, performed well."
- Inline word hyphens are fine (co-operator, self-contained, real-time).
- Em-dashes and en-dashes as sentence separators are forbidden.

### 2.6 Banned Meta-Commentary

Do not write about the report inside the report:

- "This section will discuss..."
- "In this paragraph, we will examine..."
- "The following section is going to..."

Just do it. Announcing what you're about to write is filler.

### 2.7 Banned Excessive Section Cross-Referencing

Do not use section references as a substitute for explanation. Every time a writer says "as discussed in Section 3.3" or "the variable gain amplifier of Section 3.3.8," they are outsourcing their explanation to a location instead of explaining in place.

This was flagged as a major issue by an external supervisor during Prince's own project defence, and it caused significant rework. The rule is important enough to codify permanently.

**The principle:** if a concept needs to be understood at the point the reader is reading, explain it at that point. Do not send the reader hunting for it elsewhere.

**Weak (excessive cross-referencing):**

*"The gain budget is the contract that every module in Section 3.3 must satisfy. The output anchor is the regulated power at the directional coupler, which is the level the automatic gain control loop of Section 3.3.8 holds by adjusting the variable gain amplifiers of Section 3.3.5."*

**Strong (explain in place):**

*"The gain budget is the contract every module in the RF chain must satisfy. The output anchor is the regulated power at the directional coupler, held at +5 dBm by the automatic gain control loop, which adjusts the variable gain amplifiers to close the budget."*

Notice what changed: the section numbers disappeared, but the technical content is now *stronger* because the writer had to briefly re-explain what the module does. The reader stays in the paragraph. The argument stays continuous.

**When section references are acceptable:**
- One clean forward reference at the start of a chapter to orient the reader ("Chapter 4 presents the measured results.")
- One backward reference in a summary or conclusion where re-explanation would be genuinely repetitive
- Referring to a specific table, figure, or equation that the reader must actually see (e.g., "Table 3.3 gives the budget in two parts")

**When section references are unacceptable:**
- Explaining a concept by pointing to where else it was explained
- Justifying a design choice by referencing the section where the justification appears
- Building an argument through "as shown in Section X" instead of showing it here
- Any paragraph containing more than one section cross-reference

**The check:** if you can delete a section reference from a sentence and the sentence still makes technical sense (perhaps with a brief in-place re-explanation), delete it. If deleting it leaves the sentence broken, restructure — the underlying issue is that the content belongs where the reader needs it, not somewhere else.

**Note on figures and tables:** references to figures and tables (e.g., "Figure 3.1 shows the block diagram," "Table 3.3 gives the budget") are different from section references. Figures and tables are visual artifacts the reader must actually look at. Section references are pointers to prose the reader has to hunt for. The first is necessary, the second is avoidable.

### 2.8 Uncited Tables, Figures, and Images

Every table, figure, image, or plate taken from another source must be cited. This is one of the most common failures in student projects and it was flagged by an external supervisor during Prince's own defence, causing full-document rework.

The rule is simple: if you did not create it yourself, someone else did — and they must be credited.

**The rule:**

Every table, figure, image, plate, chart, graph, diagram, or schematic that comes from an external source (a paper, a website, a book, a datasheet, a report) must show its source **beneath the caption**, in parentheses. That source must also appear in the References list.

**Format:**

```
Figure 2.4: Block diagram of a superheterodyne receiver (Pozar, 2012).

Table 2.7: Comparison of reported patch antenna performance across
substrate materials (Balanis, 2016).

Plate 3.2: SEM image of the fabricated microstrip line (Nguyen et al., 2019).
```

**When the source is EduCraft or the author:**

If you created the figure yourself — a schematic you drew, a graph from your own measured data, a photograph you took — cite it as author-generated:

```
Figure 3.1: System block diagram of the proposed design (Author, 2026).

Plate 4.1: Photograph of the fabricated prototype during testing 
(Author, 2026).
```

**When a figure is adapted rather than copied:**

If you modified an external figure — redrew it, translated the labels, changed the axis, added annotations — cite it as adapted:

```
Figure 2.3: Radiation pattern of a rectangular patch antenna, 
adapted from Balanis (2016).
```

**Every cited table, figure, and image must appear in the References list at the end of the report.** Not just the text sources — the visual sources too. This is where most failures happen. Students cite the figure below it, forget to add it to References, and lose points for incomplete referencing.

**The check:**

For any chapter, count:
- Number of tables, figures, plates, or images used
- Number of citations below their captions
- Number of those citations that appear in the References list

If any number does not match, the chapter fails. If the References list is missing even one visual source that appears in-text, the chapter fails.

**Why this fails so often:**

Writers treat images as decoration rather than as content. But from a supervisor's perspective, an uncited image is intellectual property theft. The rule is not about strictness — it is about respecting that the image was made by someone.

### 2.9 Table Continuity Across Pages

A table must fit on a single page unless it is genuinely too long. A table that breaks across pages for no reason is a visible sign that the writer did not check formatting. This has been flagged repeatedly across EduCraft projects.

**The rule:**

Every table in an EduCraft report should be evaluated in this order:

1. **Will the table fit on the current page as-is?** If yes, leave it.
2. **If not, will the table fit on the current page at reduced spacing (1.5 or 1.0 line spacing within the table only, body remains 2.0)?** If yes, apply reduced spacing to the table.
3. **If not, will the table fit if moved to the next page in full?** If yes, move it. Use a page break to force the table onto its own page. Leave the previous page slightly short if necessary — a slightly short page is better than a broken table.
4. **Only if the table is genuinely too long for a single page** (roughly, more than 40 rows or exceeds a full page even at 1.0 line spacing) may it break. In that case, the table header row must repeat on the second page.

**The principle:**

A table is one visual unit. Breaking it across pages splits the reader's attention and forces them to hold the column headers in memory while scrolling. Supervisors read broken tables as a signal that the writer did not review the formatted output.

**The formatting mechanic in Word:**

- Right-click the table → Table Properties → Row tab → uncheck "Allow row to break across pages"
- If the table must break, right-click the header row → Table Properties → Row → check "Repeat as header row at the top of each page"
- Use `Ctrl+Enter` before the table to force it to the next page if needed

**The check:**

For every table in a report, verify that the entire table is on a single page. If a table crosses a page boundary, verify that (a) the header row repeats on the second page, and (b) the table is genuinely long enough to justify breaking (roughly, occupies more than 90% of a page even at 1.0 line spacing).

### 2.10 Equation Presentation

Every equation must (a) appear on its own line, (b) be numbered, and (c) have every symbol defined. Presenting an equation without defining its terms is one of the most common failures in engineering and science reports, and it was flagged during Prince's own defence.

**The rule:**

Every equation in an EduCraft report follows this structure:

1. **The equation is introduced in prose** — a sentence that explains what physical relationship the equation describes.
2. **The equation appears on its own separate line**, not inline with body text.
3. **The equation is numbered** on the right side of the line, in plain decimal format using chapter.equation numbering: 3.1, 3.2, 4.3, etc. **No parentheses around the number** — this was a specific supervisor correction.
4. **Every symbol used in the equation is defined immediately after**, with units where applicable.
5. **The physical meaning of the relationship is briefly explained** — what happens when a variable changes, why the relationship matters.

**Example (correct):**

*"The voltage across a resistor is related to the current through it and the resistance by Ohm's law:*

`                V = IR                                              2.1`

*where V is the voltage across the resistor in volts, I is the current through the resistor in amperes, and R is the resistance in ohms. This linear relationship means that a doubling of the applied voltage produces a doubling of the current, provided the resistance remains constant. Ohm's law forms the basis of the current-limiting analysis in Section 3.4."*

**Example (wrong — reasons for failure):**

*"Ohm's law is given as V = IR."*

Failures in this example:
- Equation is inline with prose, not on its own line
- No equation number
- No symbol definitions
- No units
- No explanation of physical meaning

**Formatting rules:**

- Equations are centered on their own line, with the equation number right-aligned on the same line
- Equation numbering restarts each chapter (Chapter 3 equations are 3.1, 3.2, ...)
- **No parentheses** around the equation number — format is `3.1` not `(3.1)`. This was a specific supervisor correction.
- **Exception — Publication Reports only:** Publications use parenthesised numbering: `(1)`, `(2)`, `(3)`
- All symbols use italic letters (V, I, R — not V, I, R in upright font). Numbers and unit symbols are upright (5 V, 2.3 A, 10 Ω)
- Symbols are defined in the order they appear in the equation
- Units are stated for every physical quantity (voltage in volts, current in amperes, not just "voltage" and "current")
- Where symbols are already defined in an earlier chapter or section, briefly re-anchor them rather than sending the reader to hunt (avoids the section cross-reference problem — see 2.7)

**When to use the two-column equation table:**

For equations that must be presented professionally in Word, use a borderless two-column table:
- Left column contains the equation (wider column)
- Right column contains the equation number (narrower column, right-aligned)
- Table has no borders
- This is a formatting standard that Prince has flagged repeatedly with AI systems that fail to produce it correctly

**The check:**

For every equation in a chapter:
1. Is it on its own separate line? Yes/No
2. Is it numbered in (chapter.equation) format? Yes/No
3. Is every symbol defined with units? Yes/No
4. Is the physical meaning briefly stated? Yes/No
5. Is it in a borderless two-column table (equation left, number right)? Yes/No

Any "No" answer for a numbered equation means revision needed.

---

## PART 3 — SENTENCE-LEVEL RULES

### 3.1 Vary Sentence Length Deliberately

AI tends to write in similar-length sentences. Humans don't. A well-written paragraph has short punchy sentences mixed with longer analytical ones.

**Bad (uniform):** *The system was tested. The results were positive. The efficiency was good. The performance was strong.*

**Good (varied):** *The system was tested against three benchmark conditions. Efficiency measurements consistently exceeded the design target of 90%, with a peak of 94.8% observed at the mid-range operating point. Performance was strong.*

### 3.2 Prefer Concrete Nouns and Specific Verbs

Replace abstract subjects with concrete ones. Replace weak verbs with specific ones.

**Weak verbs to avoid:**
- "utilize" (say "use")
- "is comprised of" (say "consists of" or "includes")
- "plays a role in" (say what it does)
- "is associated with" (say the actual relationship)

**Strong engineering verbs (use these):**
- designed, developed, implemented, fabricated, simulated
- modelled, characterized, evaluated, tested, measured
- compared, optimized, validated, integrated, analysed

### 3.3 Six-Sentence Paragraph Rule

A paragraph in an EduCraft report should typically contain 4–7 sentences. Aim for around 6.

- Paragraphs of 1–2 sentences suggest fragmented thinking
- Paragraphs of 10+ sentences suggest the writer is dumping information without structure

Every paragraph should have:
1. A clear topic (usually in the first sentence)
2. Development of that topic
3. Evidence, example, or specification where relevant
4. A connection to the larger argument (implicit or explicit)

### 3.4 One Idea Per Paragraph

If a paragraph shifts topic mid-way, split it. Each paragraph handles one logical unit of the argument.

---

## PART 4 — CHAPTER-BY-CHAPTER VOICE STANDARDS

Each chapter has its own voice character. Voice is not universal across a report — it modulates based on what the chapter is doing.

### 4.1 Chapter One — Introduction

**Voice character:** Confident framing. The writer is orienting the reader.

Chapter One should sound like an engineer explaining the real-world context of a problem — not an essayist writing about the state of the world.

**Progression rule:** Move from broad engineering field → relevant technology → operating principle → application → existing limitation → the specific problem the project addresses.

**Do:**
- Introduce the technology or system with technical accuracy
- Explain why the application matters, using specifics
- Identify the deficiency in existing approaches with evidence
- State the aim as one clear sentence
- Write objectives using measurable engineering verbs

**Don't:**
- Write about "today's world" or "modern society"
- Fill the background with unsourced statistics
- Turn Chapter One into a mini literature review (save that for Chapter Two)
- Write an aim with multiple unrelated outcomes
- Write objectives that are too vague to be measured

**Objective-writing rule:**
Every objective must be answerable in Chapter Five as either "achieved" or "not achieved." If an objective cannot be verified, it is not an objective — it is a wish.

### 4.2 Chapter Two — Literature Review

**Voice character:** Analytical synthesis. The writer is a critic, not a curator.

The most common Chapter Two failure is *listing* rather than *analysing*. A weak Chapter Two summarises each paper in isolation. A strong Chapter Two shows how the papers speak to each other.

**Every reviewed paper must follow the four-part structure:**

1. **What the authors did** — the problem, the scope, the contribution
2. **How they did it** — method, materials, tools, conditions
3. **What they obtained** — the actual results, with numerical values preserved
4. **Critique and connection to the present project** — what the work adds, what it limits, what the present project takes from it

The critique must appear **immediately after** the paper it belongs to. Do not collect critiques in a separate paragraph at the end of the chapter.

**After reviewing multiple related studies, synthesize:**
- What does the collection of studies show?
- Where do they agree?
- Where do they disagree?
- What parameter or approach recurs?
- What limitation is consistent across them?

**Do:**
- Preserve numerical results exactly as reported ("7.8 dBi gain," not "high gain")
- Compare studies where comparison is meaningful
- Ground every critique in evidence from the paper being criticized
- Introduce technical concepts with purpose — explain what they are, how they work, why they matter

**Don't:**
- Turn Chapter Two into a glossary
- Reduce each paper to one sentence
- Insert equations without introducing the physical relationship they describe
- Fabricate values, results, DOIs, or methodologies
- Cite papers that are not actually related to the topic (this is the failure that caused the only supervisor rejection)

**Research Gap rule:**
The research gap must derive from the specific studies just reviewed. Not from a generic claim that "more research is needed." State the specific technical limitation, the conditions under which it occurs, why it matters, and how the present project responds.

### 4.3 Chapter Three — Methodology

**Voice character:** Precise instruction. The writer is enabling reproducibility.

Chapter Three is the meaty chapter. It must give enough detail that a reader with equivalent training could carry out the work and expect similar results.

**Do:**
- Justify every method choice (why this technique, this software, this material)
- Describe procedures step by step, in the order they were performed
- Include design calculations for core components only
- Preserve numerical parameters (dimensions, tolerances, operating conditions, sample sizes)
- Include diagrams, schematics, or flowcharts where they clarify the method

**Don't:**
- Include design calculations for peripheral components that are not central to the project (this was the failure in the rejected report)
- Describe methods that were not actually used
- Omit justification — "the system was tested" without saying why or how

### 4.4 Chapter Four — Data Analysis / Results

**Voice character:** Objective reporting followed by interpretation.

Chapter Four presents what was found, then explains what it means. These are two distinct activities and should be visually and logically distinct in the writing.

**Do:**
- Present raw results first (tables, graphs, numerical outputs)
- Then interpret — what does this result show?
- Then connect — how does this relate to the objectives from Chapter One?
- Report unexpected findings honestly

**Don't:**
- Present results without interpreting them
- Interpret results without first presenting them
- Skip results that don't fit the expected outcome
- Mix presentation and interpretation in the same sentence (the reader can't tell which is which)

### 4.5 Chapter Five — Summary, Conclusion, Recommendations

**Voice character:** Reflective closure. The writer is stepping back.

Chapter Five is short. It should not introduce new material, new references, or new arguments.

**Do:**
- Summarise the main findings in the order the objectives were stated
- State which objectives were achieved
- Draw the technical implications from the findings
- Recommend actionable next steps
- Suggest specific directions for future work

**Don't:**
- Provide background information on the topic
- Explain the motivation for the project again
- Refer to figures, tables, or references not already covered
- Introduce new literature
- Write vague recommendations like "more research should be done"

---

## PART 5 — REFERENCE AND CITATION VOICE RULES

### 5.1 In-Text Citation Should Support the Sentence

Every citation must actually support the specific claim in the sentence it accompanies. Do not use references as decoration.

- Weak: "Solar energy is important (Smith, 2020)."
- Better: "Global installed solar capacity increased from 40 GW in 2010 to 942 GW in 2021 (IEA, 2022)."

The second version uses the citation to support a specific factual claim. The first uses it as ornament.

### 5.2 Distribute References Across the Chapter

A Chapter Two with 30 references clustered in the first 5 pages and then nothing suggests the writer front-loaded background and then drifted into unsupported claims. Citations should follow the argument.

### 5.3 Italicize *et al.*

The abbreviation "et al." must always be in italics. Every occurrence. This is a hard rule.

### 5.4 APA 7 by Default

Unless the department specifies otherwise (some Law and Nursing programmes use MLA, Chicago, or professional-body formats), all EduCraft references use APA 7th edition.

---

## PART 6 — THE "NIGERIAN UNDERGRADUATE" VOICE (For Term Papers)

Term papers occupy a different tier. They should read as if written by a well-prepared Nigerian undergraduate who genuinely studied the topic — not by a professional consultant.

**Term paper voice rules:**
- Vary sentence length deliberately: mix short punchy with longer analytical
- Use commas, never dashes as pauses
- Show that the writer engaged with the material (specific facts, real examples)
- 6 images maximum, chosen carefully to illustrate key concepts
- Do NOT write in the same voice as a Final Year Project

The distinction matters: a term paper written in FYP voice reads like the student didn't do it themselves. A term paper written in term-paper voice reads like the student studied hard for two weeks.

---

## PART 7 — WHAT SUPERVISORS ARE ACTUALLY LOOKING FOR

Based on the one recorded supervisor rejection and Prince's review experience, supervisors flag work as suspicious when they detect:

### 7.1 Signals That Reveal AI-Generated Work

1. **Generic openings** — "In today's rapidly evolving world..."
2. **Uniform paragraph rhythm** — same length, same structure
3. **Uniform transitions** — every paragraph starts with "Moreover" or "Furthermore"
4. **Vague qualifiers where numbers should be** — "high performance" instead of the actual value
5. **Unsupported broad claims** — "many studies have shown..." without citing any
6. **Meta-commentary** — "This paragraph will discuss..."
7. **References that don't match the topic** — literature review papers unrelated to the project
8. **Peripheral design calculations** — extensive analysis of components not central to the project
9. **Perfect grammar with hollow content** — the sentences are correct but say nothing specific
10. **Excessive section cross-referencing** — the writer keeps pointing to other sections instead of explaining in place. Senior supervisors read this as the writer avoiding the work of explanation. Flagged during an actual external defence.
11. **Uncited tables, figures, and images** — visual content from external sources without proper citation. Flagged during an actual external defence, caused full-document rework.
12. **Tables broken across pages** — a table starts on one page and continues on the next without justification. Read as evidence the writer did not review the formatted output. Flagged across multiple EduCraft projects.
13. **Equations without symbol definitions** — an equation like V = IR appears without defining V, I, and R with their units. Flagged during an actual external defence.
14. **Equations inline with body text** — equations that appear in the middle of a paragraph rather than on their own numbered line.

### 7.2 Signals That Suggest Human Authorship

1. **Specific numerical values** with proper units and sources
2. **Sentence-length variation**
3. **Argument connections** rather than transition words
4. **Honest acknowledgment of limitations**
5. **Depth on core issues, brevity on peripheral ones**
6. **References that actually support the sentences they accompany**
7. **Occasional non-standard sentence structures** (a human writer doesn't produce perfectly uniform prose)

---

## PART 8 — THE VOICE CHECK PROCEDURE

For any Chapter under review (human or AI-assisted), run this check:

**Structural signals (fast checks):**

1. Does any paragraph start with a banned opening phrase? → **REVISION NEEDED**
2. Are there any hyphens used as pauses? → **REVISION NEEDED**
3. Is "et al." italicized throughout? → **REVISION NEEDED** if not
4. Are all paragraphs roughly the same length? → **FLAG for review**
5. Do consecutive paragraphs start with "Moreover / Furthermore / Additionally"? → **REVISION NEEDED**
6. Does any single paragraph contain more than one section cross-reference (e.g., "as shown in Section 3.3," "the module of Section 3.3.8")? → **REVISION NEEDED**
7. Does every table, figure, image, or plate from an external source have a citation directly beneath its caption? → **CRITICAL — REVISION NEEDED** if not
8. Do all cited visual sources appear in the References list? → **CRITICAL — REVISION NEEDED** if not
9. Does any table break across pages without justification (i.e., could fit on one page with reduced spacing or a page break)? → **REVISION NEEDED**
10. For every equation: is it on its own line, numbered, and does it define every symbol with units? → **REVISION NEEDED** if any answer is no

**Content signals (deeper checks):**

11. Are there vague qualifiers ("high," "wide," "good," "significant") where specific values are known? → **REVISION NEEDED**
12. Are there unsupported claims that carry technical weight? → **REVISION NEEDED**
13. Are all cited references directly relevant to the project topic? → **CRITICAL — REVISION NEEDED**
14. Does the chapter stay focused on the project, or drift into general essay territory? → **REVISION NEEDED** if drifting
15. Are results paired with interpretation (Chapter Four)? → **REVISION NEEDED** if not

**Voice signals (subjective — human judgment):**

16. Does it read like a human thinking through the problem?
17. Would a competent supervisor immediately suspect AI generation?
18. If the answer to 16 is no or 17 is yes → **HUMAN REVIEW REQUIRED**

---

## PART 9 — QUICK REFERENCE — VOICE FIXES

When flagged text needs to be rewritten, use these transformation patterns:

### Pattern 1 — Replace Generic Opening

- **Before:** "In today's rapidly evolving world of engineering, antenna design has become increasingly important."
- **After:** "Antenna design for 5G millimetre-wave systems requires operation between 24 GHz and 39 GHz with gain values above 6 dBi, dimensions below one wavelength, and minimal power consumption. Meeting all three simultaneously has driven a decade of design research."

### Pattern 2 — Replace Vague Qualifier

- **Before:** "The system showed high efficiency and wide bandwidth."
- **After:** "The system operated at 94.8% efficiency across a 3.1 GHz bandwidth."

### Pattern 3 — Replace Transition Words with Argument Connection

- **Before:** "Firstly, the system was designed. Secondly, it was tested. Furthermore, the results were positive."
- **After:** "The system was designed in accordance with the specifications set out in Chapter Three, then tested against three benchmark conditions. Results exceeded the design target in each case."

### Pattern 4 — Replace Ornamental Citation with Supporting Citation

- **Before:** "Renewable energy is important (Smith, 2020)."
- **After:** "Global renewable energy capacity grew from 1,564 GW in 2015 to 3,372 GW in 2022 (IRENA, 2023)."

### Pattern 5 — Replace Meta-Commentary with Direct Statement

- **Before:** "This section will now discuss the methodology used in this study."
- **After:** [just start the methodology]

---

## PART 10 — WHAT THIS DOCUMENT DOES NOT COVER

This is Voice — the *how it reads* layer. It does not cover:

- **Structural Quality (Layer 1):** chapter presence, section presence, page count — covered elsewhere
- **Formatting Quality (Layer 3):** margins, fonts, spacing, page numbering, TOC generation — covered elsewhere
- **Delivery Quality (Layer 4):** final human check before send — covered elsewhere
- **Reference existence and topic relevance:** covered by the Reference Verification System (Tiers 1, 2, 3)

Voice is one part of the whole standard. Everything must pass Voice, but Voice alone is not sufficient.

---

## APPENDIX A — SOURCES

This document was compiled from:
- EduCraft Masterclass Day 2 (Foundations of Technical Report Writing)
- EduCraft Masterclass Day 3 (The Engine Room of Report Writing)
- EduCraft Masterclass Day 4 (Page Formatting, Editing & Proofreading)
- EduCraft Masterclass Day 6 (Mastering Academic, Business & Official Writings)
- Engineering Chapter One Writing Guide
- Engineering Chapter Two Writing Guide
- Engineering Chapter Three Master Writing Guide
- Engineering Chapter Four Writing Guide
- Engineering Chapter Five Writing Guide
- Prince's active project instructions and revision notes

---

*Version 1.0 — First extraction from masterclass materials. Awaiting Prince's review, corrections, and additions.*
