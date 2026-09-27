/**
 * Phase D7: an equation as the model writes it (plain Unicode, never LaTeX:
 * "GDP = β0 + β1(INF) + ε", "P_panel = (P_load × t × SF) / η_charge",
 * "n = N / (1 + N(e²))") becomes a native Word equation (OMML, rule EQ5).
 *
 * Founder's call (D7): equations are set in Times New Roman like the rest of
 * the report, so every math run is "normal text" (<m:nor/>) in Times New Roman
 * 12pt; letters are italic, numbers, operators and function names upright
 * (voice_rules: "All symbols use italic letters. Numbers and unit symbols are
 * upright."). Fractions, subscripts, superscripts and roots stay real OMML
 * structures, so the equation is still editable in Word's equation editor.
 * Pure: no docx, no database.
 */

export type MathNode =
  | { t: "run"; text: string; italic: boolean }
  | { t: "frac"; num: MathNode[]; den: MathNode[] }
  | { t: "sub"; base: MathNode[]; sub: MathNode[] }
  | { t: "sup"; base: MathNode[]; sup: MathNode[] }
  | { t: "subsup"; base: MathNode[]; sub: MathNode[]; sup: MathNode[] }
  | { t: "rad"; body: MathNode[] };

const SUPERSCRIPTS: Record<string, string> = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁺": "+", "⁻": "−", "⁽": "(", "⁾": ")", ⁿ: "n", ⁱ: "i" };
const SUBSCRIPTS: Record<string, string> = { "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9", "₊": "+", "₋": "−", "₍": "(", "₎": ")", ₐ: "a", ₑ: "e", ₒ: "o", ₓ: "x", ᵢ: "i", ⱼ: "j", ₜ: "t", ₙ: "n" };

const FUNCTIONS = new Set(["sin", "cos", "tan", "cot", "sec", "csc", "sinh", "cosh", "tanh", "ln", "log", "exp", "lim", "max", "min", "det", "arg", "mod"]);
/** Binary operators get a space either side (normal-text math is not spaced by Word). */
const BINARY = new Set(["=", "+", "−", "×", "÷", "·", "≠", "≈", "≤", "≥", "<", ">", "±", "∓", "≡", "∝", "→"]);
const LETTER = /[A-Za-zΑ-Ωα-ωϑϕϵ∂]/;
const GREEK = /[Α-Ωα-ωϑϕϵ]/;

type Tok =
  | { k: "id"; v: string }
  | { k: "num"; v: string }
  | { k: "op"; v: string }
  | { k: "open"; v: string }
  | { k: "close"; v: string }
  | { k: "lbrace" }
  | { k: "rbrace" }
  | { k: "caret" }
  | { k: "under" }
  | { k: "slash" }
  | { k: "sqrt" }
  | { k: "sum"; v: string }
  | { k: "sup"; v: string }
  | { k: "sub"; v: string }
  | { k: "prime"; v: string };

function tokenize(src: string): Tok[] {
  const s = src.replace(/\s+/g, " ").trim();
  const toks: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    // Σ and Π are Greek capitals too, but here they are n-ary operators: check them before letters.
    if (c === "Σ" || c === "∑" || c === "∏" || c === "∫") {
      toks.push({ k: "sum", v: c === "Σ" ? "∑" : c });
      i++;
      continue;
    }
    if (c === " ") {
      // Words written with a space between them ("Unit cost") keep it; other spaces are layout only.
      if (toks[toks.length - 1]?.k === "id" && LETTER.test(s[i + 1] ?? "")) toks.push({ k: "op", v: " " });
      i++;
      continue;
    }
    if (LETTER.test(c)) {
      let j = i;
      // A letter run, with any digits straight after it: "β0", "x12", "CO2", "INF".
      while (j < s.length && (LETTER.test(s[j]) || /\d/.test(s[j]))) j++;
      toks.push({ k: "id", v: s.slice(i, j) });
      i = j;
      continue;
    }
    if (/\d/.test(c) || (c === "." && /\d/.test(s[i + 1] ?? ""))) {
      const num = /^\d*[.,]?\d+/.exec(s.slice(i))![0];
      toks.push({ k: "num", v: num });
      i += num.length;
      continue;
    }
    if (SUPERSCRIPTS[c]) {
      let v = "";
      while (i < s.length && SUPERSCRIPTS[s[i]]) v += SUPERSCRIPTS[s[i++]];
      toks.push({ k: "sup", v });
      continue;
    }
    if (SUBSCRIPTS[c]) {
      let v = "";
      while (i < s.length && SUBSCRIPTS[s[i]]) v += SUBSCRIPTS[s[i++]];
      toks.push({ k: "sub", v });
      continue;
    }
    i++;
    if (c === "(" || c === "[") toks.push({ k: "open", v: c });
    else if (c === ")" || c === "]") toks.push({ k: "close", v: c });
    else if (c === "{") toks.push({ k: "lbrace" });
    else if (c === "}") toks.push({ k: "rbrace" });
    else if (c === "^") toks.push({ k: "caret" });
    else if (c === "_") toks.push({ k: "under" });
    else if (c === "/") toks.push({ k: "slash" });
    else if (c === "√") toks.push({ k: "sqrt" });
    else if (c === "'" || c === "′" || c === "’") toks.push({ k: "prime", v: "′" });
    else if (c === "-" || c === "–" || c === "−") toks.push({ k: "op", v: "−" });
    else if (c === "*" || c === "∗") toks.push({ k: "op", v: "×" });
    else toks.push({ k: "op", v: c });
  }
  return toks;
}

