import type { ScenePalette } from "./art-direction";

/**
 * Procedural page typesetting.
 *
 * The sheets in the hero are not photographs of paper and they are not grey
 * placeholder rectangles. Each one is typeset here on a 2D canvas — real
 * justified body copy, real running heads, real folios, a real figure with a
 * real axis — and uploaded as a texture.
 *
 * Two reasons, both practical. A texture that contains actual typography reads
 * correctly at every distance: the eye resolves "document" at 6 units and can
 * resolve the chapter heading at 2. And generating it means the page inherits
 * the theme's ink and paper colours, so the composition is correct in light
 * mode without shipping a second set of images.
 */

export type PageKind =
  | "title"
  | "abstract"
  | "chapter"
  | "body"
  | "figure"
  | "table"
  | "references";

const SERIF =
  '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Times New Roman", serif';
const SANS = 'Inter, "Helvetica Neue", Arial, system-ui, sans-serif';
const MONO = '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace';

/** ISO 216. The sheet is 1 : √2, and so is its texture. */
export const SHEET_RATIO = 1.4142;

/* ── colour ─────────────────────────────────────────────────────────────── */

function rgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/* ── deterministic noise ────────────────────────────────────────────────────
   Seeded so a page looks identical on every reload. Texture detail that
   changes between refreshes is one of the tells that something was generated
   rather than designed.                                                     */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── typography primitives ──────────────────────────────────────────────── */

/**
 * Letter-spaced text, drawn glyph by glyph.
 *
 * `ctx.letterSpacing` exists but is not universal, and tracking is load-bearing
 * here — every small-caps label in the composition depends on it.
 */
function tracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  tracking: number,
  align: "left" | "right" = "left",
): number {
  const chars = [...text];
  const width =
    chars.reduce((w, c) => w + ctx.measureText(c).width + tracking, 0) - tracking;
  let cursor = align === "right" ? x - width : x;
  for (const c of chars) {
    ctx.fillText(c, cursor, y);
    cursor += ctx.measureText(c).width + tracking;
  }
  return width;
}

/** Width a tracked run will occupy, for centring it. */
function trackedWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  tracking: number,
): number {
  const chars = [...text];
  return chars.reduce((w, c) => w + ctx.measureText(c).width + tracking, 0) - tracking;
}

/**
 * Justified paragraph setting. Word-wraps, then distributes the remainder
 * between the word spaces of every line except the last — which is what makes
 * the block read as a typeset page rather than as a ragged text field.
 */
function paragraph(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  leading: number,
  opts: { indent?: number; justify?: boolean; maxLines?: number } = {},
): number {
  const { indent = 0, justify = true, maxLines = Infinity } = opts;
  const words = text.split(" ");
  const spaceWidth = ctx.measureText(" ").width;

  let line: string[] = [];
  let lineWidth = 0;
  let cursorY = y;
  let lines = 0;
  let offset = indent;

  const flush = (isLast: boolean) => {
    if (!line.length) return;
    const slack = width - offset - lineWidth;
    const extra = justify && !isLast && line.length > 1 ? slack / (line.length - 1) : 0;
    let cursorX = x + offset;
    for (const word of line) {
      ctx.fillText(word, cursorX, cursorY);
      cursorX += ctx.measureText(word).width + spaceWidth + extra;
    }
    cursorY += leading;
    lines += 1;
    line = [];
    lineWidth = 0;
    offset = 0;
  };

  for (const word of words) {
    const w = ctx.measureText(word).width;
    const projected = lineWidth + (line.length ? spaceWidth : 0) + w + offset;
    if (projected > width && line.length) {
      flush(false);
      if (lines >= maxLines) return cursorY;
    }
    lineWidth += w + (line.length ? spaceWidth : 0);
    line.push(word);
  }
  flush(true);
  return cursorY;
}

function rule(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  color: string,
  weight = 1,
) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, width, weight);
}

