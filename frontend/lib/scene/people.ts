// Players as little 3D skeletons. A pose is a set of joint positions in the
// body's own frame (x forward, y to the body's left, z up, in metres). Poses are
// blended for animation, placed in the world, projected through the camera and
// drawn as shaded limbs — far parts first — so they hold up from any angle.

import type { TeamCode } from "@/types/match";
import { CAM, SHADOW_DIRS, type Screen, type V3, clamp, lerp, project, projectV } from "./camera";

export type Joint =
  | "head"
  | "neck"
  | "pelvis"
  | "lSho"
  | "rSho"
  | "lElb"
  | "rElb"
  | "lHand"
  | "rHand"
  | "lHip"
  | "rHip"
  | "lKnee"
  | "rKnee"
  | "lAnk"
  | "rAnk"
  | "lToe"
  | "rToe";

/** bat.top is the end of the handle, bat.dir points from there to the toe of the blade. */
export type Pose = Record<Joint, V3> & { bat?: { top: V3; dir: V3 } };

const JOINTS: Joint[] = [
  "head", "neck", "pelvis", "lSho", "rSho", "lElb", "rElb", "lHand", "rHand",
  "lHip", "rHip", "lKnee", "rKnee", "lAnk", "rAnk", "lToe", "rToe",
];
const BAT_LEN = 0.96;

// --- vector helpers ----------------------------------------------------------------

const v3lerp = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const add = (a: V3, b: V3, s = 1): V3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
function norm(a: V3): V3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

export function blend(a: Pose, b: Pose, t: number): Pose {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const out = {} as Pose;
  for (const j of JOINTS) out[j] = v3lerp(a[j], b[j], t);
  if (a.bat && b.bat) out.bat = { top: v3lerp(a.bat.top, b.bat.top, t), dir: norm(v3lerp(a.bat.dir, b.bat.dir, t)) };
  else out.bat = (t < 0.5 ? a : b).bat;
  return out;
}

/** Put both hands on the bat handle (top hand left, bottom hand right). */
function grip(p: Pose): Pose {
  if (!p.bat) return p;
  const d = norm(p.bat.dir);
  return { ...p, lHand: add(p.bat.top, d, 0.07), rHand: add(p.bat.top, d, 0.17), bat: { top: p.bat.top, dir: d } };
}

function pose(j: Partial<Record<Joint, V3>>, base?: Pose, bat?: { top: V3; dir: V3 }): Pose {
  const out = { ...(base ?? ({} as Pose)), ...j } as Pose;
  if (bat) out.bat = { top: bat.top, dir: norm(bat.dir) };
  return out;
}

// --- standing figures ----------------------------------------------------------------

export const STAND: Pose = pose({
  head: [0.03, 0, 1.64], neck: [0, 0, 1.47], pelvis: [0, 0, 0.94],
  lSho: [0, 0.19, 1.44], rSho: [0, -0.19, 1.44],
  lElb: [-0.02, 0.24, 1.16], rElb: [-0.02, -0.24, 1.16],
  lHand: [0.04, 0.25, 0.9], rHand: [0.04, -0.25, 0.9],
  lHip: [0, 0.1, 0.94], rHip: [0, -0.1, 0.94],
  lKnee: [0.03, 0.11, 0.51], rKnee: [0.03, -0.11, 0.51],
  lAnk: [0, 0.12, 0.08], rAnk: [0, -0.12, 0.08],
  lToe: [0.15, 0.14, 0.03], rToe: [0.15, -0.14, 0.03],
});

export const READY: Pose = pose({
  head: [0.24, 0, 1.38], neck: [0.17, 0, 1.24], pelvis: [-0.04, 0, 0.78],
  lSho: [0.15, 0.19, 1.21], rSho: [0.15, -0.19, 1.21],
  lElb: [0.32, 0.23, 0.98], rElb: [0.32, -0.23, 0.98],
  lHand: [0.45, 0.12, 0.8], rHand: [0.45, -0.12, 0.8],
  lHip: [-0.04, 0.11, 0.78], rHip: [-0.04, -0.11, 0.78],
  lKnee: [0.16, 0.2, 0.46], rKnee: [0.16, -0.2, 0.46],
  lAnk: [0, 0.23, 0.08], rAnk: [0, -0.23, 0.08],
  lToe: [0.15, 0.26, 0.03], rToe: [0.15, -0.26, 0.03],
});

export const CATCH: Pose = pose(
  { head: [0.06, 0, 1.66], lElb: [0.14, 0.2, 1.62], rElb: [0.14, -0.2, 1.62], lHand: [0.22, 0.05, 1.86], rHand: [0.22, -0.05, 1.86] },
  STAND,
);

export const PICKUP: Pose = pose({
  head: [0.44, 0, 1.08], neck: [0.32, 0, 1.0], pelvis: [-0.12, 0, 0.72],
  lSho: [0.3, 0.18, 0.98], rSho: [0.3, -0.18, 0.98],
  lElb: [0.44, 0.2, 0.7], rElb: [0.44, -0.2, 0.7],
  lHand: [0.56, 0.08, 0.36], rHand: [0.56, -0.08, 0.36],
  lHip: [-0.12, 0.11, 0.72], rHip: [-0.12, -0.11, 0.72],
  lKnee: [0.18, 0.16, 0.42], rKnee: [0.14, -0.16, 0.4],
  lAnk: [0.05, 0.2, 0.08], rAnk: [-0.15, -0.2, 0.1],
  lToe: [0.2, 0.22, 0.03], rToe: [0.0, -0.22, 0.04],
});