class ParseError extends Error {}

/** Recursive descent over the tokens. Fractions bind tighter than + and −, as in Word's own linear format. */
class Parser {
  private i = 0;
  constructor(private readonly toks: Tok[]) {}

  parseAll(): MathNode[] {
    const nodes = this.sequence(() => false);
    if (this.i < this.toks.length) throw new ParseError("unbalanced");
    return nodes;
  }

  private peek(): Tok | undefined {
    return this.toks[this.i];
  }

  /** A run of terms and operators until `stop()` or the end. */
  private sequence(stop: () => boolean): MathNode[] {
    const items: (MathNode[] | "/")[] = [];
    while (this.i < this.toks.length && !stop()) {
      const tok = this.peek()!;
      if (tok.k === "close" || tok.k === "rbrace") break;
      if (tok.k === "slash") {
        this.i++;
        items.push("/");
        continue;
      }
      if (tok.k === "op") {
        this.i++;
        const prev = items[items.length - 1];
        const unary = (tok.v === "−" || tok.v === "+") && (!prev || prev === "/" || isOperator(prev));
        items.push([op(tok.v, unary)]);
        continue;
      }
      items.push(this.term());
    }
    // Fractions: term / term, left to right.
    const out: MathNode[][] = [];
    for (let k = 0; k < items.length; k++) {
      const it = items[k];
      if (it === "/") {
        const num = out.pop();
        const next = items[k + 1];
        if (!num || !next || next === "/" || isOperator(next)) throw new ParseError("dangling slash");
        out.push([{ t: "frac", num: unwrap(num), den: unwrap(next) }]);
        k++;
        continue;
      }
      out.push(it);
    }
    return out.flat();
  }

  /** One primary with any scripts after it. */
  private term(): MathNode[] {
    let base = this.primary();
    for (;;) {
      const tok = this.peek();
      if (!tok) break;
      if (tok.k === "under" || tok.k === "sub") {
        const sub = tok.k === "sub" ? (this.i++, [runOf(tok.v)]) : (this.i++, this.script());
        base = attachSub(base, sub);
        continue;
      }
      if (tok.k === "caret" || tok.k === "sup") {
        const sup = tok.k === "sup" ? (this.i++, textRuns(tok.v)) : (this.i++, this.script());
        base = attachSup(base, sup);
        continue;
      }
      if (tok.k === "prime") {
        this.i++;
        base = attachSup(base, [{ t: "run", text: "′", italic: false }]);
        continue;
      }
      break;
    }
    return base;
  }

  /** What follows "_" or "^": a {group}, a (group) or a single token. */
  private script(): MathNode[] {
    const tok = this.peek();
    if (!tok) throw new ParseError("empty script");
    if (tok.k === "lbrace") {
      this.i++;
      const inner = this.sequence(() => false);
      if (this.peek()?.k !== "rbrace") throw new ParseError("unclosed brace");
      this.i++;
      return inner;
    }
    if (tok.k === "open") return unwrap(this.primary());
    if (tok.k === "op" && tok.v === "−") {
      this.i++;
      return [op("−", true), ...this.script()];
    }
    if (tok.k === "id") {
      // x_panel: the whole word is the subscript; x_i2 stays one script.
      this.i++;
      return [{ t: "run", text: tok.v, italic: !/^\d+$/.test(tok.v) }];
    }
    return this.primary();
  }