/* ── copy ────────────────────────────────────────────────────────────────── */

const BODY = [
  "The study adopts a mixed-method design in which quantitative instruments establish the distribution of the variables under review, while a smaller qualitative sample is used to interpret the pattern that emerges from them. Sampling was stratified by faculty so that the departmental spread remains representative of the wider population.",
  "Responses were coded against the framework set out in the preceding chapter and cross-checked by a second reviewer to control for interpretation drift. Where the two codings diverged the item was returned to the panel and resolved by discussion rather than by averaging, which preserves the reasoning behind each classification.",
  "Three observations follow from the table above. First, the relationship holds across every stratum, which suggests the effect is not an artefact of the sampling frame. Second, the magnitude falls as cohort size grows. Third, the residual variance is concentrated in a single faculty and is treated separately in section 4.6.",
  "These findings are consistent with the literature reviewed in Chapter Two, though the effect size reported here is smaller than that recorded by earlier work in comparable institutions. The divergence is most plausibly explained by the difference in instrument design and is discussed at length in the section that follows.",
];

const REFERENCES = [
  "Adeyemi, O. B. (2023). Institutional research capacity and supervision quality in Nigerian universities. Journal of Higher Education Policy, 41(2), 118–139.",
  "Bello, K., & Okonkwo, N. (2022). Measuring completion outcomes in undergraduate research projects. African Review of Education, 17(4), 205–221.",
  "Chukwu, I. (2024). Structured supervision and the undergraduate dissertation. Ibadan University Press.",
  "Danjuma, A. R. (2021). Assessment rubrics and the reproducibility of grading. Studies in Educational Evaluation, 68, 100–114.",
  "Eze, M. C., Salami, T., & Yusuf, H. (2023). Departmental formatting standards as a barrier to submission. Nigerian Journal of Academic Practice, 9(1), 44–61.",
];

/* ── page furniture ─────────────────────────────────────────────────────── */

interface Page {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  /** Type block. */
  ml: number;
  mr: number;
  mt: number;
  mb: number;
  colWidth: number;
  /** Type scale factor — the spec is authored against a 900px sheet. */
  s: number;
  p: ScenePalette;
  rand: () => number;
}

function stock(page: Page) {
  const { ctx, w, h, p } = page;
  ctx.fillStyle = p.paper;
  ctx.fillRect(0, 0, w, h);
}

/**
 * Sheet grain and edge shading, applied last so it sits over the type the way
 * ink sits in paper. Without this the sheets read as screens, not as stock.
 */
function finish(page: Page) {
  const { ctx, w, h, p, rand } = page;

  const tileSize = 128;
  const tile = document.createElement("canvas");
  tile.width = tileSize;
  tile.height = tileSize;
  const tctx = tile.getContext("2d");
  if (tctx) {
    const img = tctx.createImageData(tileSize, tileSize);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 118 + rand() * 74;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    tctx.putImageData(img, 0, 0);
    const pattern = ctx.createPattern(tile, "repeat");
    if (pattern) {
      ctx.save();
      ctx.globalCompositeOperation = "overlay";
      ctx.globalAlpha = 0.07;
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }

  // Sheets in a stack are never evenly lit to their trim.
  const vignette = ctx.createRadialGradient(
    w * 0.42,
    h * 0.38,
    w * 0.2,
    w * 0.5,
    h * 0.5,
    h * 0.78,
  );
  vignette.addColorStop(0, rgba(p.ink, 0));
  vignette.addColorStop(1, rgba(p.ink, 0.1));
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);

  // Gutter shadow at the bound edge.
  const gutter = ctx.createLinearGradient(0, 0, w * 0.09, 0);
  gutter.addColorStop(0, rgba(p.ink, 0.13));
  gutter.addColorStop(1, rgba(p.ink, 0));
  ctx.fillStyle = gutter;
  ctx.fillRect(0, 0, w * 0.09, h);
}

