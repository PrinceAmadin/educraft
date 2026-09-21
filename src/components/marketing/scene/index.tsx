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
 * The CSS stack is the only implementation. It is interactive (drag / tilt /
 * scroll depth, see PaperStack) without any 3D library.
 */
export function HeroVisual() {
  return <PaperStack />;
}