  private primary(): MathNode[] {
    const tok = this.peek();
    if (!tok) throw new ParseError("unexpected end");
    this.i++;
    switch (tok.k) {
      case "num":
        return [{ t: "run", text: tok.v, italic: false }];
      case "id":
        return identifier(tok.v);
      case "open": {
        const inner = this.sequence(() => false);
        const close = this.peek();
        if (close?.k !== "close") throw new ParseError("unclosed bracket");
        this.i++;
        return [runOf(tok.v), ...inner, runOf(close.v)];
      }
      case "lbrace": {
        const inner = this.sequence(() => false);
        if (this.peek()?.k !== "rbrace") throw new ParseError("unclosed brace");
        this.i++;
        return inner;
      }
      case "sqrt": {
        const next = this.peek();
        if (!next) throw new ParseError("empty root");
        const body = next.k === "open" ? unwrap(this.primary()) : this.term();
        return [{ t: "rad", body }];
      }
      case "sum": {
        let base: MathNode[] = [{ t: "run", text: tok.v, italic: false }];
        for (;;) {
          const n = this.peek();
          if (n?.k === "under") {
            this.i++;
            base = attachSub(base, this.script());
          } else if (n?.k === "caret") {
            this.i++;
            base = attachSup(base, this.script());
          } else break;
        }
        // The operator takes the term after it: Σ(x − μ)² / N is (Σ(x − μ)²) / N.
        const next = this.peek();
        if (next && next.k !== "op" && next.k !== "slash" && next.k !== "close" && next.k !== "rbrace") return [...base, ...this.term()];
        return base;
      }
      default:
        throw new ParseError(`unexpected ${tok.k}`);
    }
  }
}

function op(v: string, unary: boolean): MathNode {
  return { t: "run", text: BINARY.has(v) && !unary ? ` ${v} ` : v === "," ? ", " : v, italic: false };
}

function isOperator(nodes: MathNode[]): boolean {
  return nodes.length === 1 && nodes[0].t === "run" && !nodes[0].italic && /^\s*[=+−×÷·≠≈≤≥<>±∓≡∝→,;:|]\s*$/.test(nodes[0].text);
}

function runOf(text: string): MathNode {
  return { t: "run", text, italic: false };
}

/** Letters italic, everything else upright. */
function textRuns(text: string): MathNode[] {
  const out: MathNode[] = [];
  for (const part of text.match(/[A-Za-zΑ-Ωα-ω]+|[^A-Za-zΑ-Ωα-ω]+/g) ?? []) out.push({ t: "run", text: part, italic: /[A-Za-zΑ-Ωα-ω]/.test(part) });
  return out;
}

/** "β0" and "x1" are β₀ and x₁ (the econometrics and engineering habit); "CO2" and "INF" stay as written. */
function identifier(v: string): MathNode[] {
  if (FUNCTIONS.has(v)) return [{ t: "run", text: v, italic: false }];
  const m = /^([A-Za-zΑ-Ωα-ω])(\d+)$/.exec(v);
  if (m) return [{ t: "sub", base: [{ t: "run", text: m[1], italic: true }], sub: [{ t: "run", text: m[2], italic: false }] }];
  const g = /^(.*?[A-Za-z])(\d+)$/.exec(v);
  if (g && GREEK.test(g[1].slice(-1))) return [...textRuns(g[1].slice(0, -1)), { t: "sub", base: [{ t: "run", text: g[1].slice(-1), italic: true }], sub: [runOf(g[2])] }];
  return textRuns(v);
}

/** Drops one pair of outer brackets: the numerator of (a + b) / c is a + b. */
function unwrap(nodes: MathNode[]): MathNode[] {
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (nodes.length >= 3 && first.t === "run" && last.t === "run" && first.text === "(" && last.text === ")") {
    // Only when those brackets enclose everything (not "(a)(b)").
    let depth = 0;
    for (let k = 0; k < nodes.length; k++) {
      const n = nodes[k];
      if (n.t === "run" && n.text === "(") depth++;
      if (n.t === "run" && n.text === ")") depth--;
      if (depth === 0 && k < nodes.length - 1) return nodes;
    }
    return nodes.slice(1, -1);
  }
  return nodes;
}

