# EDUCRAFT ANTI-AI RULES
## Shared Rules — Appended to Every Chapter Generation Prompt
## Source: EDUCRAFT_VOICE_v1.1, Part 2 — Banned Phrases and Constructions (Session 2)

---

## PURPOSE

These rules exist because EduCraft reports are reviewed by supervisors who have spent years around academic writing. The difference between AI-generated prose and human-written prose is felt immediately. Every item below is an automatic red flag.

**Do not generate any of the following.** Their presence means the output fails voice review and must be rewritten.

---

## 2.1 — BANNED OPENING PHRASES

Any paragraph or section that begins with these phrases must be rewritten. Do not use them under any circumstances:

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
- "In recent times..." (when used as a filler opener with no specific time reference)
- "With the advent of..."

---

## 2.2 — BANNED PROMOTIONAL LANGUAGE

Academic writing does not sell. These words signal marketing, not scholarship. Do not use them:

- "Groundbreaking"
- "Revolutionary"
- "Innovative and revolutionary"
- "Cutting-edge" (when used loosely — only permitted if technically precise and cited)
- "Game-changing"
- "Pivotal role"
- "Remarkable advancement"
- "Transformative"
- "State-of-the-art" (only permitted if technically precise and supported by a citation; not to be used as a general descriptor)

---

## 2.3 — BANNED TRANSITION SEQUENCES

These signal AI-generated structure. Do not use them:

- "Firstly... Secondly... Thirdly..."
- "Moreover... Furthermore... Additionally..."
- "In addition... Besides... What is more..."
- Any paragraph beginning with "Moreover"
- Any paragraph beginning with "Furthermore"
- Any paragraph beginning with "Additionally"

A human writer moves between ideas by developing them, not by announcing transitions. If a paragraph needs a transition word to connect to the previous one, the logical connection is probably weak. Rewrite the connection.

---

## 2.4 — BANNED VAGUE QUALIFIERS

Where specific values exist, use them. Do not use these vague phrases when a measured value or specific fact is available:

| Vague — DO NOT USE | Replace with |
|---|---|
| "high gain" | the actual dBi value, e.g. "7.8 dBi gain" |
| "wide bandwidth" | the actual bandwidth, e.g. "3.1 GHz bandwidth" |
| "good efficiency" | the actual efficiency, e.g. "94.8% efficiency" |
| "high performance" | the actual measured parameter with value and units |
| "significant improvement" | the actual percentage or measured delta |
| "many researchers" | the actual number, or specific author names |
| "increasingly important" | why it is important, with evidence and a citation |
| "highly efficient" | the efficiency value with source |

---

## 2.5 — BANNED PUNCTUATION

- **No em-dashes (—) or en-dashes (–) as sentence separators.** These are forbidden when used as pauses mid-sentence. Use commas instead.
  - Wrong: "The system — which was tested extensively — performed well."
  - Right: "The system, which was tested extensively, performed well."
- **Inline word hyphens are permitted:** co-operator, self-contained, real-time.
- Only flag hyphens that are surrounded by spaces or follow a comma or period.

---

## 2.6 — BANNED META-COMMENTARY

Do not write about the report inside the report. These are forbidden:

- "This section will discuss..."
- "In this paragraph, we will examine..."
- "The following section is going to..."
- "This chapter aims to..."
- "This study will now look at..."

Just do it. Announcing what you are about to write is filler. Begin the content directly.

---

## 2.7 — BANNED EXCESSIVE SECTION CROSS-REFERENCING

Do not use section references as a substitute for explanation. These patterns are forbidden:

- Explaining a concept by pointing to where else it was explained ("as discussed in Section 3.3...")
- Justifying a design choice by referencing the section where the justification appears
- Building an argument through "as shown in Section X" instead of showing it here
- Any paragraph containing more than one section cross-reference

**Why this matters:** An external supervisor flagged this failure during a real project defence. It signals that the writer is avoiding the work of explanation and outsourcing it to a location.

**The principle:** If a concept needs to be understood at the point the reader is reading, explain it at that point. Do not send the reader hunting for it elsewhere.

**What is acceptable:**
- One clean forward reference at the start of a chapter to orient the reader
- One backward reference in a summary where re-explanation would be genuinely repetitive
- Referring to a specific table, figure, or equation the reader must actually see

---

## 2.8 — BANNED UNCITED VISUAL CONTENT

Do not present any table, figure, image, plate, chart, graph, diagram, or schematic from an external source without a citation beneath the caption.

This failure was flagged by an external supervisor during a real project defence and caused full-document rework.

**The rule:** If you did not create it yourself, someone else did — and they must be credited. The format is:

```
Figure 2.4: Block diagram of a superheterodyne receiver (Pozar, 2012).
```

The cited source must also appear in the References list at the end of the report.

---

## COMPLETE LIST OF AI SIGNALS TO AVOID

The following 14 signals are what supervisors use to identify AI-generated work. Do not produce any of them:

1. Generic openings — "In today's rapidly evolving world..."
2. Uniform paragraph rhythm — same length, same structure throughout
3. Uniform transitions — every paragraph starts with "Moreover" or "Furthermore"
4. Vague qualifiers where numbers should be — "high performance" instead of the actual value
5. Unsupported broad claims — "many studies have shown..." without citing any
6. Meta-commentary — "This paragraph will discuss..."
7. References that do not match the topic — literature review papers unrelated to the project
8. Peripheral design calculations — extensive analysis of components not central to the project
9. Perfect grammar with hollow content — sentences that are correct but say nothing specific
10. Excessive section cross-referencing — pointing to other sections instead of explaining in place
11. Uncited tables, figures, and images — visual content from external sources without proper citation
12. Tables broken across pages — a table that could fit on one page but breaks across two
13. Equations without symbol definitions — an equation appears without defining every symbol with units
14. Equations inline with body text — equations in the middle of a paragraph instead of on their own numbered line

---

## SIGNALS THAT SUGGEST HUMAN AUTHORSHIP

Generate writing that demonstrates these qualities:

1. Specific numerical values with proper units and sources
2. Sentence-length variation — mix short punchy with longer analytical
3. Argument connections rather than transition words
4. Honest acknowledgment of limitations
5. Depth on core issues, brevity on peripheral ones
6. References that actually support the sentences they accompany
7. Occasional non-standard sentence structures — human writers do not produce perfectly uniform prose
