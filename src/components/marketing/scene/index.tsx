import { PaperStack } from "./PaperStack";

/**
 * The hero visual.
 *
 * This was previously a capability gate that lazily swapped in a WebGL
 * (three + @react-three/fiber) workspace on capable devices, with the CSS
 * composition as the fallback. That was removed deliberately: the renderer
 * cost ~150KB of JS plus canvas compositing on exactly the low-end Android
 * hardware most of our traffic runs on, to redraw a composition the CSS
 * version already expresses.
 *
 * The CSS stack is now the only implementation, not a fallback — so this is a
 * plain server component with no client boundary, no capability probing and
 * no code-split chunk.
 */
export function HeroVisual() {
  return <PaperStack />;
}
