// Camera and world geometry for the view from behind the striker.
//
// World units are metres. x runs across the ground (+ = off side, which is the
// right of the screen for our right-handed striker), y runs down the pitch away
// from the camera, and z is height. The middle of the pitch is the origin.

export const DESIGN_W = 960;
export const DESIGN_H = 600;

export const R = 68; // boundary radius, from the middle of the pitch
export const STRIKER_Y = -10.06; // striker's stumps (the pitch is 20.12 m long)
export const BOWLER_Y = 10.06; // bowler's stumps
export const CREASE = 1.22; // popping crease, in front of each set of stumps
export const PITCH_HALF_W = 1.525;

// A keeper's-eye camera: a few metres behind the stumps, raised so the whole
// ground opens up beyond the batsman.
export const CAM = { x: 0, y: STRIKER_Y - 6.8, z: 4.9 };
const FOCAL = 520;
export const HORIZON = 160;
const CX = DESIGN_W / 2;
const NEAR = 0.5;

export type V3 = [number, number, number];

export interface Screen {
  x: number;
  y: number;
  ppm: number; // screen pixels per metre at this depth
  depth: number;
}

export const depthOf = (y: number) => y - CAM.y;
export const inFront = (y: number, margin = NEAR) => y - CAM.y > margin;

/** Project a world point to the screen. */
export function project(x: number, y: number, z = 0): Screen {
  const depth = Math.max(NEAR, y - CAM.y);
  const ppm = FOCAL / depth;
  return { x: CX + (x - CAM.x) * ppm, y: HORIZON + (CAM.z - z) * ppm, ppm, depth };
}

export const projectV = (p: V3) => project(p[0], p[1], p[2]);

/** A point on a circle around the middle of the pitch; 0° is straight down the ground. */
export function ring(radius: number, thetaDeg: number, z = 0): V3 {
  const a = (thetaDeg * Math.PI) / 180;
  return [radius * Math.sin(a), radius * Math.cos(a), z];
}

/** A field position (angle in degrees, distance as a fraction of R) to world xy. */
export function fieldToWorld(angleDeg: number, distance: number): { x: number; y: number } {
  const [x, y] = ring(distance * R, angleDeg);
  return { x, y };
}

// Two floodlight towers stand at each end of the ground. Every player throws a
// faint shadow away from each of them — the classic four-shadow night look.
export const TOWER_THETAS = [-42, 42, -138, 138];
export const SHADOW_DIRS: [number, number][] = TOWER_THETAS.map((t) => {
  const [x, y] = ring(1, t);
  return [-x, -y];
});

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (t: number) => {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
};

/** A tiny deterministic PRNG, so the crowd and grass look the same every render. */
export function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