export const CELEBRATE: Pose = pose(
  { lElb: [0.02, 0.33, 1.72], rElb: [0.02, -0.33, 1.72], lHand: [0.06, 0.44, 2.0], rHand: [0.06, -0.44, 2.0], head: [0.0, 0, 1.66] },
  STAND,
);

export const DESPAIR: Pose = pose(
  { lElb: [0.05, 0.34, 1.62], rElb: [0.05, -0.34, 1.62], lHand: [0.0, 0.11, 1.74], rHand: [0.0, -0.11, 1.74], head: [0.08, 0, 1.6] },
  STAND,
);

/** A running stride. phase advances by 2π per pair of steps. */
export function runPose(phase: number, stride = 1): Pose {
  const leg = (side: 1 | -1, ph: number) => {
    const s = Math.sin(ph);
    const lift = Math.max(0, Math.cos(ph));
    const foot: V3 = [0.42 * stride * s, 0.11 * side, 0.09 + 0.26 * lift * stride];
    const knee: V3 = [(foot[0] - 0.04) / 2 + 0.15 + 0.12 * lift, 0.11 * side, 0.52 + 0.1 * lift];
    return { foot, knee, toe: [foot[0] + 0.15, foot[1], Math.max(0.02, foot[2] - 0.05)] as V3 };
  };
  const arm = (side: 1 | -1, ph: number) => {
    const s = Math.sin(ph);
    return {
      elb: [0.2 * s * stride - 0.06, 0.23 * side, 1.15] as V3,
      hand: [0.12 + 0.3 * s * stride, 0.19 * side, 1.02 + 0.12 * Math.max(0, s)] as V3,
    };
  };
  const L = leg(1, phase);
  const Rr = leg(-1, phase + Math.PI);
  const la = arm(1, phase + Math.PI);
  const ra = arm(-1, phase);
  const bob = 0.035 * Math.abs(Math.cos(phase));
  return pose({
    head: [0.2, 0, 1.6 + bob], neck: [0.14, 0, 1.44 + bob], pelvis: [0, 0, 0.95 + bob],
    lSho: [0.12, 0.19, 1.41 + bob], rSho: [0.12, -0.19, 1.41 + bob],
    lElb: la.elb, rElb: ra.elb, lHand: la.hand, rHand: ra.hand,
    lHip: [0, 0.1, 0.95 + bob], rHip: [0, -0.1, 0.95 + bob],
    lKnee: L.knee, rKnee: Rr.knee, lAnk: L.foot, rAnk: Rr.foot, lToe: L.toe, rToe: Rr.toe,
  });
}

// --- the bowling action ---------------------------------------------------------------

const GATHER = pose({
  head: [0.0, 0.03, 1.82], neck: [-0.06, 0, 1.64], pelvis: [0, 0, 1.1],
  lSho: [0.12, 0.06, 1.6], rSho: [-0.22, -0.06, 1.6],
  lHip: [0.06, 0.08, 1.1], rHip: [-0.08, -0.08, 1.1],
  lKnee: [0.25, 0.1, 0.85], rKnee: [-0.05, -0.1, 0.62],
  lAnk: [0.12, 0.1, 0.5], rAnk: [-0.2, -0.1, 0.25],
  lToe: [0.26, 0.1, 0.48], rToe: [-0.08, -0.1, 0.18],
  lElb: [0, 0, 0], rElb: [0, 0, 0], lHand: [0, 0, 0], rHand: [0, 0, 0],
});
const PLANT = pose({
  head: [0.16, 0, 1.6], neck: [0.08, 0, 1.45], pelvis: [0, 0, 0.9],
  lSho: [0.12, 0.17, 1.42], rSho: [0.0, -0.19, 1.42],
  lHip: [0.02, 0.1, 0.9], rHip: [-0.02, -0.1, 0.9],
  lKnee: [0.5, 0.06, 0.5], rKnee: [-0.25, -0.1, 0.48],
  lAnk: [0.55, 0.06, 0.08], rAnk: [-0.55, -0.1, 0.16],
  lToe: [0.7, 0.06, 0.03], rToe: [-0.42, -0.1, 0.06],
  lElb: [0, 0, 0], rElb: [0, 0, 0], lHand: [0, 0, 0], rHand: [0, 0, 0],
});
const FOLLOW = pose({
  head: [0.55, 0.06, 1.33], neck: [0.42, 0.05, 1.22], pelvis: [0.12, 0, 0.85],
  lSho: [0.38, 0.22, 1.2], rSho: [0.4, -0.15, 1.18],
  lHip: [0.12, 0.1, 0.85], rHip: [0.12, -0.1, 0.85],
  lKnee: [0.48, 0.08, 0.48], rKnee: [0.42, -0.12, 0.62],
  lAnk: [0.4, 0.08, 0.08], rAnk: [0.35, -0.12, 0.3],
  lToe: [0.55, 0.08, 0.03], rToe: [0.5, -0.12, 0.28],
  lElb: [0, 0, 0], rElb: [0, 0, 0], lHand: [0, 0, 0], rHand: [0, 0, 0],
});

