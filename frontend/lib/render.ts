// Pseudo-3D renderer for the ground, seen from behind the striker.
// Everything is drawn at a fixed design resolution and scaled by CSS.

import type { TeamCode } from "@/types/match";

export const DESIGN_W = 960;
export const DESIGN_H = 600;

// World units are roughly metres. The pitch runs along +y, away from the camera.
const R = 72; // boundary radius
const STRIKER_Y = -9; // near stumps
const BOWLER_Y = 9; // far stumps
const CAM_BACK = 15; // camera sits this far behind the striker
const CAM_H = 7.5; // camera height
const FOCAL = 560;
const HORIZON = 0.3 * DESIGN_H;
const CAM_Y = STRIKER_Y - CAM_BACK;

const CX = DESIGN_W / 2;

// Timing windows (ms), mirroring backend/app/engine.py. graceLate is how long
// after the perfect moment the ball waits before it counts as unplayed.
export const TIMING = {
  perfect: 70,
  good: 140,
  mistimed: 215,
  edge: 290,
  graceLate: 320,
};

export interface Pt {
  x: number;
  y: number;
}

export interface Screen {
  x: number;
  y: number;
  scale: number; // perspective scale, 1 at the striker's feet
}

const NEAR_DEPTH = STRIKER_Y - CAM_Y;

/** Project a point on the ground (world x sideways, y downfield) to the screen. */
export function project(x: number, y: number): Screen {
  const depth = y - CAM_Y;
  return {
    x: CX + (FOCAL * x) / depth,
    y: HORIZON + (FOCAL * CAM_H) / depth,
    scale: NEAR_DEPTH / depth,
  };
}

/** A field position (angle in degrees, distance as a fraction of R) to world xy. */
export function fieldToWorld(angleDeg: number, distance: number): Pt {
  const a = (angleDeg * Math.PI) / 180;
  return { x: distance * R * Math.sin(a), y: distance * R * Math.cos(a) };
}

const TEAM_COLORS: Record<TeamCode, { shirt: string; trim: string }> = {
  IND: { shirt: "#1d4ed8", trim: "#f59e0b" },
  PAK: { shirt: "#15803d", trim: "#e5e7eb" },
};

// --- scenery -----------------------------------------------------------------

export function drawSky(ctx: CanvasRenderingContext2D) {
  const sky = ctx.createLinearGradient(0, 0, 0, HORIZON + 30);
  sky.addColorStop(0, "#0b1026");
  sky.addColorStop(0.6, "#141e4a");
  sky.addColorStop(1, "#24347a");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, DESIGN_W, HORIZON + 30);
}

export function drawStands(ctx: CanvasRenderingContext2D) {
  // Tiered bowl of stands sitting on the horizon, packed with a crowd.
  const top = HORIZON - 96;
  ctx.fillStyle = "#1b2140";
  ctx.beginPath();
  ctx.moveTo(0, HORIZON + 8);
  ctx.lineTo(0, top + 40);
  ctx.quadraticCurveTo(CX, top - 46, DESIGN_W, top + 40);
  ctx.lineTo(DESIGN_W, HORIZON + 8);
  ctx.closePath();
  ctx.fill();

  // Crowd: thousands of tiny coloured dots.
  const dotColors = ["#f87171", "#fbbf24", "#34d399", "#60a5fa", "#e5e7eb", "#f472b6"];
  let seed = 1337;
  const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < 1400; i++) {
    const tx = rand();
    const band = top - 40 + rand() * 130;
    const arc = Math.sin(tx * Math.PI) * 44;
    const y = band - arc;
    if (y > HORIZON + 4) continue;
    ctx.fillStyle = dotColors[(rand() * dotColors.length) | 0];
    ctx.fillRect(tx * DESIGN_W, y, 3, 3);
  }

  // Floodlight towers.
  for (const fx of [70, DESIGN_W - 70]) {
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(fx, HORIZON - 40);
    ctx.lineTo(fx, top - 70);
    ctx.stroke();
    ctx.fillStyle = "#cbd5e1";
    ctx.fillRect(fx - 26, top - 92, 52, 26);
    ctx.fillStyle = "#fde68a";
    for (let r = 0; r < 2; r++)
      for (let c = 0; c < 4; c++) ctx.fillRect(fx - 23 + c * 12, top - 88 + r * 12, 8, 8);
  }
}

