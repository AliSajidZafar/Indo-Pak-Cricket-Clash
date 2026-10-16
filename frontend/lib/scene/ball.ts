// Where the ball goes: the delivery (by line and length), what happens after
// the shot, plus drawing the ball and the stumps.

import type { BallResult, Delivery } from "@/types/match";
import { CAM, R, STRIKER_Y, type V3, clamp, fieldToWorld, inFront, lerp, project } from "./camera";

/** Where the striker meets the ball (just in front of the popping crease). */
export const CONTACT_Y = STRIKER_Y + 1.05;

// Normal deliveries come down the middle of the pitch; wides pass at the edges.
const LINE_X: Record<Delivery["line"], number> = {
  stumps: 0.0,
  off: 0.16,
  leg: -0.14,
  wide_off: 1.24,
  wide_leg: -1.24,
};
const ARRIVE_Z: Record<Delivery["length"], number> = { yorker: 0.12, full: 0.42, good: 0.72, short: 1.25 };
const BOUNCE_Y: Record<Delivery["length"], number | null> = {
  yorker: null,
  full: STRIKER_Y + 3.6,
  good: STRIKER_Y + 6.6,
  short: STRIKER_Y + 10.5,
};

export interface Incoming {
  at: (p: number) => V3; // p = 0 at release, 1 at the bat (can run past 1)
  arrive: V3;
}

export function incomingPath(d: Delivery, release: V3, spin: boolean): Incoming {
  const arrive: V3 = [LINE_X[d.line], CONTACT_Y, ARRIVE_Z[d.length]];
  const by = BOUNCE_Y[d.length];
  const pb = by === null ? 1 : clamp((release[1] - by) / (release[1] - arrive[1]), 0.05, 0.97);
  const loop = spin ? 1.5 : 0.3; // spinners flight it up and dip it
  const rise = arrive[2] * 0.9;

  const at = (p: number): V3 => {
    const x = lerp(release[0], arrive[0], p);
    const y = lerp(release[1], arrive[1], p);
    let z: number;
    if (p <= pb) {
      const u = p / pb;
      const endZ = by === null ? arrive[2] : 0;
      z = lerp(release[2], endZ, u) + loop * u * (1 - u);
    } else {
      const v = (p - pb) / (1 - pb);
      z = arrive[2] * v + rise * v * (1 - v);
      if (p > 1) z = Math.max(arrive[2] * 0.6, Math.min(1.4, arrive[2] + (p - 1) * 0.6));
    }
    return [x, y, Math.max(0.035, z)];
  };
  return { at, arrive };
}

// --- after the delivery -----------------------------------------------------------------

export interface Outgoing {
  at: (p: number) => V3;
  dur: number;
  hitStumpsAt: number | null; // p at which the ball breaks the wicket
  end: V3;
}

const STUMPS_HIT: V3 = [0.02, STRIKER_Y + 0.04, 0.32];

