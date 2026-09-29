/**
 * Every Mode 5 data source, by the name the catalogue uses. The fetcher only
 * ever reaches a source through here.
 */

import type { SourceModule } from "./source-module";
import type { SeriesSource, SourceName } from "./source-types";
import { cbnModule } from "./sources/cbn";
import { worldBankModule } from "./sources/world-bank";

export const SOURCE_REGISTRY: { readonly [N in SourceName]: SourceModule<N> } = {
  WB: worldBankModule,
  CBN: cbnModule,
};

export const SOURCE_NAMES = Object.keys(SOURCE_REGISTRY) as SourceName[];

/** The module that serves this series (typed for any series). */
export function moduleFor(s: SeriesSource): SourceModule {
  return SOURCE_REGISTRY[s.source] as SourceModule;
}

/** The key a series' last good copy is saved under (the same series, whatever project asked for it). */
export function seriesCacheKey(s: SeriesSource): string {
  return moduleFor(s).cacheKey(s);
}

/** Where a series came from, as the notes and table sources say it. */
export function sourceLabel(s: SeriesSource): string {
  return moduleFor(s).label;
}

export function sourceCode(s: SeriesSource): string {
  return moduleFor(s).code(s);
}
