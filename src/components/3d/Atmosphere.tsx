"use client";

import * as React from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, Color, NormalBlending, ShaderMaterial, Vector2 } from "three";
import type { ScenePalette } from "@/lib/scene/art-direction";
import { damp } from "@/lib/scene/damp";
import { field } from "./useSceneInteraction";

/**
 * The ambient layer the composition sits inside.
 *
 * This is the one place in the scene that earns a hand-written shader. It is
 * not here to be colourful — it draws three things a texture could not do as
 * cheaply, all of them structural:
 *
 *   1. a single soft pool of light behind the document, so the sheets have
 *      something to be lit *against* rather than floating on a flat field;
 *   2. a ruled field, spaced like a ledger, that fades out well before the
 *      frame edge — the archive the document came out of;
 *   3. fibre noise at an amplitude just above the banding threshold, which is
 *      what stops a large soft gradient from ringing on 8-bit displays.
 *
 * Everything here is one draw call with no texture fetches.
 */

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  precision highp float;

  varying vec2 vUv;

  uniform float uTime;
  uniform vec2  uPointer;
  uniform vec3  uAtmosphere;
  uniform vec3  uRule;
  uniform float uIntensity;
  uniform float uRuleStrength;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float total = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 3; i++) {
      total += valueNoise(p) * amplitude;
      p *= 2.03;
      amplitude *= 0.5;
    }
    return total;
  }

  void main() {
    // The pool sits behind and slightly right of the composition, and leans
    // away from the pointer — the light source is part of the parallax field.
    vec2 centre = vec2(0.60, 0.54) - uPointer * 0.035;
    vec2 delta = (vUv - centre) * vec2(1.35, 1.0);
    float radius = length(delta);

    float pool = 1.0 - smoothstep(0.06, 0.62, radius);
    pool = pow(pool, 1.6);

    // Ruled field. Sharp lines, faded hard towards the frame so it reads as a
    // surface receding rather than as a texture pasted over the background.
    float ruled = smoothstep(0.46, 0.5, abs(fract(vUv.y * 46.0 + uTime * 0.004) - 0.5));
    float columns = smoothstep(0.482, 0.5, abs(fract(vUv.x * 12.0) - 0.5));
    float grid = max(ruled, columns * 0.55);
    float gridMask = (1.0 - smoothstep(0.12, 0.58, radius)) * uRuleStrength;

    // Fibre. Two very slow scales, opposed, so it never reads as a loop.
    float grain = fbm(vUv * 5.0 + vec2(uTime * 0.012, uTime * -0.008));
    float fine  = hash(vUv * 900.0 + uTime * 0.05) * 0.05;

    float alpha = pool * uIntensity * (0.72 + grain * 0.5) + grid * gridMask * 0.35 + fine * pool;

    vec3 colour = mix(uAtmosphere, uRule, grid * gridMask * 0.6);
    gl_FragColor = vec4(colour, clamp(alpha, 0.0, 1.0));
  }
`;

interface AtmosphereProps {
  palette: ScenePalette;
  reducedMotion: boolean;
  /**
   * Dark ground gains light; light ground gains shade. On a bone-white page an
   * additive layer would just wash out, so the light theme paints the same
   * pool as a soft shadow instead of a soft glow.
   */
  additive: boolean;
  intensity: number;
}

export function Atmosphere({ palette, reducedMotion, additive, intensity }: AtmosphereProps) {
  const material = React.useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: additive ? AdditiveBlending : NormalBlending,
        uniforms: {
          uTime: { value: 0 },
          uPointer: { value: new Vector2(0, 0) },
          uAtmosphere: { value: new Color(palette.atmosphere) },
          uRule: { value: new Color(palette.meta) },
          uIntensity: { value: 0 },
          uRuleStrength: { value: 0 },
        },
      }),
    [palette.atmosphere, palette.meta, additive],
  );

  React.useEffect(() => () => void material.dispose(), [material]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 20);
    const u = material.uniforms;
    if (!reducedMotion) u.uTime.value += delta;
    (u.uPointer.value as Vector2).set(field.x, field.y);

    // The atmosphere establishes first — it is the ground everything else
    // arrives onto, so it leads the entrance rather than following it.
    const arrival = Math.min(field.entrance / 0.35, 1);
    const exit = 1 - field.scroll * 0.75;
    u.uIntensity.value = damp(u.uIntensity.value as number, intensity * arrival * exit, 1.2, dt);
    u.uRuleStrength.value = damp(u.uRuleStrength.value as number, arrival * exit, 1.0, dt);
  });

  return (
    <mesh position={[0, 0, -6]} renderOrder={-10} material={material} frustumCulled={false}>
      <planeGeometry args={[34, 22]} />
    </mesh>
  );
}