/** The delivery stride: gather (u=0) → release (u=RELEASE_U) → follow-through (u=1). */
export const RELEASE_U = 0.55;
export function bowlPose(u: number): Pose {
  const body = u < 0.5 ? blend(GATHER, PLANT, u / 0.5) : blend(PLANT, FOLLOW, (u - 0.5) / 0.5);
  // Bowling arm windmills over the top, straight, in the body's x–z plane.
  const a =
    ((u < RELEASE_U ? lerp(40, 192, u / RELEASE_U) : lerp(192, 340, (u - RELEASE_U) / (1 - RELEASE_U))) * Math.PI) /
    180;
  const across = u > RELEASE_U ? 0.32 * ((u - RELEASE_U) / (1 - RELEASE_U)) : 0;
  const rHand = add(body.rSho, [-Math.sin(a), across, -Math.cos(a)], 0.68);
  // Front arm reaches up at the batsman, then pulls down hard.
  const b = ((u < 0.6 ? lerp(205, 25, u / 0.6) : lerp(25, 60, (u - 0.6) / 0.4)) * Math.PI) / 180;
  const lHand = add(body.lSho, [-Math.sin(b), 0.05, -Math.cos(b)], 0.62);
  return {
    ...body,
    rHand,
    rElb: v3lerp(body.rSho, rHand, 0.5),
    lHand,
    lElb: add(v3lerp(body.lSho, lHand, 0.5), [0, 0.06, -0.03]),
  };
}

// --- the striker -----------------------------------------------------------------------
// Batting poses use the world-aligned frame (x = off side, y = toward the bowler),
// so shots point the right way. Right-handed, slightly open stance.

const LEGS_STANCE = {
  lAnk: [0.03, 0.25, 0.08] as V3, rAnk: [0.0, -0.23, 0.08] as V3,
  lToe: [0.19, 0.33, 0.03] as V3, rToe: [0.17, -0.2, 0.03] as V3,
  lKnee: [0.16, 0.22, 0.5] as V3, rKnee: [0.12, -0.18, 0.5] as V3,
};

export const BAT_STANCE: Pose = grip(
  pose(
    {
      ...LEGS_STANCE,
      pelvis: [-0.04, 0.02, 0.92], lHip: [-0.08, 0.12, 0.92], rHip: [0.0, -0.08, 0.92],
      neck: [0.12, 0.12, 1.39], lSho: [0.02, 0.29, 1.37], rSho: [0.22, -0.05, 1.37],
      head: [0.17, 0.18, 1.55], lElb: [0.15, 0.34, 1.12], rElb: [0.34, 0.01, 1.06],
      lHand: [0, 0, 0], rHand: [0, 0, 0],
    },
    undefined,
    { top: [0.29, 0.23, 0.98], dir: [-0.08, -0.28, -0.97] },
  ),
);

export const BAT_BACKLIFT: Pose = grip(
  pose(
    {
      lKnee: [0.18, 0.22, 0.48], rKnee: [0.13, -0.17, 0.49],
      pelvis: [-0.05, 0.0, 0.91], lHip: [-0.09, 0.1, 0.91], rHip: [-0.01, -0.1, 0.91],
      neck: [0.1, 0.08, 1.4], lSho: [0.03, 0.27, 1.38], rSho: [0.17, -0.1, 1.37],
      head: [0.16, 0.16, 1.56], lElb: [0.24, 0.24, 1.08], rElb: [0.0, -0.17, 1.13],
    },
    BAT_STANCE,
    { top: [0.15, 0.1, 1.06], dir: [-0.35, -0.5, 0.79] },
  ),
);

export const BAT_LEAVE: Pose = grip(
  pose(
    {
      lAnk: [0.05, 0.36, 0.08], lToe: [0.21, 0.44, 0.03], lKnee: [0.18, 0.31, 0.5],
      pelvis: [-0.04, 0.03, 0.94], lHip: [-0.08, 0.13, 0.94], rHip: [0.0, -0.07, 0.94],
      neck: [0.08, 0.1, 1.42], lSho: [0.0, 0.27, 1.4], rSho: [0.17, -0.08, 1.4],
      head: [0.13, 0.16, 1.58], lElb: [0.25, 0.25, 1.4], rElb: [0.05, -0.22, 1.42],
    },
    BAT_STANCE,
    { top: [0.1, 0.05, 1.5], dir: [-0.15, -0.25, 0.96] },
  ),
);

const FRONT_FOOT = {
  lAnk: [0.08, 0.62, 0.08] as V3, lToe: [0.22, 0.74, 0.03] as V3, lKnee: [0.22, 0.56, 0.5] as V3,
  rAnk: [-0.02, -0.2, 0.12] as V3, rToe: [0.13, -0.14, 0.02] as V3, rKnee: [0.06, -0.02, 0.46] as V3,
};
const COVER_FOOT = {
  ...FRONT_FOOT,
  lAnk: [0.3, 0.52, 0.08] as V3, lToe: [0.44, 0.62, 0.03] as V3, lKnee: [0.4, 0.46, 0.5] as V3,
};
const BACK_FOOT = {
  rAnk: [0.0, -0.26, 0.08] as V3, rToe: [0.14, -0.3, 0.03] as V3, rKnee: [0.1, -0.22, 0.5] as V3,
  lAnk: [-0.04, 0.2, 0.08] as V3, lToe: [0.1, 0.3, 0.03] as V3, lKnee: [0.06, 0.18, 0.5] as V3,
};

