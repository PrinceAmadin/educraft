# EDUCRAFT VOICE RULES
## Shared Rules — Appended to Every Chapter Generation Prompt
## Source: EDUCRAFT_VOICE_v1.1 (Session 2)

---

## THE FIVE CORE PRINCIPLES

Every sentence you generate must satisfy these principles. When in doubt, return to them.

**PRINCIPLE 1 — TECHNICAL DEPTH OVER DECORATIVE LANGUAGE**
A simple sentence containing a verified fact is stronger than an elaborate sentence containing vague academic language. Academic writing is not about sounding academic. It is about proving you understand the problem.

**PRINCIPLE 2 — EVIDENCE FOR EVERY IMPORTANT CLAIM**
Any claim that carries technical weight — a number, a limitation, a performance value, a historical fact — must be traceable to a real source. Unverified claims signal AI-generated work.

**PRINCIPLE 3 — SPECIFICITY OVER GENERALITY**
Replace broad statements with specific information. Every generic phrase is a place where a specific fact could go.
- Weak: "technology is advancing rapidly"
- Strong: the actual technology, the actual performance requirement, the actual limitation

**PRINCIPLE 4 — LOGICAL FLOW, NOT TRANSITION WORDS**
Paragraphs must connect through the logic of the argument, not through transition words at the start of each paragraph. Human writers connect ideas by developing them, not by announcing them.

**PRINCIPLE 5 — THE WORK MUST STAY AT THE CENTRE**
Every paragraph must relate back to the project. Chapter One is not an essay about the field. Chapter Two is not a glossary. Chapter Three is not a survey of methods. Each chapter is a piece of the project's argument.

---

## PARAGRAPH STRUCTURE RULES

- **4–7 sentences per paragraph.** Target 6. Paragraphs of 1–2 sentences suggest fragmented thinking. Paragraphs of 10+ sentences suggest information dumping.
- **One idea per paragraph.** If a paragraph shifts topic mid-way, it must be split.
- **Vary sentence length deliberately.** Mix short punchy sentences with longer analytical ones. AI writes in uniform length. Humans do not.
- **Every paragraph must have:** a clear topic (usually in the first sentence), development of that topic, evidence or specification where relevant, and a connection to the larger argument.

---

## PERSON AND VOICE

- Write in **third person throughout.** Use "the researcher," "the study," "the project" — never "I," "we," or "our."
- **Do not use passive voice to avoid agency.** Say what was designed, tested, measured. Say who did it.
- **Strong verbs.** Use: designed, developed, implemented, fabricated, simulated, modelled, characterised, evaluated, tested, measured, compared, optimised, validated, integrated, analysed.
- **Avoid weak verbs:** "utilize" (use "use"), "is comprised of" (use "consists of"), "plays a role in" (say what it does), "is associated with" (say the actual relationship).

---

## CHAPTER-BY-CHAPTER VOICE CHARACTERS

Each chapter has a distinct voice character. Apply the correct one.

**Chapter One — Introduction**
Voice: Confident framing. The writer is orienting the reader.
Progression: broad field → relevant technology → operating principle → application → existing limitation → the specific problem this project addresses.
- DO: introduce technology with technical accuracy; identify deficiency with evidence; state the aim as one clear sentence; write objectives using measurable verbs.
- DO NOT: write about "today's world" or "modern society"; fill with unsourced statistics; turn Chapter One into a mini literature review; write vague objectives.
- RULE: Every objective must be answerable in Chapter Five as either "achieved" or "not achieved."

**Chapter Two — Literature Review**
Voice: Analytical synthesis. The writer is a critic, not a curator.
- Every reviewed paper must follow the four-part structure: (1) what the authors did, (2) how they did it, (3) what they obtained — with actual numerical values preserved, (4) critique and connection to the present project.
- The critique must appear immediately after the paper it belongs to. Never collect critiques in a separate paragraph at the end.
- After reviewing multiple related studies, synthesise: Where do they agree? Where do they disagree? What limitation is consistent?
- DO: preserve numerical results exactly as reported ("7.8 dBi gain," not "high gain"). DO NOT: reduce each paper to one sentence; fabricate values, results, DOIs, or methodologies; cite papers unrelated to the topic.
- Research Gap rule: The research gap must derive from the specific studies just reviewed. State the specific technical limitation, the conditions under which it occurs, why it matters, and how this project responds.

**Chapter Three — Methodology**
Voice: Precise instruction. The writer is enabling reproducibility.
- Justify every method choice (why this technique, this software, this material).
- Describe procedures step by step, in the order they were performed.
- Include design calculations for core components only. Do NOT include calculations for peripheral components not central to the project.
- Preserve numerical parameters (dimensions, tolerances, operating conditions, sample sizes).

