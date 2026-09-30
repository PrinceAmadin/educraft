/**
 * Chapter review: a Word equation (OMML) back to the plain text the report
 * builder writes equations from ("n = N / (1 + N(e²))"), the inverse of
 * equation-omml.ts. The text is written so that parseEquation reads it back to
 * the same structure: fractions as "(num)/(den)", scripts as "_{x}" / "^{x}",
 * roots as "√(x)", sums and integrals with their limits, brackets as typed.
 *
 * What the builder cannot draw (matrices, equation arrays, n-th roots,
 * pre-scripts, over-bars, binomials) is flattened to readable text and named in
 * `lossy`, so the COO sees what changed. Pure: works on any DOM (xmldom).
 */

export const M_NS = "http://schemas.openxmlformats.org/officeDocument/2006/math";
const W_NS = new Set(["http://schemas.openxmlformats.org/wordprocessingml/2006/main", "http://purl.oclc.org/ooxml/wordprocessingml/main"]);
const M_NSS = new Set([M_NS, "http://purl.oclc.org/ooxml/officeDocument/math"]);

const ELEMENT = 1;

function elements(node: Node): Element[] {
  const out: Element[] = [];
  for (let i = 0; i < node.childNodes.length; i++) {
    const c = node.childNodes.item(i);
    if (c && c.nodeType === ELEMENT) out.push(c as Element);
  }
  return out;
}

const isM = (el: Element, local?: string) => M_NSS.has(el.namespaceURI ?? "") && (!local || el.localName === local);
const isW = (el: Element, local?: string) => W_NS.has(el.namespaceURI ?? "") && (!local || el.localName === local);
const child = (el: Element, local: string) => elements(el).find((c) => isM(c, local)) ?? null;

/** An m:*Pr property value (<m:chr m:val="∑"/>); undefined when the property is absent, "" when present with no value. */
function prop(el: Element | null, name: string): string | undefined {
  if (!el) return undefined;
  const p = elements(el).find((c) => isM(c, name));
  if (!p) return undefined;
  for (let i = 0; i < p.attributes.length; i++) {
    const a = p.attributes.item(i);
    if (a && a.localName === "val") return a.value;
  }
  return "";
}

const on = (v: string | undefined) => v !== undefined && v !== "0" && v !== "false" && v !== "off";

export interface LinearMath {
  text: string;
  /** What could not be carried exactly, in plain words. */
  lossy: string[];
}

/** One m:oMath or m:oMathPara element as the builder's equation text. */
export function ommlToLinear(el: Element): LinearMath {
  const lossy = new Set<string>();
  const text = seq(isM(el, "oMathPara") ? elements(el).filter((c) => isM(c, "oMath")).flatMap((m) => [m]) : [el], lossy, "  ");
  return { text: tidy(text), lossy: [...lossy] };
}

function tidy(s: string): string {
  return s.replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").trim();
}

function seq(nodes: Element[], lossy: Set<string>, joiner = ""): string {
  return nodes.map((n) => node(n, lossy)).join(joiner);
}

/** The contents of an m:e / m:num / m:sub ... argument. */
function arg(el: Element | null, lossy: Set<string>): string {
  return el ? elements(el).map((c) => node(c, lossy)).join("") : "";
}

/** A script's text as the parser reads it: always in braces, so "_{i=1}" and "_{t−1}" stay whole. */
function script(s: string): string {
  return `{${s.trim()}}`;
}

/** A single token to the equation parser: one identifier ("INF", "β0") or one number. */
const ONE_TOKEN = /^(?:[A-Za-zΑ-Ωα-ω][A-Za-zΑ-Ωα-ω0-9]*|\d+(?:\.\d+)?)$/;

/** One symbol or number (the builder writes a sum as a subscripted "∑", so the n-ary signs count as symbols). */
const SIMPLE = /^[A-Za-zΑ-Ωα-ωϑϕϵ∂0-9.,∑∏∫′]+$/;

