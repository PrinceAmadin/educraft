/**
 * Metadata typography for the WebGL layer.
 *
 * Rendered to a canvas at a fixed cap height and mapped onto a plane, rather
 * than extruded as geometry. Extruded type is the reflex answer and it is
 * almost always the wrong one: it turns a label into an object, and these are
 * not objects — they are the document control system's marginalia, sitting in
 * the same space as the sheets they annotate.
 */

const MONO = '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace';

/** Authoring resolution. The plane is sized in world units, not pixels. */
const CAP_HEIGHT = 44;
const PADDING = 10;

export interface LabelTexture {
  canvas: HTMLCanvasElement;
  /** width / height, so the plane can be sized without distorting the type. */
  aspect: number;
}

export function createLabelCanvas(
  text: string,
  color: string,
  emphasis = false,
): LabelTexture {
  const measure = document.createElement("canvas").getContext("2d");
  const font = `${emphasis ? 600 : 500} ${CAP_HEIGHT}px ${MONO}`;
  const tracking = emphasis ? CAP_HEIGHT * 0.14 : CAP_HEIGHT * 0.11;

  let width = CAP_HEIGHT * text.length * 0.6;
  if (measure) {
    measure.font = font;
    width =
      [...text].reduce((w, c) => w + measure.measureText(c).width + tracking, 0) - tracking;
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width + PADDING * 2);
  canvas.height = Math.ceil(CAP_HEIGHT * 1.6);

  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.font = font;
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    let cursor = PADDING;
    for (const char of text) {
      ctx.fillText(char, cursor, canvas.height / 2);
      cursor += ctx.measureText(char).width + tracking;
    }
  }

  return { canvas, aspect: canvas.width / canvas.height };
}
