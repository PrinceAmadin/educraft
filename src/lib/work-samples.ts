import fs from "node:fs";
import path from "node:path";

/**
 * Work-sample images for the services bento.
 *
 * SERVER ONLY — this reads the filesystem. Import it from a server component
 * and pass the resulting string arrays down; importing it from a `"use client"`
 * module will fail the build.
 *
 * The folders are read at build time rather than tracked in a hand-written
 * manifest, so adding a sample is: drop the file in, rebuild. There is no
 * second place to remember to update, which is the only kind of registry that
 * stays correct.
 */

const PUBLIC_IMAGES = path.join(process.cwd(), "public", "images");
const EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".avif"]);

/** Public URLs for every image in `public/images/<dir>`, sorted for stability. */
export function listSamples(dir: string): string[] {
  try {
    return fs
      .readdirSync(path.join(PUBLIC_IMAGES, dir))
      .filter((file) => EXTENSIONS.has(path.extname(file).toLowerCase()))
      // Natural, case-insensitive order so `2.png` precedes `10.png` and the
      // sequence stays sensible however the folder is filled.
      .sort((a, b) => a.localeCompare(b, "en", { numeric: true, sensitivity: "base" }))
      // Paths are left raw. `next/image` percent-encodes the `src` when it
      // builds the optimizer URL, so encoding here too yields a double-encoded
      // `%2520` — which happens to still resolve, but is not something to rely
      // on. Filenames with spaces and parentheses are handled correctly by
      // passing them through unencoded.
      .map((file) => `/images/${dir}/${file}`);
  } catch {
    // Folder missing entirely — same outcome as an empty one.
    return [];
  }
}

/** Reads several folders into one pool, de-duplicated. */
export function listSamplesFrom(dirs: string[]): string[] {
  return [...new Set(dirs.flatMap(listSamples))];
}