function node(el: Element, lossy: Set<string>): string {
  if (isW(el)) {
    // Word text inside maths (rare): take its characters.
    return (el.textContent ?? "").replace(/\s+/g, " ");
  }
  if (!isM(el)) return "";
  switch (el.localName) {
    case "oMath":
    case "box":
    case "borderBox":
    case "e":
      return elements(el).map((c) => node(c, lossy)).join("");
    case "r": {
      // Text, and a tab typed in the equation (Word keeps "equation<tab>3.1" inside the maths) as a space.
      return elements(el)
        .map((c) => (isM(c, "t") || isW(c, "t") ? (c.textContent ?? "") : isW(c, "tab") || isW(c, "ptab") ? " " : ""))
        .join("");
    }
    case "f": {
      const type = prop(child(el, "fPr"), "type");
      if (type === "noBar") lossy.add("a binomial (a fraction without a bar) was written as a fraction");
      const num = arg(child(el, "num"), lossy).trim();
      const den = arg(child(el, "den"), lossy).trim();
      // One symbol or number needs no brackets ("N/(1 + N(e^{2}))"); anything longer keeps them, so the
      // fraction takes all of it ("2x" is two terms to the parser, so it keeps them too).
      const bare = (s: string) => (ONE_TOKEN.test(s) ? s : `(${s})`);
      return `${bare(num)}/${bare(den)}`;
    }
    case "sSub": {
      const base = arg(child(el, "e"), lossy);
      return `${wrapBase(base)}_${script(arg(child(el, "sub"), lossy))}`;
    }
    case "sSup": {
      const base = arg(child(el, "e"), lossy);
      const sup = arg(child(el, "sup"), lossy).trim();
      if (/^[′']+$/.test(sup)) return `${wrapBase(base)}${"′".repeat(sup.length)}`;
      return `${wrapBase(base)}^${script(sup)}`;
    }
    case "sSubSup": {
      const base = arg(child(el, "e"), lossy);
      return `${wrapBase(base)}_${script(arg(child(el, "sub"), lossy))}^${script(arg(child(el, "sup"), lossy))}`;
    }
    case "sPre": {
      lossy.add("a script written before its symbol was moved after it");
      const base = arg(child(el, "e"), lossy);
      return `${wrapBase(base)}_${script(arg(child(el, "sub"), lossy))}^${script(arg(child(el, "sup"), lossy))}`;
    }
    case "rad": {
      const degHide = on(prop(child(el, "radPr"), "degHide"));
      const deg = arg(child(el, "deg"), lossy).trim();
      if (!degHide && deg) lossy.add(`a root of degree ${deg} was written as a square root`);
      return `√(${arg(child(el, "e"), lossy).trim()})`;
    }
    case "d": {
      const pr = child(el, "dPr");
      const beg = prop(pr, "begChr") ?? "(";
      const end = prop(pr, "endChr") ?? ")";
      const sep = prop(pr, "sepChr") ?? "|";
      const parts = elements(el).filter((c) => isM(c, "e")).map((c) => arg(c, lossy));
      if (beg === "{" || end === "}") lossy.add("curly brackets were written as round brackets");
      const open = beg === "{" ? "(" : beg;
      const close = end === "}" ? ")" : end;
      return `${open}${parts.join(sep === "," ? ", " : ` ${sep} `)}${close}`;
    }
    case "nary": {
      const pr = child(el, "naryPr");
      const chr = prop(pr, "chr") || "∫";
      const sub = on(prop(pr, "subHide")) ? "" : arg(child(el, "sub"), lossy).trim();
      const sup = on(prop(pr, "supHide")) ? "" : arg(child(el, "sup"), lossy).trim();
      const body = arg(child(el, "e"), lossy).trim();
      const op = chr === "∑" || chr === "Σ" ? "∑" : chr;
      const limits = `${sub ? `_{${sub}}` : ""}${sup ? `^{${sup}}` : ""}`;
      // The sign takes the term after it: one term (x_{i}, 2x) needs no brackets, a longer operand does.
      return `${op}${limits}${/^[^\s+\-−=×÷±]+$/.test(body) || /^\(.*\)$/.test(body) ? body : `(${body})`} `;
    }
    case "func": {
      const name = arg(child(el, "fName"), lossy).trim();
      const body = arg(child(el, "e"), lossy).trim();
      return /^\(.*\)$/.test(body) ? `${name}${body}` : `${name}(${body})`;
    }
    case "acc": {
      const chr = prop(child(el, "accPr"), "chr") ?? "̂";
      return `${arg(child(el, "e"), lossy)}${chr}`;
    }
    case "bar": {
      lossy.add("a bar over a symbol was left out");
      return arg(child(el, "e"), lossy);
    }
    case "groupChr": {
      lossy.add("a brace or arrow under or over a group was left out");
      return arg(child(el, "e"), lossy);
    }
    case "limLow": {
      return `${arg(child(el, "e"), lossy)}_{${arg(child(el, "lim"), lossy).trim()}}`;
    }
    case "limUpp": {
      return `${arg(child(el, "e"), lossy)}^{${arg(child(el, "lim"), lossy).trim()}}`;
    }
    case "eqArr": {
      lossy.add("an equation array (several lines in one equation) was joined into one line");
      return elements(el)
        .filter((c) => isM(c, "e"))
        .map((c) => arg(c, lossy).trim())
        .join("; ");
    }
    case "m": {
      lossy.add("a matrix was written as its rows, one after another");
      return `[${elements(el)
        .filter((c) => isM(c, "mr"))
        .map((row) =>
          elements(row)
            .filter((c) => isM(c, "e"))
            .map((c) => arg(c, lossy).trim())
            .join(", "),
        )
        .join("; ")}]`;
    }
    case "phant":
      return arg(child(el, "e"), lossy);
    default:
      // Properties (m:*Pr, m:ctrlPr) and anything unknown carry no text of their own.
      if (/Pr$/.test(el.localName ?? "")) return "";
      return elements(el).map((c) => node(c, lossy)).join("");
  }
}

/** A base that is more than one symbol is kept together in brackets so the script attaches to all of it. */
function wrapBase(base: string): string {
  const t = base.trim();
  if (!t) return "{}";
  if (SIMPLE.test(t) || /^\(.*\)$/.test(t) || /^[A-Za-zΑ-Ωα-ω]+_\{[^}]*\}$/.test(t)) return t;
  return `(${t})`;
}