export function outgoingPath(res: BallResult, from: V3): Outgoing {
  const shot = res.shot;
  const hitsStumps = res.wicket?.kind === "bowled" || /hits the stumps/i.test(res.commentary);

  if (shot) {
    const t = fieldToWorld(shot.angle, shot.distance);
    const six = res.bat_runs === 6;
    const caught = res.wicket?.kind === "caught" || /caught/i.test(res.commentary);
    const dist = Math.hypot(t.x - from[0], t.y - from[1]);
    // Sixes land among the crowd, catches end in the fielder's hands.
    const endZ = six ? 1.2 + (Math.max(R + 7, shot.distance * R) - (R + 7)) * 0.6 : caught ? 1.75 : 0.04;
    const end: V3 = [t.x, t.y, endZ];
    const lofted = shot.lofted || six;
    const peak = six ? 24 + dist * 0.08 : lofted ? 6 + dist * 0.22 : 0;
    const dur = clamp(lofted ? 950 + dist * 13 : 520 + dist * 17, 700, 2100);
    const at = (p: number): V3 => {
      const h = lofted ? p : 1 - Math.pow(1 - p, 1.7); // ground shots slow down
      const x = lerp(from[0], end[0], h);
      const y = lerp(from[1], end[1], h);
      let z: number;
      if (lofted) {
        z = lerp(from[2], end[2], p) + peak * 4 * p * (1 - p);
      } else {
        // Skims along with a few shrinking bounces.
        const b = Math.abs(Math.sin(p * Math.PI * 3.2)) * 0.9 * Math.pow(1 - p, 2);
        z = lerp(from[2], 0.04, Math.min(1, p * 4)) + b;
      }
      return [x, y, Math.max(0.035, z)];
    };
    return { at, dur, hitStumpsAt: null, end };
  }

  if (hitsStumps) {
    const end: V3 = [0.6, STRIKER_Y - 2.6, 0.04];
    const at = (p: number): V3 => {
      if (p < 0.22) {
        const u = p / 0.22;
        return [lerp(from[0], STUMPS_HIT[0], u), lerp(from[1], STUMPS_HIT[1], u), lerp(from[2], STUMPS_HIT[2], u)];
      }
      const u = (p - 0.22) / 0.78;
      const e = 1 - Math.pow(1 - u, 2);
      return [lerp(STUMPS_HIT[0], end[0], e), lerp(STUMPS_HIT[1], end[1], e), Math.max(0.035, STUMPS_HIT[2] * (1 - u) + 0.25 * Math.sin(u * Math.PI))];
    };
    return { at, dur: 1100, hitStumpsAt: 0.22, end };
  }

  // Nothing off the bat: through to the (hidden) keeper, past the stumps.
  let end: V3;
  if (res.extra_type === "leg_bye") end = [-9, STRIKER_Y - 1.5, 0.04];
  else if (res.extra_type === "bye") end = [2.2, STRIKER_Y - 12, 0.3];
  else {
    const x = Math.abs(from[0]) < 0.25 ? from[0] + (from[0] >= 0 ? 0.2 : -0.2) : from[0];
    end = [x, STRIKER_Y - 3.4, Math.max(0.95, from[2])];
  }
  const dur = res.extra_type === "leg_bye" ? 1000 : 650;
  const at = (p: number): V3 => {
    const z = lerp(from[2], end[2], p) + (res.extra_type === "leg_bye" ? 0.4 * Math.sin(p * Math.PI) : 0.15 * Math.sin(p * Math.PI));
    return [lerp(from[0], end[0], p), lerp(from[1], end[1], p), z];
  };
  return { at, dur, hitStumpsAt: null, end };
}

// --- drawing -------------------------------------------------------------------------------

export function drawBallShadow(ctx: CanvasRenderingContext2D, p: V3) {
  if (!inFront(p[1], 1.2)) return;
  const g = project(p[0], p[1], 0);
  const r = Math.max(1.6, 0.07 * g.ppm) * clamp(1.4 - p[2] * 0.05, 0.4, 1.4);
  ctx.fillStyle = `rgba(0,0,0,${clamp(0.38 - p[2] * 0.012, 0.08, 0.38)})`;
  ctx.beginPath();
  ctx.ellipse(g.x, g.y, r, r * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
}

export function drawBall(ctx: CanvasRenderingContext2D, p: V3, trail: { x: number; y: number }[]) {
  if (!inFront(p[1], 1.2)) return;
  const s = project(p[0], p[1], p[2]);
  const r = Math.max(2.4, 0.075 * s.ppm); // drawn larger than life so it reads on screen

  for (let i = 0; i < trail.length; i++) {
    const t = trail[i];
    const k = (i + 1) / (trail.length + 1);
    ctx.fillStyle = `rgba(255,255,255,${0.22 * k})`;
    ctx.beginPath();
    ctx.arc(t.x, t.y, r * (0.45 + 0.5 * k), 0, Math.PI * 2);
    ctx.fill();
  }
  const g = ctx.createRadialGradient(s.x - r * 0.35, s.y - r * 0.35, r * 0.1, s.x, s.y, r);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.7, "#f1f1ee");
  g.addColorStop(1, "#b9bcc4");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
  ctx.fill();
  if (r > 3.5) {
    ctx.strokeStyle = "rgba(140,140,150,0.8)";
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r * 0.7, -0.9, 1.2);
    ctx.stroke();
  }
}