type ShotPoses = { impact: Pose; finish: Pose };
export const SHOTS: Record<"leg" | "straight" | "off", ShotPoses> = {
  straight: {
    impact: grip(pose({
      ...FRONT_FOOT,
      pelvis: [0.0, 0.24, 0.84], lHip: [-0.04, 0.34, 0.84], rHip: [0.04, 0.14, 0.84],
      neck: [0.16, 0.42, 1.3], lSho: [0.06, 0.55, 1.28], rSho: [0.26, 0.29, 1.27],
      head: [0.22, 0.5, 1.44], lElb: [0.18, 0.62, 1.05], rElb: [0.38, 0.4, 0.98],
    }, BAT_STANCE, { top: [0.3, 0.56, 0.98], dir: [0.0, 0.18, -0.98] })),
    finish: grip(pose({
      ...FRONT_FOOT,
      pelvis: [0.02, 0.26, 0.86], lHip: [-0.02, 0.36, 0.86], rHip: [0.06, 0.16, 0.86],
      neck: [0.12, 0.44, 1.35], lSho: [0.0, 0.52, 1.33], rSho: [0.24, 0.34, 1.33],
      head: [0.18, 0.5, 1.5], lElb: [0.22, 0.62, 1.55], rElb: [0.34, 0.36, 1.48],
    }, BAT_STANCE, { top: [0.18, 0.5, 1.62], dir: [-0.35, -0.45, 0.82] })),
  },
  off: {
    impact: grip(pose({
      ...COVER_FOOT,
      pelvis: [0.06, 0.18, 0.84], lHip: [0.02, 0.29, 0.84], rHip: [0.1, 0.07, 0.84],
      neck: [0.28, 0.34, 1.3], lSho: [0.18, 0.47, 1.28], rSho: [0.36, 0.2, 1.26],
      head: [0.34, 0.42, 1.43], lElb: [0.34, 0.52, 1.05], rElb: [0.48, 0.3, 0.98],
    }, BAT_STANCE, { top: [0.46, 0.44, 0.92], dir: [0.42, 0.32, -0.85] })),
    finish: grip(pose({
      ...COVER_FOOT,
      pelvis: [0.08, 0.2, 0.86], lHip: [0.04, 0.31, 0.86], rHip: [0.12, 0.09, 0.86],
      neck: [0.24, 0.36, 1.35], lSho: [0.12, 0.47, 1.33], rSho: [0.34, 0.24, 1.33],
      head: [0.3, 0.42, 1.5], lElb: [0.3, 0.58, 1.52], rElb: [0.44, 0.3, 1.46],
    }, BAT_STANCE, { top: [0.26, 0.5, 1.58], dir: [-0.15, -0.62, 0.77] })),
  },
  leg: {
    impact: grip(pose({
      ...BACK_FOOT,
      pelvis: [-0.03, -0.02, 0.92], lHip: [-0.1, 0.06, 0.92], rHip: [0.04, -0.1, 0.92],
      neck: [0.06, 0.06, 1.42], lSho: [-0.06, 0.2, 1.4], rSho: [0.18, -0.06, 1.4],
      head: [0.12, 0.14, 1.58], lElb: [0.2, 0.26, 1.18], rElb: [0.3, 0.0, 1.12],
    }, BAT_STANCE, { top: [0.4, 0.16, 1.12], dir: [0.05, 0.98, 0.15] })),
    finish: grip(pose({
      ...BACK_FOOT,
      pelvis: [-0.03, -0.02, 0.92], lHip: [-0.08, 0.1, 0.92], rHip: [0.02, -0.12, 0.92],
      neck: [0.0, 0.06, 1.42], lSho: [-0.14, 0.12, 1.4], rSho: [0.12, 0.06, 1.4],
      head: [0.06, 0.14, 1.58], lElb: [-0.18, 0.3, 1.3], rElb: [0.05, 0.25, 1.3],
    }, BAT_STANCE, { top: [-0.1, 0.22, 1.3], dir: [-0.75, -0.35, 0.55] })),
  },
};

/** The non-striker, bat grounded, backing up. Body frame. */
export const NON_STRIKER: Pose = pose(
  { rHand: [0.12, -0.27, 0.9], rElb: [0.02, -0.27, 1.14] },
  STAND,
  { top: [0.12, -0.28, 0.95], dir: [0.26, -0.02, -0.96] },
);

// --- umpire signals --------------------------------------------------------------------

export type Signal = "out" | "four" | "six" | "wide" | "no_ball" | "bye" | "leg_bye" | null;

export function umpirePose(signal: Signal, t: number, crouch: number): Pose {
  if (!signal) {
    const bent = pose(
      {
        pelvis: [-0.06, 0, 0.88], lHip: [-0.06, 0.1, 0.88], rHip: [-0.06, -0.1, 0.88],
        neck: [0.12, 0, 1.38], lSho: [0.1, 0.19, 1.35], rSho: [0.1, -0.19, 1.35], head: [0.17, 0, 1.54],
        lKnee: [0.1, 0.12, 0.5], rKnee: [0.1, -0.12, 0.5],
        lElb: [0.2, 0.25, 1.08], rElb: [0.2, -0.25, 1.08], lHand: [0.14, 0.14, 0.58], rHand: [0.14, -0.14, 0.58],
      },
      STAND,
    );
    return blend(STAND, bent, crouch);
  }
  switch (signal) {
    case "out":
    case "bye":
      return pose({ rElb: [0.05, -0.22, 1.76], rHand: [0.1, -0.2, 2.08] }, STAND);
    case "six":
      return pose({ lElb: [0.02, 0.25, 1.76], lHand: [0.04, 0.26, 2.08], rElb: [0.02, -0.25, 1.76], rHand: [0.04, -0.26, 2.08] }, STAND);
    case "wide":
      return pose({ lElb: [0, 0.48, 1.43], lHand: [0, 0.8, 1.42], rElb: [0, -0.48, 1.43], rHand: [0, -0.8, 1.42] }, STAND);
    case "no_ball":
      return pose({ rElb: [0, -0.48, 1.43], rHand: [0, -0.8, 1.42] }, STAND);
    case "leg_bye":
      return pose(
        { lKnee: [0.34, 0.1, 0.8], lAnk: [0.28, 0.1, 0.42], lToe: [0.42, 0.1, 0.4], rElb: [0.25, -0.12, 1.1], rHand: [0.36, 0.04, 0.86] },
        STAND,
      );
    case "four": {
      const w = Math.sin(t * 0.012);
      return pose({ rElb: [0.32, -0.3 + 0.1 * w, 1.25], rHand: [0.48, -0.15 + 0.5 * w, 1.2] }, STAND);
    }
  }
}