/** Scripts attach to the last element of the base (the "t" of "SF t^2"), except to a whole bracket group. */
function attachSub(base: MathNode[], sub: MathNode[]): MathNode[] {
  const { head, last } = splitLast(base);
  if (last.length === 1 && last[0].t === "sup") return [...head, { t: "subsup", base: last[0].base, sub, sup: last[0].sup }];
  return [...head, { t: "sub", base: last, sub }];
}

function attachSup(base: MathNode[], sup: MathNode[]): MathNode[] {
  const { head, last } = splitLast(base);
  if (last.length === 1 && last[0].t === "sub") return [...head, { t: "subsup", base: last[0].base, sub: last[0].sub, sup }];
  return [...head, { t: "sup", base: last, sup }];
}

function splitLast(base: MathNode[]): { head: MathNode[]; last: MathNode[] } {
  const lastNode = base[base.length - 1];
  if (lastNode?.t === "run" && lastNode.text === ")") {
    let depth = 0;
    for (let k = base.length - 1; k >= 0; k--) {
      const n = base[k];
      if (n.t === "run" && n.text === ")") depth++;
      if (n.t === "run" && n.text === "(") depth--;
      if (depth === 0) return { head: base.slice(0, k), last: base.slice(k) };
    }
  }
  return { head: base.slice(0, -1), last: base.slice(-1) };
}

/** Parses an equation; on anything it cannot read, the same text as plain runs (still a native equation). */
export function parseEquation(text: string): { nodes: MathNode[]; structured: boolean } {
  const cleaned = text.replace(/^\s*\$+|\$+\s*$/g, "").trim();
  try {
    const nodes = new Parser(tokenize(cleaned)).parseAll();
    if (!nodes.length) throw new ParseError("empty");
    return { nodes, structured: true };
  } catch {
    return { nodes: textRuns(cleaned.replace(/\s*([=+×÷≤≥≈])\s*/g, " $1 ")), structured: false };
  }
}

// ─── OMML ────────────────────────────────────────────────────────────────────

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The run properties every math run carries: Times New Roman 12pt, black, italic for letters. */
function runXml(text: string, italic: boolean): string {
  const rPr =
    '<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/>' +
    (italic ? "<w:i/><w:iCs/>" : "") +
    '<w:color w:val="000000"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>';
  return `<m:r><m:rPr><m:nor/></m:rPr>${rPr}<m:t xml:space="preserve">${esc(text)}</m:t></m:r>`;
}

function nodesXml(nodes: MathNode[]): string {
  return nodes.map(nodeXml).join("");
}

function nodeXml(n: MathNode): string {
  switch (n.t) {
    case "run":
      return runXml(n.text, n.italic);
    case "frac":
      return `<m:f><m:num>${nodesXml(n.num)}</m:num><m:den>${nodesXml(n.den)}</m:den></m:f>`;
    case "sub":
      return `<m:sSub><m:e>${nodesXml(n.base)}</m:e><m:sub>${nodesXml(n.sub)}</m:sub></m:sSub>`;
    case "sup":
      return `<m:sSup><m:e>${nodesXml(n.base)}</m:e><m:sup>${nodesXml(n.sup)}</m:sup></m:sSup>`;
    case "subsup":
      return `<m:sSubSup><m:e>${nodesXml(n.base)}</m:e><m:sub>${nodesXml(n.sub)}</m:sub><m:sup>${nodesXml(n.sup)}</m:sup></m:sSubSup>`;
    case "rad":
      return `<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>${nodesXml(n.body)}</m:e></m:rad>`;
  }
}

/** The equation as one <m:oMath> element (namespaces declared on it, so it stands alone). */
export function toOmml(nodes: MathNode[]): string {
  return (
    '<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    nodesXml(nodes) +
    "</m:oMath>"
  );
}

/** The equation as readable text (for the check script and the assembly report). */
export function linearText(nodes: MathNode[]): string {
  return nodes
    .map((n) => {
      switch (n.t) {
        case "run":
          return n.text;
        case "frac":
          return `(${linearText(n.num)})/(${linearText(n.den)})`;
        case "sub":
          return `${linearText(n.base)}_{${linearText(n.sub)}}`;
        case "sup":
          return `${linearText(n.base)}^{${linearText(n.sup)}}`;
        case "subsup":
          return `${linearText(n.base)}_{${linearText(n.sub)}}^{${linearText(n.sup)}}`;
        case "rad":
          return `√(${linearText(n.body)})`;
      }
    })
    .join("");
}