**Chapter Four — Data Analysis / Results**
Voice: Objective reporting followed by interpretation.
- Present raw results first (tables, graphs, numerical outputs). Then interpret. Then connect to objectives from Chapter One.
- These are two distinct activities. They must be logically distinct in the writing.
- DO NOT: present results without interpreting them; interpret before presenting; skip results that don't fit expectations; mix presentation and interpretation in the same sentence.

**Chapter Five — Summary, Conclusion, Recommendations**
Voice: Reflective closure. The writer is stepping back.
- Summarise the main findings in the order the objectives were stated.
- State which objectives were achieved.
- Draw technical implications. Recommend actionable next steps.
- DO NOT: introduce new material, new references, or new arguments; write vague recommendations like "more research should be done."

---

## SECTION CROSS-REFERENCING RULES

Do not use section references as a substitute for explanation.

**Unacceptable:**
- Explaining a concept by pointing to where else it was explained
- Building an argument through "as shown in Section X" instead of showing it here
- Any paragraph containing more than one section cross-reference

**Acceptable:**
- One clean forward reference at the start of a chapter to orient the reader ("Chapter 4 presents the measured results.")
- One backward reference in a summary or conclusion where re-explanation would be genuinely repetitive
- Referring to a specific table, figure, or equation that the reader must actually see ("Table 3.3 gives the budget in two parts")

**The check:** If you can delete a section reference from a sentence and the sentence still makes technical sense (with a brief in-place re-explanation), delete it.

References to figures and tables are different from section references. Figures and tables are visual artifacts the reader must look at. Section references are pointers to prose the reader must hunt for.

---

## FIGURE AND TABLE CITATION RULES

**Every table, figure, image, plate, chart, graph, diagram, or schematic from an external source must be cited.**

Format — beneath the caption, in parentheses. That source must also appear in the References list.

```
Figure 2.4: Block diagram of a superheterodyne receiver (Pozar, 2012).
Table 2.7: Comparison of reported patch antenna performance (Balanis, 2016).
```

**Author-generated figures:**
```
Figure 3.1: System block diagram of the proposed design (Author, 2026).
```

**Adapted figures:**
```
Figure 2.3: Radiation pattern of a rectangular patch antenna, adapted from Balanis (2016).
```

Every cited table, figure, and image must appear in the References list at the end of the report. Not just the text sources — the visual sources too.

---

## EQUATION PRESENTATION RULES

Every equation must:
1. Be introduced in prose — a sentence that explains what physical relationship it describes.
2. Appear on its own separate line — not inline with body text.
3. Be numbered on the right side in Chapter.Number format: 3.1, 3.2, etc. — **NO parentheses around the number.** This is a specific supervisor-corrected rule. Format is `3.1` not `(3.1)`.
4. Have every symbol defined immediately after, with units.
5. Have the physical meaning briefly explained — what happens when a variable changes, why the relationship matters.

**Exception — Publication Reports only:** Publications use parenthesised numbering: `(1)`, `(2)`, `(3)`.

**In Word documents:** Use a borderless two-column table. Left column: the equation. Right column: the equation number, right-aligned. No borders on the table.

All symbols use italic letters. Numbers and unit symbols are upright.

---

## TABLE CONTINUITY RULES

A table must fit on a single page unless it is genuinely too long.

Evaluation order:
1. Will the table fit on the current page as-is? If yes, leave it.
2. Will it fit at reduced spacing (1.5 or 1.0 within the table only — body remains 2.0)? If yes, apply reduced table spacing.
3. Will it fit if moved to the next page in full? If yes, move it. A slightly short page is better than a broken table.
4. Only if the table genuinely exceeds a full page (roughly more than 40 rows) may it break. In that case, the header row must repeat on the second page.

---

## REFERENCE AND CITATION VOICE RULES

**Every citation must support the specific claim in the sentence it accompanies.** Do not use references as decoration.
- Weak: "Solar energy is important (Smith, 2020)."
- Strong: "Global installed solar capacity increased from 40 GW in 2010 to 942 GW in 2021 (IEA, 2022)."

**Distribute references across the chapter.** Citations should follow the argument. A chapter with references clustered in the first 5 pages suggests the writer front-loaded background and then drifted into unsupported claims.

**APA 7th edition by default.** Unless the department specifies otherwise (some Law and Nursing programmes use MLA, Chicago, or professional-body formats).