// --- kits ----------------------------------------------------------------------------------

export interface Kit {
  shirt: string;
  shirtDark: string;
  trim: string;
  trousers: string;
  helmet: string;
  cap: string;
  grip: string;
  sticker: string;
}

export const KITS: Record<TeamCode, Kit> = {
  IND: {
    shirt: "#1f4fd1", shirtDark: "#16389a", trim: "#ff8c1a", trousers: "#1a2c66",
    helmet: "#18265e", cap: "#18265e", grip: "#d9480f", sticker: "#d71920",
  },
  PAK: {
    shirt: "#0c8a3e", shirtDark: "#076b30", trim: "#b7f35a", trousers: "#0a4a27",
    helmet: "#0b4424", cap: "#0b4424", grip: "#111111", sticker: "#1d4ed8",
  },
};

export const UMPIRE_KIT: Kit = {
  shirt: "#f472b6", shirtDark: "#db2777", trim: "#111827", trousers: "#111827",
  helmet: "#f5f5f4", cap: "#f5f5f4", grip: "#000", sticker: "#000",
};

const SKIN = "#a06a44";
const PAD = "#f6f7f9";
const PAD_SHADE = "#cfd4dc";

// --- placement + drawing --------------------------------------------------------------------

export interface Figure {
  pose: Pose;
  x: number;
  y: number;
  /** Facing direction in radians: 0 = +x (off side), π/2 = +y (down the ground). */
  yaw: number;
  kit: Kit;
  gear: "bat" | "field" | "umpire";
  look?: V3; // world point the head turns to
  name?: string;
  number?: number;
  ballInHand?: boolean;
  alpha?: number;
  highlight?: boolean;
}

type W = Record<Joint, V3>;

/** World position of one joint of a pose placed at (x, y) facing yaw. */
export function jointAt(p: Pose, x: number, y: number, yaw: number, j: Joint): V3 {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const q = p[j];
  return [x + q[0] * c - q[1] * s, y + q[0] * s + q[1] * c, q[2]];
}

/** Raise a whole pose off the ground (a jump). */
export function lift(p: Pose, dz: number): Pose {
  const out = { ...p };
  for (const j of JOINTS) out[j] = [p[j][0], p[j][1], p[j][2] + dz];
  if (p.bat) out.bat = { top: [p.bat.top[0], p.bat.top[1], p.bat.top[2] + dz], dir: p.bat.dir };
  return out;
}

function toWorld(f: Figure): { w: W; bat?: [V3, V3] } {
  const c = Math.cos(f.yaw);
  const s = Math.sin(f.yaw);
  const tw = (p: V3): V3 => [f.x + p[0] * c - p[1] * s, f.y + p[0] * s + p[1] * c, p[2]];
  const w = {} as W;
  for (const j of JOINTS) w[j] = tw(f.pose[j]);
  let bat: [V3, V3] | undefined;
  if (f.pose.bat) {
    const top = tw(f.pose.bat.top);
    const tip = tw(add(f.pose.bat.top, f.pose.bat.dir, BAT_LEN));
    bat = [top, tip];
  }
  return { w, bat };
}