export interface StumpsState {
  hitAt: number | null;
}

const STUMP_X = [-0.105, 0, 0.105];
const STUMP_H = 0.711;

/** Three stumps and two bails; when hit, the LED bails flash red and fly off. */
export function drawStumps(ctx: CanvasRenderingContext2D, y: number, state: StumpsState | null, now: number) {
  const since = state?.hitAt != null ? (now - state.hitAt) / 1000 : -1;
  const hit = since >= 0;
  const flash = hit && since < 1.6 && Math.floor(since * 8) % 2 === 0;

  for (let i = 0; i < 3; i++) {
    const x = STUMP_X[i];
    // The struck stumps rock back toward the keeper.
    const tilt = hit ? Math.min(1, since / 0.12) * (i === 1 ? 0.42 : i === 2 ? 0.24 : 0.1) : 0;
    const base = project(x, y, 0);
    const top = project(x + tilt * 0.08 * (i - 1), y - Math.sin(tilt) * STUMP_H, Math.cos(tilt) * STUMP_H);
    const w = Math.max(1.2, 0.038 * base.ppm);
    ctx.lineCap = "round";
    ctx.strokeStyle = flash ? "#ff4d3a" : "#f3efe3";
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(base.x, base.y);
    ctx.lineTo(top.x, top.y);
    ctx.stroke();
    if (w > 2) {
      ctx.strokeStyle = "rgba(0,0,0,0.18)";
      ctx.lineWidth = w * 0.35;
      ctx.beginPath();
      ctx.moveTo(base.x + w * 0.3, base.y);
      ctx.lineTo(top.x + w * 0.3, top.y);
      ctx.stroke();
    }
  }
  if (flash) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const c = project(0, y, 0.6);
    const glow = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, 0.9 * c.ppm);
    glow.addColorStop(0, "rgba(255,80,50,0.55)");
    glow.addColorStop(1, "rgba(255,80,50,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(c.x - c.ppm, c.y - c.ppm, 2 * c.ppm, 2 * c.ppm);
    ctx.restore();
  }

  // Bails: sitting on top, or flying.
  for (let i = 0; i < 2; i++) {
    const cx = (STUMP_X[i] + STUMP_X[i + 1]) / 2;
    let a: V3;
    let b: V3;
    if (!hit) {
      a = [cx - 0.052, y, STUMP_H + 0.012];
      b = [cx + 0.052, y, STUMP_H + 0.012];
    } else {
      const t = Math.min(since, 1.2);
      const vx = i === 0 ? -1.4 : 1.7;
      const pos: V3 = [cx + vx * t, y - 2.6 * t, Math.max(0.02, STUMP_H + 3.4 * t - 4.9 * t * t)];
      const spin = t * (i === 0 ? 14 : -17);
      a = [pos[0] - 0.052 * Math.cos(spin), pos[1], pos[2] - 0.052 * Math.sin(spin)];
      b = [pos[0] + 0.052 * Math.cos(spin), pos[1], pos[2] + 0.052 * Math.sin(spin)];
    }
    if (!inFront(a[1], 1.2)) continue;
    const pa = project(...a);
    const pb = project(...b);
    ctx.strokeStyle = flash || (hit && since < 0.3) ? "#ff5a3c" : "#f6d365";
    ctx.lineWidth = Math.max(1, 0.025 * pa.ppm);
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
  }
}

/** Depth used to order the stumps among the players. */
export const stumpsDepth = (y: number) => y - CAM.y;