export function drawGround(ctx: CanvasRenderingContext2D) {
  // The outfield as a big ellipse, with mowing stripes and a boundary rope.
  const far = project(0, R);
  const near = project(0, STRIKER_Y - 6);
  const left = project(-R, 2);
  const right = project(R, 2);
  const cx = (left.x + right.x) / 2;
  const cyMid = (far.y + near.y) / 2;
  const rx = (right.x - left.x) / 2;
  const ry = (near.y - far.y) / 2;

  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = i % 2 === 0 ? "#2e7d32" : "#276e2b";
    ctx.beginPath();
    ctx.ellipse(cx, cyMid, rx * (1 - i / 11), ry * (1 - i / 11), 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = "#f8fafc";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(cx, cyMid, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  // 30-yard inner circle.
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.ellipse(cx, cyMid, rx * 0.46, ry * 0.52, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
}

export function drawPitch(ctx: CanvasRenderingContext2D) {
  const w = 2.0;
  const corners = [
    project(-w, BOWLER_Y + 2),
    project(w, BOWLER_Y + 2),
    project(w, STRIKER_Y - 2),
    project(-w, STRIKER_Y - 2),
  ];
  ctx.fillStyle = "#c2a878";
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  corners.slice(1).forEach((c) => ctx.lineTo(c.x, c.y));
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 2;
  for (const cy of [STRIKER_Y, BOWLER_Y]) {
    const a = project(-w, cy);
    const b = project(w, cy);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}

function drawStumps(ctx: CanvasRenderingContext2D, worldY: number) {
  const base = project(0, worldY);
  const h = 26 * base.scale;
  const spread = 7 * base.scale;
  ctx.strokeStyle = "#f5f5f4";
  ctx.lineWidth = Math.max(1.5, 3 * base.scale);
  for (const dx of [-spread, 0, spread]) {
    ctx.beginPath();
    ctx.moveTo(base.x + dx, base.y);
    ctx.lineTo(base.x + dx, base.y - h);
    ctx.stroke();
  }
}

// --- figures -----------------------------------------------------------------

function figure(
  ctx: CanvasRenderingContext2D,
  s: Screen,
  team: TeamCode,
  opts: { back?: boolean; bat?: boolean; height?: number } = {},
) {
  const { shirt, trim } = TEAM_COLORS[team];
  const h = (opts.height ?? 34) * s.scale;
  const w = h * 0.32;
  const headR = h * 0.17;
  const { x } = s;
  const feet = s.y;
  const hip = feet - h * 0.42;
  const shoulder = feet - h * 0.78;
  const headC = shoulder - headR * 0.8;

  // shadow
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(x, feet + 1, w * 1.1, h * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();

  // legs
  ctx.strokeStyle = opts.back ? "#e5e7eb" : "#1f2937";
  ctx.lineWidth = Math.max(2, w * 0.5);
  ctx.beginPath();
  ctx.moveTo(x, hip);
  ctx.lineTo(x - w * 0.5, feet);
  ctx.moveTo(x, hip);
  ctx.lineTo(x + w * 0.5, feet);
  ctx.stroke();

  // torso
  ctx.strokeStyle = shirt;
  ctx.lineWidth = Math.max(3, w);
  ctx.beginPath();
  ctx.moveTo(x, hip);
  ctx.lineTo(x, shoulder);
  ctx.stroke();

  // arms
  ctx.lineWidth = Math.max(2, w * 0.55);
  if (opts.bat) {
    ctx.beginPath();
    ctx.moveTo(x, shoulder + h * 0.05);
    ctx.lineTo(x + w * 0.9, shoulder + h * 0.2);
    ctx.stroke();
    // bat
    ctx.strokeStyle = trim;
    ctx.lineWidth = Math.max(2, w * 0.7);
    ctx.beginPath();
    ctx.moveTo(x + w * 0.9, shoulder + h * 0.2);
    ctx.lineTo(x + w * 1.1, feet - h * 0.02);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(x - w * 0.7, shoulder + h * 0.22);
    ctx.lineTo(x, shoulder + h * 0.05);
    ctx.lineTo(x + w * 0.7, shoulder + h * 0.22);
    ctx.stroke();
  }

  // head (helmet)
  ctx.fillStyle = shirt;
  ctx.beginPath();
  ctx.arc(x, headC, headR, 0, Math.PI * 2);
  ctx.fill();
  if (!opts.back) {
    ctx.fillStyle = "#f1c9a5";
    ctx.beginPath();
    ctx.arc(x, headC + headR * 0.15, headR * 0.72, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawStriker(ctx: CanvasRenderingContext2D, team: TeamCode) {
  drawStumps(ctx, STRIKER_Y);
  // Slightly to the leg side of the stumps, big in the foreground, back to us.
  figure(ctx, project(-2.4, STRIKER_Y - 1), team, { back: true, bat: true, height: 54 });
}

export function drawNonStriker(ctx: CanvasRenderingContext2D, team: TeamCode) {
  figure(ctx, project(2.6, BOWLER_Y - 2), team, { bat: true, height: 34 });
}

export function drawBowler(ctx: CanvasRenderingContext2D, team: TeamCode) {
  drawStumps(ctx, BOWLER_Y);
  figure(ctx, project(-1.4, BOWLER_Y + 2), team, { height: 32 });
}

export interface FielderDot {
  world: Pt;
  name: string;
  active: boolean;
}

export function drawFielder(ctx: CanvasRenderingContext2D, f: FielderDot, team: TeamCode) {
  const s = project(f.world.x, f.world.y);
  figure(ctx, s, team, { height: 30 });
  if (f.active) {
    ctx.strokeStyle = "#fde047";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(s.x, s.y + 1, 16 * s.scale, 6 * s.scale, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

export function drawBall(ctx: CanvasRenderingContext2D, worldX: number, worldY: number, lift = 0) {
  const s = project(worldX, worldY);
  const r = Math.max(2.5, 7 * s.scale);
  const y = s.y - lift * s.scale;
  // shadow on the ground
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(s.x, s.y, r * 0.9, r * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#e11d48";
  ctx.beginPath();
  ctx.arc(s.x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(s.x, y, r, -0.5, 0.9);
  ctx.stroke();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/**
 * The batting timing meter. A marker sweeps left→right as the ball travels;
 * the coloured bands (centred on the perfect moment) show the hit windows.
 * Press when the marker reaches the green.
 *
 * @param progress ball flight progress, 0 at release, 1 at the bat (may exceed 1)
 * @param flightMs total flight time in ms
 * @param swungTimingMs if the player has swung, their timing error (freezes the marker)
 */
export function drawTimingMeter(
  ctx: CanvasRenderingContext2D,
  progress: number,
  flightMs: number,
  swungTimingMs: number | null,
) {
  const W = 540;
  const H = 22;
  const x0 = (DESIGN_W - W) / 2;
  const y0 = DESIGN_H - 50;
  const span = flightMs + TIMING.graceLate;
  const fracOf = (timing: number) => (timing + flightMs) / span;
  const px = (timing: number) => x0 + Math.max(0, Math.min(1, fracOf(timing))) * W;

  ctx.fillStyle = "rgba(2,6,23,0.75)";
  roundRect(ctx, x0 - 8, y0 - 8, W + 16, H + 16, 10);
  ctx.fill();

  const band = (win: number, color: string) => {
    const a = px(-win);
    const b = px(win);
    ctx.fillStyle = color;
    roundRect(ctx, a, y0, b - a, H, 4);
    ctx.fill();
  };
  band(TIMING.edge, "#92400e"); // amber-800 — edge (may be caught)
  band(TIMING.mistimed, "#b45309"); // amber-700
  band(TIMING.good, "#4d7c0f"); // lime-700
  band(TIMING.perfect, "#22c55e"); // green-500 — middle it

  const markerTiming = swungTimingMs ?? (progress - 1) * flightMs;
  const mx = px(markerTiming);
  ctx.fillStyle = swungTimingMs === null ? "#ffffff" : "#f472b6";
  ctx.fillRect(mx - 1.5, y0 - 5, 3, H + 10);
  ctx.beginPath();
  ctx.moveTo(mx - 7, y0 - 12);
  ctx.lineTo(mx + 7, y0 - 12);
  ctx.lineTo(mx, y0 - 3);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = "600 15px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Press SPACE as the marker hits the green", DESIGN_W / 2, y0 - 18);
  ctx.textAlign = "left";
}

export const WORLD = { R, STRIKER_Y, BOWLER_Y };