/** Soft floodlight shadows (one per tower) plus a contact shadow. Drawn before any figure. */
export function drawShadows(ctx: CanvasRenderingContext2D, x: number, y: number, height = 1.75, alpha = 1) {
  const base = project(x, y, 0);
  ctx.save();
  ctx.globalAlpha = alpha;
  for (const [dx, dy] of SHADOW_DIRS) {
    const tip = project(x + dx * height * 0.8, y + dy * height * 0.8, 0);
    const mx = (base.x + tip.x) / 2;
    const my = (base.y + tip.y) / 2;
    const len = Math.hypot(tip.x - base.x, tip.y - base.y) / 2;
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.beginPath();
    ctx.ellipse(mx, my, Math.max(len, 1), Math.max(1, 0.17 * base.ppm), Math.atan2(tip.y - base.y, tip.x - base.x), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(base.x, base.y, Math.max(1.5, 0.34 * base.ppm), Math.max(0.8, 0.34 * base.ppm * (CAM.z / base.depth) * 1.3), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function capsule(ctx: CanvasRenderingContext2D, a: Screen, b: Screen, ra: number, rb: number, fill: string) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 0.001;
  const nx = -dy / len;
  const ny = dx / len;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(a.x + nx * ra, a.y + ny * ra);
  ctx.lineTo(b.x + nx * rb, b.y + ny * rb);
  ctx.lineTo(b.x - nx * rb, b.y - ny * rb);
  ctx.lineTo(a.x - nx * ra, a.y - ny * ra);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(a.x, a.y, ra, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(b.x, b.y, rb, 0, Math.PI * 2);
  ctx.fill();
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => clamp(Math.round(c + (amt > 0 ? (255 - c) * amt : c * amt)), 0, 255);
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

const mid = (a: V3, b: V3): V3 => v3lerp(a, b, 0.5);

/** Draw one player (or the umpire). */
export function drawFigure(ctx: CanvasRenderingContext2D, f: Figure) {
  const { w, bat } = toWorld(f);
  const S = {} as Record<Joint, Screen>;
  for (const j of JOINTS) S[j] = projectV(w[j]);
  const ppm = S.pelvis.ppm;
  const big = ppm > 30; // close enough for full detail
  const px = (m: number) => Math.max(0.7, m * ppm);
  const kit = f.kit;
  const isBat = f.gear === "bat";

  ctx.save();
  if (f.alpha !== undefined) ctx.globalAlpha = f.alpha;

  if (f.highlight) {
    const g = project(w.pelvis[0], w.pelvis[1], 0);
    ctx.strokeStyle = "rgba(253,224,71,0.95)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(g.x, g.y, 0.55 * g.ppm, 0.55 * g.ppm * (CAM.z / g.depth) * 1.3 + 1, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  type Part = { d: number; draw: () => void };
  const parts: Part[] = [];
  const depth = (...ps: V3[]) => ps.reduce((s, p) => s + p[1], 0) / ps.length - CAM.y;

  // Legs: trousers above the knee; pads (batsmen) or trousers below; white boots.
  for (const side of ["l", "r"] as const) {
    const hip = w[`${side}Hip`];
    const knee = w[`${side}Knee`];
    const ank = w[`${side}Ank`];
    const toe = w[`${side}Toe`];
    parts.push({
      d: depth(hip, knee) + 0.01,
      draw: () => capsule(ctx, S[`${side}Hip`], S[`${side}Knee`], px(0.085), px(0.068), kit.trousers),
    });
    parts.push({
      d: depth(knee, ank),
      draw: () => {
        if (isBat) {
          const top = projectV(add(knee, norm([hip[0] - knee[0], hip[1] - knee[1], hip[2] - knee[2]]), 0.13));
          capsule(ctx, top, S[`${side}Ank`], px(0.085), px(0.075), PAD);
          if (big) {
            // Vertical ridges and a strap in team colours.
            const a = top;
            const b = S[`${side}Ank`];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const l = Math.hypot(dx, dy) || 1;
            const nx = -dy / l;
            const ny = dx / l;
            ctx.strokeStyle = PAD_SHADE;
            ctx.lineWidth = Math.max(0.6, 0.012 * ppm);
            for (const o of [-0.035, 0, 0.035]) {
              ctx.beginPath();
              ctx.moveTo(a.x + nx * o * ppm, a.y + ny * o * ppm);
              ctx.lineTo(b.x + nx * o * ppm, b.y + ny * o * ppm);
              ctx.stroke();
            }
            ctx.strokeStyle = kit.trim;
            ctx.lineWidth = Math.max(0.8, 0.025 * ppm);
            const m = { x: a.x + dx * 0.55, y: a.y + dy * 0.55 };
            ctx.beginPath();
            ctx.moveTo(m.x + nx * 0.08 * ppm, m.y + ny * 0.08 * ppm);
            ctx.lineTo(m.x - nx * 0.08 * ppm, m.y - ny * 0.08 * ppm);
            ctx.stroke();
          }
        } else {
          capsule(ctx, S[`${side}Knee`], S[`${side}Ank`], px(0.065), px(0.05), kit.trousers);
        }
      },
    });
    parts.push({
      d: depth(ank, toe) - 0.01,
      draw: () => capsule(ctx, S[`${side}Ank`], S[`${side}Toe`], px(0.055), px(0.045), "#f3f4f6"),
    });
  }

  // Torso: shirt, with the trim, shading and (from behind) name and number.
  parts.push({
    d: depth(w.neck, w.pelvis),
    draw: () => {
      const quad = [S.lSho, S.rSho, S.rHip, S.lHip];
      ctx.fillStyle = kit.shirt;
      ctx.beginPath();
      quad.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.fill();
      capsule(ctx, S.neck, S.pelvis, px(0.15), px(0.13), kit.shirt);
      capsule(ctx, S.lSho, S.rSho, px(0.07), px(0.07), kit.shirt);

      if (big) {
        // Shade the torso away from the light.
        ctx.save();
        ctx.beginPath();
        quad.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.closePath();
        ctx.moveTo(S.neck.x + px(0.15), S.neck.y);
        ctx.arc(S.neck.x, S.neck.y, px(0.15), 0, Math.PI * 2);
        ctx.clip();
        const g = ctx.createLinearGradient(S.neck.x - px(0.3), S.neck.y, S.pelvis.x + px(0.3), S.pelvis.y);
        g.addColorStop(0, "rgba(255,255,255,0.16)");
        g.addColorStop(1, "rgba(0,0,0,0.28)");
        ctx.fillStyle = g;
        ctx.fillRect(Math.min(S.lSho.x, S.rSho.x, S.pelvis.x) - px(0.4), S.neck.y - px(0.3), px(1.4), px(0.9));
        ctx.restore();
      }
      // Shoulder piping and a side panel in the trim colour.
      ctx.strokeStyle = kit.trim;
      ctx.lineWidth = Math.max(0.7, 0.03 * ppm);
      ctx.beginPath();
      ctx.moveTo(S.lSho.x, S.lSho.y);
      ctx.lineTo(S.neck.x, S.neck.y - px(0.02));
      ctx.lineTo(S.rSho.x, S.rSho.y);
      ctx.stroke();
      if (big && f.name) backPrint(ctx, w, kit, f.name, f.number ?? 0);
    },
  });

  // Arms: sleeves, forearms, then gloves or hands.
  for (const side of ["l", "r"] as const) {
    const sho = w[`${side}Sho`];
    const elb = w[`${side}Elb`];
    const hand = w[`${side}Hand`];
    parts.push({
      d: depth(sho, elb),
      draw: () => {
        capsule(ctx, S[`${side}Sho`], S[`${side}Elb`], px(0.065), px(0.052), kit.shirt);
        if (big) capsule(ctx, S[`${side}Sho`], S[`${side}Elb`], px(0.025), px(0.02), shade(kit.shirt, 0.18));
      },
    });
    parts.push({
      d: depth(elb, hand) - 0.005,
      draw: () => {
        capsule(ctx, S[`${side}Elb`], S[`${side}Hand`], px(0.05), px(0.042), isBat ? kit.shirtDark : SKIN);
        if (isBat) {
          capsule(ctx, S[`${side}Hand`], S[`${side}Hand`], px(0.065), px(0.065), PAD);
          if (big) capsule(ctx, S[`${side}Hand`], S[`${side}Hand`], px(0.03), px(0.03), kit.trim);
        } else {
          capsule(ctx, S[`${side}Hand`], S[`${side}Hand`], px(0.045), px(0.045), SKIN);
        }
      },
    });
  }

  if (bat) {
    const [top, tip] = bat;
    parts.push({ d: depth(top, tip) - 0.02, draw: () => drawBat(ctx, top, tip, kit, big) });
  }

  if (f.ballInHand) {
    parts.push({
      d: depth(w.rHand) - 0.05,
      draw: () => {
        const p = S.rHand;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1.2, 0.05 * p.ppm), 0, Math.PI * 2);
        ctx.fill();
      },
    });
  }

  parts.push({ d: depth(w.head) - 0.02, draw: () => drawHead(ctx, f, w, S) });

  parts.sort((a, b) => b.d - a.d);
  for (const p of parts) p.draw();
  ctx.restore();
}

function drawBat(ctx: CanvasRenderingContext2D, top: V3, tip: V3, kit: Kit, big: boolean) {
  const shoulder = v3lerp(top, tip, 0.31); // where the handle meets the blade
  const a = projectV(shoulder);
  const b = projectV(tip);
  const h = projectV(top);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy) || 1;
  const nx = -dy / l;
  const ny = dx / l;
  const wa = Math.max(1, 0.054 * a.ppm);
  const wb = Math.max(1, 0.056 * b.ppm);

  // Handle with its rubber grip.
  capsule(ctx, h, a, Math.max(0.8, 0.02 * h.ppm), Math.max(0.8, 0.018 * a.ppm), kit.grip);

  // Blade.
  ctx.beginPath();
  ctx.moveTo(a.x + nx * wa * 0.8, a.y + ny * wa * 0.8);
  ctx.lineTo(b.x + nx * wb, b.y + ny * wb);
  ctx.lineTo(b.x - nx * wb, b.y - ny * wb);
  ctx.lineTo(a.x - nx * wa * 0.8, a.y - ny * wa * 0.8);
  ctx.closePath();
  const g = ctx.createLinearGradient(a.x + nx * wa, a.y + ny * wa, a.x - nx * wa, a.y - ny * wa);
  g.addColorStop(0, "#f3e2b6");
  g.addColorStop(0.55, "#e2c88f");
  g.addColorStop(1, "#b89662");
  ctx.fillStyle = g;
  ctx.fill();
  if (big) {
    ctx.strokeStyle = "rgba(90,60,25,0.55)";
    ctx.lineWidth = 0.8;
    ctx.stroke();
    // Maker's sticker band on the blade.
    const s0 = 0.35;
    const s1 = 0.62;
    const p0 = { x: a.x + dx * s0, y: a.y + dy * s0 };
    const p1 = { x: a.x + dx * s1, y: a.y + dy * s1 };
    const ws = (wa + wb) * 0.42;
    ctx.fillStyle = kit.sticker;
    ctx.beginPath();
    ctx.moveTo(p0.x + nx * ws, p0.y + ny * ws);
    ctx.lineTo(p1.x + nx * ws, p1.y + ny * ws);
    ctx.lineTo(p1.x - nx * ws, p1.y - ny * ws);
    ctx.lineTo(p0.x - nx * ws, p0.y - ny * ws);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    const pm = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
    ctx.beginPath();
    ctx.arc(pm.x, pm.y, ws * 0.45, 0, Math.PI * 2);
    ctx.fill();
    // Toe guard.
    ctx.strokeStyle = "#2b2b2b";
    ctx.lineWidth = Math.max(1, 0.02 * b.ppm);
    ctx.beginPath();
    ctx.moveTo(b.x + nx * wb, b.y + ny * wb);
    ctx.lineTo(b.x - nx * wb, b.y - ny * wb);
    ctx.stroke();
  }
}

function drawHead(ctx: CanvasRenderingContext2D, f: Figure, w: W, S: Record<Joint, Screen>) {
  const head = w.head;
  const c = S.head;
  const look = f.look ?? [head[0] + Math.cos(f.yaw), head[1] + Math.sin(f.yaw), head[2]];
  const face = norm([look[0] - head[0], look[1] - head[1], (look[2] - head[2]) * 0.3]);
  const toCam = norm([CAM.x - head[0], CAM.y - head[1], 0]);
  const away = face[0] * toCam[0] + face[1] * toCam[1] < 0;
  const fp = projectV(add(head, face, 0.12));
  const ox = fp.x - c.x;
  const oy = fp.y - c.y;
  const r = Math.max(1.4, 0.118 * c.ppm);

  if (f.gear === "bat") {
    const grille = () => {
      ctx.strokeStyle = "#9aa3ad";
      ctx.lineWidth = Math.max(0.6, 0.012 * c.ppm);
      for (const k of [0.15, 0.4, 0.65]) {
        const cx = c.x + ox * 1.05;
        const cy = c.y + oy * 1.05 + r * k;
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.75, cy);
        ctx.lineTo(cx + r * 0.75, cy);
        ctx.stroke();
      }
    };
    if (away) grille();
    // Shell with a glossy highlight.
    const g = ctx.createRadialGradient(c.x - r * 0.35, c.y - r * 0.45, r * 0.1, c.x, c.y, r * 1.1);
    g.addColorStop(0, shade(f.kit.helmet, 0.45));
    g.addColorStop(0.5, f.kit.helmet);
    g.addColorStop(1, shade(f.kit.helmet, -0.35));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.fill();
    // Peak over the eyes.
    ctx.fillStyle = shade(f.kit.helmet, -0.25);
    ctx.beginPath();
    ctx.ellipse(c.x + ox * 0.8, c.y + oy * 0.8 - r * 0.25, r * 0.78, r * 0.3, Math.atan2(oy, ox), 0, Math.PI * 2);
    ctx.fill();
    if (away) {
      // Neck guard at the back.
      ctx.fillStyle = shade(f.kit.helmet, -0.45);
      ctx.beginPath();
      ctx.ellipse(c.x - ox * 0.5, c.y - oy * 0.5 + r * 0.82, r * 0.55, r * 0.25, 0, 0, Math.PI * 2);
      ctx.fill();
      // A thin stripe in the trim colour over the crown.
      ctx.strokeStyle = f.kit.trim;
      ctx.lineWidth = Math.max(0.6, r * 0.12);
      ctx.beginPath();
      ctx.arc(c.x, c.y + r * 0.1, r * 0.82, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    } else {
      grille();
    }
    return;
  }

  // Face (skin), then cap or umpire's hat.
  ctx.fillStyle = SKIN;
  ctx.beginPath();
  ctx.arc(c.x, c.y, r * 0.92, 0, Math.PI * 2);
  ctx.fill();
  if (f.gear === "umpire") {
    ctx.fillStyle = "#f5f5f4";
    ctx.beginPath();
    ctx.ellipse(c.x, c.y - r * 0.55, r * 1.75, r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(c.x, c.y - r * 0.6, r * 0.85, Math.PI, 0);
    ctx.fill();
    return;
  }
  ctx.fillStyle = f.kit.cap;
  ctx.beginPath();
  ctx.arc(c.x, c.y - r * 0.15, r * 0.95, Math.PI * 1.02, Math.PI * 1.98);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(c.x + ox * 0.7, c.y + oy * 0.7 - r * 0.3, r * 0.7, r * 0.28, Math.atan2(oy, ox), 0, Math.PI * 2);
  ctx.fill();
}

/** Surname and shirt number across the back, when the back faces the camera. */
function backPrint(ctx: CanvasRenderingContext2D, w: W, kit: Kit, name: string, num: number) {
  const left = norm([w.lSho[0] - w.rSho[0], w.lSho[1] - w.rSho[1], 0]);
  const fwd: V3 = [left[1], -left[0], 0];
  const back: V3 = [-fwd[0], -fwd[1], 0];
  const centre = add(v3lerp(mid(w.lSho, w.rSho), mid(w.lHip, w.rHip), 0.42), back, 0.11);
  const toCam = norm([CAM.x - centre[0], CAM.y - centre[1], 0]);
  const facing = back[0] * toCam[0] + back[1] * toCam[1];
  if (facing < 0.25) return;

  const right: V3 = [-left[0], -left[1], 0];
  const down = norm([w.pelvis[0] - w.neck[0], w.pelvis[1] - w.neck[1], w.pelvis[2] - w.neck[2]]);
  const o = projectV(centre);
  const u = projectV(add(centre, right, 0.01));
  const v = projectV(add(centre, down, 0.01));
  ctx.save();
  ctx.globalAlpha *= clamp((facing - 0.25) / 0.25, 0, 1);
  ctx.transform(u.x - o.x, u.y - o.y, v.x - o.x, v.y - o.y, o.x, o.y); // 1 unit = 1 cm on the shirt
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.font = '800 7px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(name.toUpperCase(), 0, -12);
  ctx.font = '900 20px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(String(num), 0, 5);
  ctx.strokeStyle = kit.trim;
  ctx.lineWidth = 0.8;
  ctx.strokeText(String(num), 0, 5);
  ctx.restore();
}
