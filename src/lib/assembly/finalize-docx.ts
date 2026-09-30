/**
 * The last step of every Word file the assembly makes (the whole report and a
 * single chapter): give the document a real default paragraph style.
 *
 * The docx library never writes a `Normal` style, so body text took its 2.0
 * spacing and justification only from the document defaults. Microsoft Word
 * honours those; WPS Office puts its own single-spaced Normal in their place,
 * so a draft opened there looked single spaced (founder, 30 Sept 2026). The
 * style carries no bold, italics, outline level or numbering, so the Word
 * reader's roles and the formatting checks read every paragraph as before.
 */

import JSZip from "jszip";

/** Times New Roman 12pt black, Double (480, auto), nothing before or after, no indent, justified. */
export const DEFAULT_PARAGRAPH_STYLE =
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal">' +
  '<w:name w:val="Normal"/><w:qFormat/>' +
  '<w:pPr><w:spacing w:before="0" w:after="0" w:line="480" w:lineRule="auto"/><w:ind w:left="0" w:firstLine="0"/><w:jc w:val="both"/></w:pPr>' +
  '<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman" w:cs="Times New Roman"/><w:color w:val="000000"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>' +
  "</w:style>";

const STYLE_OPEN = /<w:style\s[^>]*>/g;

/** The opening tag of the default paragraph style, or null (pure; the formatting checks use it too). */
export function defaultParagraphStyle(styles: string): string | null {
  for (const m of styles.matchAll(STYLE_OPEN)) {
    const tag = m[0];
    if (/w:type="paragraph"/.test(tag) && /w:default="(?:1|true|on)"/.test(tag)) {
      if (tag.endsWith("/>")) return tag;
      const end = styles.indexOf("</w:style>", m.index ?? 0);
      return end === -1 ? tag : styles.slice(m.index ?? 0, end + "</w:style>".length);
    }
  }
  return null;
}

/**
 * styles.xml with a default paragraph style. Left alone when one exists. A
 * style already called Normal (no default flag) is made the default; otherwise
 * the style is added after the document defaults and latent styles.
 */
export function withDefaultParagraphStyle(styles: string): string {
  if (!styles || defaultParagraphStyle(styles)) return styles;
  const named = /<w:style\s[^>]*w:styleId="Normal"[^>]*>/.exec(styles);
  if (named && /w:type="paragraph"/.test(named[0])) {
    return styles.replace(named[0], named[0].replace(/<w:style\s/, '<w:style w:default="1" '));
  }
  for (const anchor of ["</w:latentStyles>", "</w:docDefaults>"]) {
    const at = styles.indexOf(anchor);
    if (at !== -1) return styles.slice(0, at + anchor.length) + DEFAULT_PARAGRAPH_STYLE + styles.slice(at + anchor.length);
  }
  const open = /<w:styles(?:\s[^>]*)?>/.exec(styles);
  if (!open) return styles;
  const at = (open.index ?? 0) + open[0].length;
  return styles.slice(0, at) + DEFAULT_PARAGRAPH_STYLE + styles.slice(at);
}

/** Packed .docx bytes with the default paragraph style in place. */
export async function finalizeDocx(buffer: Buffer | Uint8Array): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  const file = zip.file("word/styles.xml");
  if (!file) return Buffer.from(buffer);
  const styles = await file.async("string");
  const fixed = withDefaultParagraphStyle(styles);
  if (fixed === styles) return Buffer.from(buffer);
  zip.file("word/styles.xml", fixed);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
