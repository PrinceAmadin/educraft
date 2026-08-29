# EduCraft work-sample images

The services bento uses these folders as its backgrounds. Each cell rotates
through every image in its folder on a 3-second crossfade.

| Folder | Feeds | Currently |
|---|---|---|
| `fyb_img/` | Final Year Projects, Combined Packages | 5 images |
| `report_img/` | Reports & Papers, Editing & Formatting | 15 images |
| `ppt_img/` | Presentations | 7 images |
| `cv_img/` | CV & Career | **empty** — cell falls back to its designed empty state |

## Adding images

Drop the file into the folder and rebuild. That is the whole process — there is
no manifest to update. `src/lib/work-samples.ts` reads these folders with `fs`
at build time, filters to `.png/.jpg/.jpeg/.webp/.avif`, and sorts naturally
(so `2.png` precedes `10.png`).

Because the read happens at build time, a running dev server picks up new files
on its next compile; a production deploy needs a rebuild.

Filenames may contain spaces and parentheses — `next/image` percent-encodes the
path, so `Screenshot (670).png` works as-is. Do not pre-encode filenames.

A folder with no images is a supported state, not a broken one: the cell renders
a tinted empty treatment carrying the service icon, and shows its title and
description permanently rather than hiding them behind a hover with nothing to
reveal.

Use anonymised samples only — no real student names, matric numbers or
supervisor details.