function runningHead(page: Page, left: string, folio: string) {
  const { ctx, w, mt, ml, mr, s, p } = page;
  ctx.fillStyle = rgba(p.inkMuted, 0.85);
  ctx.font = `500 ${9 * s}px ${SANS}`;
  tracked(ctx, left.toUpperCase(), ml, mt - 26 * s, 1.9 * s);
  ctx.font = `500 ${9 * s}px ${MONO}`;
  tracked(ctx, folio, w - mr, mt - 26 * s, 1.4 * s, "right");
  rule(page.ctx, ml, mt - 18 * s, w - ml - mr, rgba(p.rule, 0.75), Math.max(1, s * 0.9));
}

function folioFoot(page: Page, n: string) {
  const { ctx, w, h, mb, p, s } = page;
  ctx.fillStyle = rgba(p.inkMuted, 0.7);
  ctx.font = `500 ${9 * s}px ${MONO}`;
  const width = trackedWidth(ctx, n, 1.4 * s);
  tracked(ctx, n, w / 2 - width / 2, h - mb + 26 * s, 1.4 * s);
}

/* ── page compositions ──────────────────────────────────────────────────── */

function drawTitle(page: Page) {
  const { ctx, w, h, ml, mr, s, p, colWidth } = page;
  const cx = w / 2;

  ctx.fillStyle = rgba(p.inkMuted, 0.9);
  ctx.font = `500 ${9.5 * s}px ${SANS}`;
  const uni = "FACULTY OF ENGINEERING · DEPARTMENT OF COMPUTER SCIENCE";
  tracked(ctx, uni, cx - trackedWidth(ctx, uni, 1.8 * s) / 2, h * 0.2, 1.8 * s);

  rule(ctx, cx - 30 * s, h * 0.2 + 22 * s, 60 * s, rgba(p.accent, 0.9), Math.max(1, s));

  ctx.fillStyle = p.ink;
  ctx.font = `400 ${34 * s}px ${SERIF}`;
  ctx.textAlign = "center";
  const title = [
    "A Comparative Analysis of",
    "Adaptive Scheduling Models",
    "in Distributed Learning",
    "Environments",
  ];
  title.forEach((line, i) => ctx.fillText(line, cx, h * 0.31 + i * 46 * s));

  ctx.font = `italic 400 ${15 * s}px ${SERIF}`;
  ctx.fillStyle = rgba(p.inkMuted, 0.95);
  ctx.fillText("A dissertation submitted in partial fulfilment", cx, h * 0.56);
  ctx.fillText("of the requirements for the degree of", cx, h * 0.56 + 24 * s);
  ctx.textAlign = "left";

  rule(
    ctx,
    cx - colWidth * 0.18,
    h * 0.66,
    colWidth * 0.36,
    rgba(p.rule, 0.9),
    Math.max(1, s * 0.9),
  );

  ctx.fillStyle = p.ink;
  ctx.font = `500 ${12 * s}px ${SANS}`;
  const name = "O. A. ADEBAYO";
  tracked(ctx, name, cx - trackedWidth(ctx, name, 3 * s) / 2, h * 0.72, 3 * s);

  ctx.font = `500 ${9.5 * s}px ${MONO}`;
  ctx.fillStyle = rgba(p.inkMuted, 0.8);
  const reg = "MAT. NO. 2021/CS/0284";
  tracked(ctx, reg, cx - trackedWidth(ctx, reg, 1.4 * s) / 2, h * 0.755, 1.4 * s);

  rule(ctx, ml, h * 0.86, w - ml - mr, rgba(p.rule, 0.8), Math.max(1, s * 0.9));
  ctx.font = `500 ${9.5 * s}px ${MONO}`;
  ctx.fillStyle = rgba(p.inkMuted, 0.85);
  tracked(ctx, "SUPERVISED BY DR. F. N. OKAFOR", ml, h * 0.86 + 24 * s, 1.3 * s);
  tracked(ctx, "MARCH 2026", w - mr, h * 0.86 + 24 * s, 1.3 * s, "right");
}

