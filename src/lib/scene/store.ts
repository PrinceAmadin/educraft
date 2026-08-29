"use client";

import { create } from "zustand";
import type { SceneState } from "./composition";

/**
 * The bridge between the DOM and the WebGL layer.
 *
 * Only discrete state lives here — which composition the scene is holding, and
 * whether the scene has finished building. Continuous values (pointer, scroll)
 * deliberately do not: pushing those through a store would re-render the React
 * tree sixty times a second to move something React does not draw. Those go
 * through `signals.ts` as plain mutable refs and are read inside useFrame.
 */
interface SceneStore {
  state: SceneState;
  /**
   * Who asked for the current state. Hovering from one service card to the
   * next fires `leave` on the old card after `enter` on the new one, so a
   * naive reset would blank the composition between every pair of cards.
   */
  owner: string | null;
  /** True once textures are built and the first frame has been drawn. */
  ready: boolean;
  focus: (state: SceneState, owner: string) => void;
  release: (owner: string) => void;
  setReady: (ready: boolean) => void;
}

export const useSceneStore = create<SceneStore>((set) => ({
  state: "rest",
  owner: null,
  ready: false,
  focus: (state, owner) => set({ state, owner }),
  release: (owner) =>
    set((current) => (current.owner === owner ? { state: "rest", owner: null } : current)),
  setReady: (ready) => set({ ready }),
}));