function drawAbstract(page: Page) {
  const { ctx, ml, mt, s, p, colWidth } = page;
  runningHead(page, "Abstract", "ii");

  ctx.fillStyle = p.ink;
  ctx.font = `500 ${11 * s}px ${SANS}`;
  tracked(ctx, "ABSTRACT", ml, mt + 26 * s, 4 * s);

  ctx.font = `400 ${11.5 * s}px ${SERIF}`;
  ctx.fillStyle = rgba(p.ink, 0.9);
  let y = mt + 64 * s;
  y = paragraph(ctx, BODY[0], ml, y, colWidth, 19 * s);
  y = paragraph(ctx, BODY[1], ml, y + 10 * s, colWidth, 19 * s, { indent: 16 * s });
  y = paragraph(ctx, BODY[3], ml, y + 10 * s, colWidth, 19 * s, { indent: 16 * s });

  rule(ctx, ml, y + 18 * s, colWidth * 0.22, rgba(p.rule, 0.9), Math.max(1, s * 0.9));
  ctx.font = `500 ${9.5 * s}px ${SANS}`;
  ctx.fillStyle = rgba(p.inkMuted, 0.9);
  tracked(ctx, "KEYWORDS", ml, y + 42 * s, 2.2 * s);
  ctx.font = `italic 400 ${11 * s}px ${SERIF}`;
  ctx.fillStyle = rgba(p.ink, 0.8);
  ctx.fillText(
    "adaptive scheduling · distributed systems · supervision · completion rate",
    ml,
    y + 64 * s,
  );

  folioFoot(page, "ii");
}

function drawChapter(page: Page) {
  const { ctx, ml, mt, s, p, colWidth } = page;
  runningHead(page, "Chapter Four · Analysis", "47");

  ctx.fillStyle = rgba(p.accent, 0.95);
  ctx.font = `500 ${10 * s}px ${MONO}`;
  tracked(ctx, "CHAPTER FOUR", ml, mt + 34 * s, 3.4 * s);

  ctx.fillStyle = p.ink;
  ctx.font = `400 ${27 * s}px ${SERIF}`;
  ctx.fillText("Analysis and", ml, mt + 84 * s);
  ctx.fillText("Discussion of Findings", ml, mt + 120 * s);

  rule(ctx, ml, mt + 146 * s, colWidth, rgba(p.rule, 0.9), Math.max(1, s * 0.9));

  ctx.font = `500 ${11 * s}px ${SANS}`;
  ctx.fillStyle = rgba(p.ink, 0.9);
  ctx.fillText("4.1  Introduction", ml, mt + 182 * s);

  ctx.font = `400 ${11 * s}px ${SERIF}`;
  ctx.fillStyle = rgba(p.ink, 0.88);
  let y = mt + 210 * s;
  y = paragraph(ctx, BODY[0], ml, y, colWidth, 18 * s);
  y = paragraph(ctx, BODY[2], ml, y + 8 * s, colWidth, 18 * s, { indent: 16 * s });

  ctx.font = `500 ${11 * s}px ${SANS}`;
  ctx.fillStyle = rgba(p.ink, 0.9);
  ctx.fillText("4.2  Response distribution", ml, y + 26 * s);
  ctx.font = `400 ${11 * s}px ${SERIF}`;
  ctx.fillStyle = rgba(p.ink, 0.88);
  paragraph(ctx, BODY[1], ml, y + 54 * s, colWidth, 18 * s);

  folioFoot(page, "47");
}

function drawBody(page: Page) {
  const { ctx, ml, mt, s, p, colWidth } = page;
  runningHead(page, "Chapter Four · Analysis", "51");

  ctx.font = `400 ${11 * s}px ${SERIF}`;
  ctx.fillStyle = rgba(p.ink, 0.88);
  let y = mt + 24 * s;
  y = paragraph(ctx, BODY[3], ml, y, colWidth, 18 * s);
  y = paragraph(ctx, BODY[1], ml, y + 8 * s, colWidth, 18 * s, { indent: 16 * s });

  // Block quotation — indented, ruled at the left, set a size down.
  const quoteY = y + 22 * s;
  ctx.fillStyle = rgba(p.accent, 0.75);
  ctx.fillRect(ml, quoteY - 14 * s, Math.max(1.5, s * 1.6), 62 * s);
  ctx.font = `italic 400 ${10.5 * s}px ${SERIF}`;
  ctx.fillStyle = rgba(p.ink, 0.78);
  const qEnd = paragraph(
    ctx,
    "Supervision quality, not student aptitude, remains the strongest single predictor of on-time submission across every cohort examined.",
    ml + 22 * s,
    quoteY,
    colWidth - 22 * s,
    17 * s,
  );
  ctx.font = `500 ${9 * s}px ${MONO}`;
  ctx.fillStyle = rgba(p.inkMuted, 0.85);
  tracked(ctx, "— ADEYEMI (2023, P. 131)", ml + 22 * s, qEnd + 6 * s, 1.2 * s);

  ctx.font = `400 ${11 * s}px ${SERIF}`;
  ctx.fillStyle = rgba(p.ink, 0.88);
  paragraph(ctx, BODY[2], ml, qEnd + 40 * s, colWidth, 18 * s);

  folioFoot(page, "51");
}

function drawFigure(page: Page) {
  const { ctx, ml, mt, s, p, colWidth, rand } = page;
  runningHead(page, "Chapter Four · Analysis", "54");

  ctx.font = `400 ${11 * s}px ${SERIF}`;
  ctx.fillStyle = rgba(p.ink, 0.88);
  const y = paragraph(ctx, BODY[2], ml, mt + 24 * s, colWidth, 18 * s);

  // Figure frame — hairline box, no fill. An academic figure, not a dashboard.
  const fx = ml;
  const fy = y + 20 * s;
  const fw = colWidth;
  const fh = 150 * s;
  ctx.strokeStyle = rgba(p.rule, 0.95);
  ctx.lineWidth = Math.max(1, s * 0.9);
  ctx.strokeRect(fx, fy, fw, fh);

  ctx.strokeStyle = rgba(p.rule, 0.6);
  ctx.lineWidth = Math.max(0.5, s * 0.5);
  for (let i = 1; i < 4; i += 1) {
    ctx.beginPath();
    ctx.moveTo(fx, fy + (fh / 4) * i);
    ctx.lineTo(fx + fw, fy + (fh / 4) * i);
    ctx.stroke();
  }

  const points = 14;
  ctx.strokeStyle = rgba(p.ink, 0.85);
  ctx.lineWidth = Math.max(1.2, s * 1.3);
  ctx.beginPath();
  for (let i = 0; i < points; i += 1) {
    const t = i / (points - 1);
    const v = 0.22 + t * 0.52 + Math.sin(t * 7.1) * 0.07 + (rand() - 0.5) * 0.05;
    const px = fx + 14 * s + t * (fw - 28 * s);
    const py = fy + fh - 14 * s - v * (fh - 28 * s);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();

  // Comparison group, dashed.
  ctx.setLineDash([4 * s, 3 * s]);
  ctx.strokeStyle = rgba(p.accent, 0.8);
  ctx.beginPath();
  for (let i = 0; i < points; i += 1) {
    const t = i / (points - 1);
    const v = 0.2 + t * 0.28 + Math.cos(t * 5.4) * 0.05;
    const px = fx + 14 * s + t * (fw - 28 * s);
    const py = fy + fh - 14 * s - v * (fh - 28 * s);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.font = `500 ${9 * s}px ${SANS}`;
  ctx.fillStyle = rgba(p.inkMuted, 0.9);
  tracked(ctx, "FIGURE 4.2", fx, fy + fh + 20 * s, 1.8 * s);
  ctx.font = `italic 400 ${10 * s}px ${SERIF}`;
  ctx.fillStyle = rgba(p.ink, 0.78);
  paragraph(
    ctx,
    "Completion rate against supervision contact hours, by faculty (n = 412).",
    fx + 68 * s,
    fy + fh + 20 * s,
    fw - 68 * s,
    15 * s,
    { justify: false },
  );

  ctx.font = `400 ${11 * s}px ${SERIF}`;
  ctx.fillStyle = rgba(p.ink, 0.88);
  paragraph(ctx, BODY[3], ml, fy + fh + 52 * s, colWidth, 18 * s);

  folioFoot(page, "54");
}

function drawTable(page: Page) {
  const { ctx, ml, mt, s, p, colWidth } = page;
  runningHead(page, "Chapter Four · Analysis", "56");

  ctx.font = `500 ${9 * s}px ${SANS}`;
  ctx.fillStyle = rgba(p.inkMuted, 0.9);
  tracked(ctx, "TABLE 4.1", ml, mt + 26 * s, 1.8 * s);
  ctx.font = `italic 400 ${10.5 * s}px ${SERIF}`;
  ctx.fillStyle = rgba(p.ink, 0.8);
  ctx.fillText(
    "Distribution of responses by faculty and cohort size.",
    ml + 62 * s,
    mt + 26 * s,
  );

  const rows = [
    ["Engineering", "118", "0.74", "0.031"],
    ["Sciences", "96", "0.69", "0.028"],
    ["Social Sciences", "84", "0.71", "0.036"],
    ["Management", "72", "0.66", "0.041"],
    ["Arts", "42", "0.61", "0.052"],
  ];
  const cols = [0, 0.52, 0.68, 0.84].map((f) => ml + f * colWidth);
  let ty = mt + 56 * s;

  rule(ctx, ml, ty, colWidth, rgba(p.ink, 0.7), Math.max(1.2, s * 1.2));
  ty += 20 * s;
  ctx.font = `500 ${9 * s}px ${SANS}`;
  ctx.fillStyle = rgba(p.inkMuted, 0.95);
  ["FACULTY", "N", "MEAN", "S.E."].forEach((h, i) => tracked(ctx, h, cols[i], ty, 1.4 * s));
  ty += 10 * s;
  rule(ctx, ml, ty, colWidth, rgba(p.rule, 0.9), Math.max(1, s * 0.8));

  rows.forEach(([name, n, mean, se]) => {
    ty += 24 * s;
    ctx.font = `400 ${10.5 * s}px ${SERIF}`;
    ctx.fillStyle = rgba(p.ink, 0.88);
    ctx.fillText(name, cols[0], ty);
    ctx.font = `500 ${10 * s}px ${MONO}`;
    ctx.fillStyle = rgba(p.ink, 0.8);
    [n, mean, se].forEach((v, i) => ctx.fillText(v, cols[i + 1], ty));
  });

  ty += 14 * s;
  rule(ctx, ml, ty, colWidth, rgba(p.ink, 0.7), Math.max(1.2, s * 1.2));

  ctx.font = `400 ${11 * s}px ${SERIF}`;
  ctx.fillStyle = rgba(p.ink, 0.88);
  const afterTable = paragraph(ctx, BODY[2], ml, ty + 34 * s, colWidth, 18 * s);
  paragraph(ctx, BODY[0], ml, afterTable + 8 * s, colWidth, 18 * s, { indent: 16 * s });

  folioFoot(page, "56");
}

function drawReferences(page: Page) {
  const { ctx, ml, mt, s, p, colWidth } = page;
  runningHead(page, "References", "78");

  ctx.fillStyle = p.ink;
  ctx.font = `500 ${11 * s}px ${SANS}`;
  tracked(ctx, "REFERENCES", ml, mt + 28 * s, 4 * s);
  rule(ctx, ml, mt + 44 * s, colWidth, rgba(p.rule, 0.9), Math.max(1, s * 0.9));

  ctx.font = `400 ${10.5 * s}px ${SERIF}`;
  ctx.fillStyle = rgba(p.ink, 0.86);
  let y = mt + 76 * s;
  for (const entry of REFERENCES) {
    // Hanging indent, as required by every departmental style sheet in existence.
    y = paragraph(ctx, entry, ml + 18 * s, y, colWidth - 18 * s, 17 * s, {
      indent: -18 * s,
      justify: false,
    });
    y += 12 * s;
  }

  folioFoot(page, "78");
}

const RENDERERS: Record<PageKind, (page: Page) => void> = {
  title: drawTitle,
  abstract: drawAbstract,
  chapter: drawChapter,
  body: drawBody,
  figure: drawFigure,
  table: drawTable,
  references: drawReferences,
};

/* ── entry points ───────────────────────────────────────────────────────── */

export function createPageCanvas(
  kind: PageKind,
  palette: ScenePalette,
  resolution: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const w = Math.round(resolution);
  const h = Math.round(resolution * SHEET_RATIO);
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const s = w / 900;
  const page: Page = {
    ctx,
    w,
    h,
    ml: w * 0.14,
    mr: w * 0.11,
    mt: h * 0.11,
    mb: h * 0.09,
    colWidth: w - w * 0.14 - w * 0.11,
    s,
    p: palette,
    rand: mulberry32(kind.length * 7919 + w),
  };

  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  stock(page);
  RENDERERS[kind](page);
  finish(page);
  return canvas;
}

/**
 * Reviewer's marks, on a transparent overlay so they can be faded in
 * independently of the page beneath them. The editing state uses this: the
 * sheets do not change, the marks arrive on top of them — which is precisely
 * what the service is.
 */
export function createAnnotationCanvas(
  palette: ScenePalette,
  resolution: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const w = Math.round(resolution);
  const h = Math.round(resolution * SHEET_RATIO);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const s = w / 900;
  const accent = palette.accent;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Margin flags against three lines.
  [0.3, 0.47, 0.68].forEach((ty, i) => {
    ctx.strokeStyle = rgba(accent, 0.85);
    ctx.lineWidth = Math.max(1.4, s * 1.6);
    ctx.beginPath();
    ctx.moveTo(w * 0.075, h * ty);
    ctx.lineTo(w * 0.075, h * (ty + 0.035 + i * 0.008));
    ctx.stroke();
  });

  // An underlined phrase.
  ctx.strokeStyle = rgba(accent, 0.7);
  ctx.lineWidth = Math.max(1.2, s * 1.3);
  ctx.beginPath();
  ctx.moveTo(w * 0.31, h * 0.487);
  ctx.bezierCurveTo(w * 0.45, h * 0.492, w * 0.55, h * 0.482, w * 0.66, h * 0.489);
  ctx.stroke();

  // A circled term.
  ctx.beginPath();
  ctx.ellipse(w * 0.44, h * 0.31, w * 0.075, h * 0.014, -0.04, 0, Math.PI * 2);
  ctx.stroke();

  // A transposition mark.
  ctx.beginPath();
  ctx.moveTo(w * 0.55, h * 0.692);
  ctx.quadraticCurveTo(w * 0.575, h * 0.681, w * 0.6, h * 0.692);
  ctx.quadraticCurveTo(w * 0.625, h * 0.703, w * 0.65, h * 0.692);
  ctx.stroke();

  // Marginal notes, right-hand margin.
  ctx.fillStyle = rgba(accent, 0.9);
  ctx.font = `italic 400 ${11 * s}px ${SERIF}`;
  ctx.fillText("cite ed. 4", w * 0.88, h * 0.315);
  ctx.fillText("tense", w * 0.88, h * 0.495);

  return canvas;
}
