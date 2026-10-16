// The static part of the stadium: sky, floodlights, stands and crowd, the
// sponsor cushion, the outfield and the pitch. It never changes during a match,
// so it is painted once into an offscreen canvas and copied every frame.

import { BRANDS, type Brand, brandText } from "./brands";
import {
  BOWLER_Y,
  CAM,
  CREASE,
  DESIGN_H,
  DESIGN_W,
  HORIZON,
  PITCH_HALF_W,
  R,
  STRIKER_Y,
  type V3,
  project,
  projectV,
  ring,
  seeded,
} from "./camera";

type Ctx = CanvasRenderingContext2D;
type P2 = { x: number; y: number };

const CX = DESIGN_W / 2;
const TH = 86; // we only ever see the half of the bowl in front of the camera

// --- small drawing helpers -----------------------------------------------------

function path(ctx: Ctx, pts: P2[]) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
}

function fillQuad(ctx: Ctx, a: V3, b: V3, c: V3, d: V3, fill: string | CanvasGradient) {
  path(ctx, [a, b, c, d].map(projectV));
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Map a local w×h box onto the parallelogram tl/tr/bl, to draw text "on" a surface. */
function onSurface(ctx: Ctx, tl: P2, tr: P2, bl: P2, w: number, h: number) {
  ctx.transform((tr.x - tl.x) / w, (tr.y - tl.y) / w, (bl.x - tl.x) / h, (bl.y - tl.y) / h, tl.x, tl.y);
}

/** Sample a ring of the bowl as screen points, left to right. */
function arc(radius: number, z: number, from = -TH, to = TH, step = 1): P2[] {
  const pts: P2[] = [];
  for (let t = from; t <= to + 1e-6; t += step) pts.push(projectV(ring(radius, t, z)));
  return pts;
}

// --- geometry of the bowl -------------------------------------------------------

const TIERS = 16;
const UPPER_FROM = 8; // tiers from here up form the upper deck, set back behind a fascia
function tierR(k: number) {
  return R + 7 + k * 1.85 + (k >= UPPER_FROM ? 3 : 0);
}
function tierZ(k: number) {
  return 1.2 + k * 1.12 + (k >= UPPER_FROM ? 2.6 : 0);
}
const RIBBON = { r: tierR(UPPER_FROM) - 1.4, z0: tierZ(UPPER_FROM - 1) + 0.75, z1: tierZ(UPPER_FROM) - 0.45 };
const ROOF = { r0: tierR(TIERS - 1) + 0.8, z0: tierZ(TIERS - 1) + 2.0, r1: tierR(TIERS - 1) + 6.5, z1: tierZ(TIERS - 1) + 4.4 };

export const TOWER = { r: R + 60, headZ: 35.5, thetas: [-36, 36] };

/** Where the big screen hangs (its content is drawn live by the HUD). */
export const BIG_SCREEN = { r: tierR(UPPER_FROM) + 5, theta0: -21, theta1: -9, z0: 15.2, z1: 21.6 };

/** Screen positions of fans, for the live camera-flash sparkle. */
export const crowdSpots: P2[] = [];

// --- sky ------------------------------------------------------------------------

function paintSky(ctx: Ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, HORIZON + 40);
  g.addColorStop(0, "#03061a");
  g.addColorStop(0.55, "#0a1238");
  g.addColorStop(1, "#1b2862");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);

  const rand = seeded(11);
  for (let i = 0; i < 110; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.12 + rand() * 0.55})`;
    const s = rand() < 0.12 ? 1.6 : 1;
    ctx.fillRect(rand() * DESIGN_W, rand() * (HORIZON - 70), s, s);
  }

  // The bowl's floodlit haze rising into the night.
  const haze = ctx.createRadialGradient(CX, HORIZON + 10, 30, CX, HORIZON + 10, 640);
  haze.addColorStop(0, "rgba(150,180,255,0.30)");
  haze.addColorStop(0.5, "rgba(110,140,240,0.10)");
  haze.addColorStop(1, "rgba(110,140,240,0)");
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, DESIGN_W, HORIZON + 60);
}

// --- floodlights ------------------------------------------------------------------

function towerGeom(theta: number) {
  const [bx, by] = ring(TOWER.r, theta);
  return { bx, by, z: TOWER.headZ, hw: 5.6, hh: 2.4 };
}

function paintTower(ctx: Ctx, theta: number) {
  const { bx, by, z, hw, hh } = towerGeom(theta);
  const legBase = 2.6;
  const legTop = 1.1;
  const top = z - hh - 0.4;
  const steel = "#5f6b85";

  // Two tapering legs with cross-bracing — a proper lattice mast.
  const L = (t: number, side: -1 | 1, zz: number) => project(bx + side * (legBase + (legTop - legBase) * t), by, zz);
  ctx.strokeStyle = steel;
  ctx.lineCap = "round";
  for (const side of [-1, 1] as const) {
    const a = L(0, side, 6);
    const b = L(1, side, top);
    ctx.lineWidth = Math.max(1.4, 0.55 * b.ppm);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = "rgba(160,172,198,0.75)";
  const steps = 9;
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps;
    const t1 = (i + 1) / steps;
    const z0 = 6 + (top - 6) * t0;
    const z1 = 6 + (top - 6) * t1;
    const a = L(t0, -1, z0);
    const b = L(t1, 1, z1);
    const c = L(t0, 1, z0);
    const d = L(t1, -1, z1);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(c.x, c.y);
    ctx.stroke();
  }

  // Head frame with a grid of lamps, tilted slightly down toward the field.
  const tl = project(bx - hw, by, z + hh);
  const tr = project(bx + hw, by, z + hh);
  const br = project(bx + hw, by - 0.8, z - hh);
  const bl = project(bx - hw, by - 0.8, z - hh);
  path(ctx, [tl, tr, br, bl]);
  ctx.fillStyle = "#1a2030";
  ctx.fill();
  ctx.strokeStyle = "#8590a8";
  ctx.lineWidth = 1;
  ctx.stroke();

  const rows = 4;
  const cols = 8;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const u = (c + 0.5) / cols;
      const v = (r + 0.5) / rows;
      const top2 = { x: tl.x + (tr.x - tl.x) * u, y: tl.y + (tr.y - tl.y) * u };
      const bot2 = { x: bl.x + (br.x - bl.x) * u, y: bl.y + (br.y - bl.y) * u };
      const x = top2.x + (bot2.x - top2.x) * v;
      const y = top2.y + (bot2.y - top2.y) * v;
      const rad = Math.max(1.3, 0.5 * tl.ppm);
      ctx.fillStyle = "#fffdf2";
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function paintTowerGlow(ctx: Ctx, theta: number) {
  const { bx, by, z } = towerGeom(theta);
  const c = project(bx, by, z);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  // Soft beams falling onto the field.
  const target = project(0, 4, 0);
  const beam = ctx.createLinearGradient(c.x, c.y, target.x, target.y);
  beam.addColorStop(0, "rgba(255,246,220,0.10)");
  beam.addColorStop(1, "rgba(255,246,220,0)");
  ctx.fillStyle = beam;
  ctx.beginPath();
  ctx.moveTo(c.x - 22, c.y);
  ctx.lineTo(c.x + 22, c.y);
  ctx.lineTo(target.x + (c.x < CX ? 260 : -40), target.y);
  ctx.lineTo(target.x + (c.x < CX ? 40 : -260), target.y);
  ctx.closePath();
  ctx.fill();

  const halo = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, 230);
  halo.addColorStop(0, "rgba(190,210,255,0.22)");
  halo.addColorStop(1, "rgba(190,210,255,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(c.x - 230, c.y - 230, 460, 460);

  const core = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, 62);
  core.addColorStop(0, "rgba(255,252,235,0.95)");
  core.addColorStop(0.35, "rgba(255,244,210,0.45)");
  core.addColorStop(1, "rgba(255,240,200,0)");
  ctx.fillStyle = core;
  ctx.fillRect(c.x - 62, c.y - 62, 124, 124);
  ctx.restore();
}

// --- stands and crowd -------------------------------------------------------------

const FANS = {
  IND: ["#1f5fff", "#2563eb", "#ff9933", "#ffffff", "#1e3a8a"],
  PAK: ["#0f9d58", "#15803d", "#ffffff", "#01411c", "#86efac"],
  ANY: ["#e5e7eb", "#f87171", "#fbbf24", "#94a3b8", "#f472b6"],
};
const SKIN = ["#8d5a3b", "#a86b45", "#c08055", "#6f4630"];

function paintIndiaFlag(ctx: Ctx, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = "#ff9933";
  ctx.fillRect(x, y, w, h / 3);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, y + h / 3, w, h / 3);
  ctx.fillStyle = "#138808";
  ctx.fillRect(x, y + (2 * h) / 3, w, h / 3);
}

function paintPakistanFlag(ctx: Ctx, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, y, w / 4, h);
  ctx.fillStyle = "#01411c";
  ctx.fillRect(x + w / 4, y, (3 * w) / 4, h);
  if (w > 5) {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(x + w * 0.62, y + h / 2, h * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#01411c";
    ctx.beginPath();
    ctx.arc(x + w * 0.67, y + h * 0.45, h * 0.24, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintStands(ctx: Ctx) {
  crowdSpots.length = 0;
  const rand = seeded(2024);
  const topK = TIERS - 1;

  // The concrete bowl itself.
  const shell = ctx.createLinearGradient(0, 40, 0, HORIZON + 40);
  shell.addColorStop(0, "#0e1430");
  shell.addColorStop(1, "#1a2246");
  path(ctx, [...arc(ROOF.r0, ROOF.z0), ...arc(R + 2, 0).reverse()]);
  ctx.fillStyle = shell;
  ctx.fill();

  for (let k = topK; k >= 0; k--) {
    const r = tierR(k);
    const z = tierZ(k);

    // Step riser along the front of this row.
    path(ctx, [...arc(r, z), ...arc(r - 0.6, z - 0.5).reverse()]);
    ctx.fillStyle = k % 2 ? "#232b52" : "#28315c";
    ctx.fill();

    const step = (0.56 / r) * (180 / Math.PI);
    for (let t = -TH; t <= TH; t += step) {
      const inAisle = (((t + 7) % 14) + 14) % 14 < 0.7;
      const p = projectV(ring(r + 0.35, t, z));
      if (p.x < -12 || p.x > DESIGN_W + 12) continue;
      const w = 0.44 * p.ppm;
      const h = 0.62 * p.ppm;
      if (inAisle) {
        ctx.fillStyle = "#39436e";
        ctx.fillRect(p.x - w / 2, p.y - h * 0.5, w, h * 0.5);
        continue;
      }
      if (rand() < 0.07) {
        ctx.fillStyle = "#2b3a7a"; // an empty seat
        ctx.fillRect(p.x - w / 2, p.y - h * 0.45, w, h * 0.45);
        continue;
      }
      // Indian fans gather on the left, Pakistani fans on the right — mixed at the seams.
      const lean = t < 0 ? "IND" : "PAK";
      const roll = rand();
      const pal = roll < 0.62 ? FANS[lean] : roll < 0.84 ? FANS[lean === "IND" ? "PAK" : "IND"] : FANS.ANY;
      ctx.fillStyle = pal[(rand() * pal.length) | 0];
      ctx.fillRect(p.x - w / 2, p.y - h * 0.78, w, h * 0.78);
      ctx.fillStyle = SKIN[(rand() * SKIN.length) | 0];
      const hr = Math.max(0.6, 0.12 * p.ppm);
      ctx.fillRect(p.x - hr, p.y - h * 0.78 - hr * 1.6, hr * 2, hr * 2);
      if (rand() < 0.35) crowdSpots.push({ x: p.x, y: p.y - h * 0.6 });

      if (rand() < 0.014) {
        const fw = 1.1 * p.ppm;
        const fh = 0.72 * p.ppm;
        const fy = p.y - h - fh - 0.2 * p.ppm;
        (lean === "IND" ? paintIndiaFlag : paintPakistanFlag)(ctx, p.x - fw / 2, fy, fw, fh);
      }
    }

    // LED ribbon board on the fascia between the two decks.
    if (k === UPPER_FROM) paintRibbon(ctx);
  }

  // Roof canopy with a lit fascia.
  path(ctx, [...arc(ROOF.r1, ROOF.z1), ...arc(ROOF.r0, ROOF.z0).reverse()]);
  ctx.fillStyle = "#070a18";
  ctx.fill();
  ctx.strokeStyle = "rgba(200,215,255,0.35)";
  ctx.lineWidth = 1;
  const edge = arc(ROOF.r0, ROOF.z0);
  ctx.beginPath();
  edge.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.stroke();
  for (let t = -TH; t <= TH; t += 3.2) {
    const p = projectV(ring(ROOF.r0 + 0.5, t, ROOF.z0 + 0.3));
    ctx.fillStyle = "rgba(255,250,230,0.85)";
    ctx.fillRect(p.x - 0.8, p.y - 0.8, 1.6, 1.6);
  }
}

function paintRibbon(ctx: Ctx) {
  const span = 9; // degrees per sponsor panel
  for (let t = -TH, i = 3; t < TH; t += span, i++) {
    const brand = BRANDS[i % BRANDS.length];
    const tl = projectV(ring(RIBBON.r, t, RIBBON.z1));
    const tr = projectV(ring(RIBBON.r, t + span, RIBBON.z1));
    const br = projectV(ring(RIBBON.r, t + span, RIBBON.z0));
    const bl = projectV(ring(RIBBON.r, t, RIBBON.z0));
    if (tr.x < -40 || tl.x > DESIGN_W + 40) continue;
    path(ctx, [tl, tr, br, bl]);
    ctx.fillStyle = "#05060c";
    ctx.fill();
    ctx.save();
    onSurface(ctx, tl, tr, bl, 300, 60);
    ctx.fillStyle = brand.bg === "#ffffff" ? "#1b1b1b" : brand.bg;
    ctx.globalAlpha = 0.9;
    ctx.fillRect(6, 6, 288, 48);
    ctx.globalAlpha = 1;
    ctx.shadowColor = brand.fg;
    ctx.shadowBlur = 8;
    wordmark(ctx, brand, 150, 32, 270, 34);
    ctx.restore();
  }
}

// --- sponsor lettering ------------------------------------------------------------

function wordmark(ctx: Ctx, brand: Brand, cx: number, cy: number, maxW: number, size: number) {
  const text = brandText(brand);
  ctx.font = `${brand.italic ? "italic " : ""}900 ${size}px "Arial Black", "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const w = ctx.measureText(text).width;
  ctx.save();
  if (w > maxW) {
    ctx.translate(cx, cy);
    ctx.scale(maxW / w, 1);
    ctx.translate(-cx, -cy);
  }
  ctx.fillStyle = brand.fg;
  ctx.fillText(text, cx, cy);
  ctx.restore();
}

// --- sight screen, ground, cushion, pitch --------------------------------------------

function paintSightScreen(ctx: Ctx) {
  // Black sight screen behind the bowler, so the white ball stands out.
  const r = R + 3.5;
  const a = ring(r, -5.2, 0);
  const b = ring(r, 5.2, 0);
  const tl = projectV([a[0], a[1], 6.2]);
  const tr = projectV([b[0], b[1], 6.2]);
  const br = projectV(b);
  const bl = projectV(a);
  path(ctx, [tl, tr, br, bl]);
  const g = ctx.createLinearGradient(0, tl.y, 0, bl.y);
  g.addColorStop(0, "#15171f");
  g.addColorStop(1, "#06070b");
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = "#3b4256";
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

function groundOutline(ctx: Ctx) {
  const edge = arc(R + 4, 0, -89, 89);
  path(ctx, [...edge, { x: DESIGN_W + 4000, y: DESIGN_H + 4000 }, { x: -4000, y: DESIGN_H + 4000 }]);
}

function paintGround(ctx: Ctx) {
  ctx.save();
  groundOutline(ctx);
  const base = ctx.createLinearGradient(0, HORIZON + 20, 0, DESIGN_H);
  base.addColorStop(0, "#245f29");
  base.addColorStop(0.35, "#2f7a33");
  base.addColorStop(1, "#3b8f3d");
  ctx.fillStyle = base;
  ctx.fill();
  ctx.clip();

  // Mowing stripes running down the ground, plus faint cross bands.
  const nearY = CAM.y + 2.2;
  for (let x = -96, i = 0; x < 96; x += 6, i++) {
    fillQuad(ctx, [x, nearY, 0], [x + 6, nearY, 0], [x + 6, R + 8, 0], [x, R + 8, 0], i % 2 ? "rgba(255,255,255,0.045)" : "rgba(0,0,0,0.05)");
  }
  for (let y = nearY, i = 0; y < R + 8; y += 9, i++) {
    if (i % 2) fillQuad(ctx, [-120, y, 0], [120, y, 0], [120, y + 9, 0], [-120, y + 9, 0], "rgba(0,0,0,0.035)");
  }

  // The square: the lighter, closely mown block the pitches are cut from.
  fillQuad(ctx, [-12, -16, 0], [12, -16, 0], [12, 16, 0], [-12, 16, 0], "rgba(205,215,140,0.10)");

  // Grass grain.
  const rand = seeded(99);
  for (let i = 0; i < 2600; i++) {
    const x = (rand() - 0.5) * 150;
    const y = CAM.y + 2 + rand() * (R + 10 - CAM.y);
    const p = project(x, y, 0);
    if (p.x < 0 || p.x > DESIGN_W || p.y > DESIGN_H) continue;
    ctx.fillStyle = rand() < 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.07)";
    const s = Math.max(0.8, 0.12 * p.ppm);
    ctx.fillRect(p.x, p.y, s, s * 0.5);
  }

  // 30-yard circle, marked with white discs as at real grounds.
  const rr = 27.43;
  const discs: V3[] = [];
  for (let a = -90; a <= 90; a += 5) {
    const t = (a * Math.PI) / 180;
    discs.push([rr * Math.sin(t), BOWLER_Y + rr * Math.cos(t), 0]);
  }
  for (let y = BOWLER_Y; y > STRIKER_Y; y -= 4) discs.push([rr, y, 0], [-rr, y, 0]);
  for (let a = 95; a < 270; a += 5) {
    const t = (a * Math.PI) / 180;
    discs.push([rr * Math.sin(t), STRIKER_Y + rr * Math.cos(t), 0]);
  }
  for (const d of discs) {
    if (d[1] - CAM.y < 3) continue;
    const p = projectV(d);
    const rx = Math.max(1, 0.32 * p.ppm);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, rx, rx * (CAM.z / p.depth) * 1.4 + 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Pools of floodlight, darker toward the edges.
  const light = ctx.createRadialGradient(CX, 330, 60, CX, 330, 720);
  light.addColorStop(0, "rgba(255,255,240,0.07)");
  light.addColorStop(0.6, "rgba(0,0,0,0.05)");
  light.addColorStop(1, "rgba(0,0,0,0.32)");
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
  ctx.restore();
}

function paintCushion(ctx: Ctx) {
  // A padded, sloping boundary cushion wrapped in sponsor panels.
  const H = 1.9; // exaggerated a little so the lettering reads at this distance
  const span = (6.4 / R) * (180 / Math.PI);
  const panels: { t: number; i: number }[] = [];
  for (let t = -89, i = 0; t < 89; t += span, i++) panels.push({ t, i });
  for (const { t, i } of panels) {
    const brand = BRANDS[i % BRANDS.length];
    const tl = projectV(ring(R, t, H));
    const tr = projectV(ring(R, t + span, H));
    const br = projectV(ring(R - 0.8, t + span, 0));
    const bl = projectV(ring(R - 0.8, t, 0));
    if (tr.x < -60 || tl.x > DESIGN_W + 60) continue;

    path(ctx, [tl, tr, br, bl]);
    ctx.fillStyle = brand.bg;
    ctx.fill();

    ctx.save();
    onSurface(ctx, tl, tr, bl, 240, 80);
    if (brand.stripe) {
      ctx.fillStyle = brand.stripe;
      ctx.fillRect(0, 68, 240, 12);
    }
    wordmark(ctx, brand, 120, 38, 210, 46);
    // Padding: lit along the top roll, shaded toward the grass.
    const pad = ctx.createLinearGradient(0, 0, 0, 80);
    pad.addColorStop(0, "rgba(255,255,255,0.32)");
    pad.addColorStop(0.18, "rgba(255,255,255,0.0)");
    pad.addColorStop(0.75, "rgba(0,0,0,0.0)");
    pad.addColorStop(1, "rgba(0,0,0,0.30)");
    ctx.fillStyle = pad;
    ctx.fillRect(0, 0, 240, 80);
    ctx.restore();

    // Seam between panels.
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(tl.x, tl.y);
    ctx.lineTo(bl.x, bl.y);
    ctx.stroke();
  }
  // Top roll highlight.
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  arc(R, H, -89, 89).forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.stroke();
  // Contact shadow on the grass.
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  arc(R - 0.95, 0, -89, 89).forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.stroke();
}

function crease(ctx: Ctx, x0: number, y0: number, x1: number, y1: number) {
  // A painted line as a thin world-space quad, so it narrows with distance.
  const w = 0.05;
  const along = x0 === x1 ? [w / 2, 0] : [0, w / 2];
  fillQuad(
    ctx,
    [x0 - along[0], y0 - along[1], 0],
    [x1 - along[0], y1 - along[1], 0],
    [x1 + along[0], y1 + along[1], 0],
    [x0 + along[0], y0 + along[1], 0],
    "rgba(255,255,255,0.92)",
  );
}

function paintPitch(ctx: Ctx) {
  const w = PITCH_HALF_W;
  const y0 = STRIKER_Y - 2.4;
  const y1 = BOWLER_Y + 2.4;
  const near = project(0, y0);
  const far = project(0, y1);
  const g = ctx.createLinearGradient(0, far.y, 0, Math.min(DESIGN_H, near.y));
  g.addColorStop(0, "#bfa775");
  g.addColorStop(0.5, "#cdb588");
  g.addColorStop(1, "#d9c497");
  fillQuad(ctx, [-w, y1, 0], [w, y1, 0], [w, y0, 0], [-w, y0, 0], g);

  // Edges where the pitch meets the grass.
  ctx.save();
  path(ctx, [[-w, y1, 0], [w, y1, 0], [w, y0, 0], [-w, y0, 0]].map((p) => projectV(p as V3)));
  ctx.clip();

  // Wear: scuffed footholds at each crease and a dusty length area.
  const rand = seeded(5);
  const scuff = (cx: number, cy: number, sx: number, sy: number, n: number, a: number) => {
    for (let i = 0; i < n; i++) {
      const p = project(cx + (rand() - 0.5) * sx, cy + (rand() - 0.5) * sy, 0);
      const s = Math.max(0.6, (0.05 + rand() * 0.12) * p.ppm);
      ctx.fillStyle = `rgba(120,90,50,${a * (0.4 + rand() * 0.6)})`;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, s, s * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  scuff(-0.2, STRIKER_Y + 1.0, 1.4, 1.6, 220, 0.22);
  scuff(0.35, BOWLER_Y - 1.0, 1.6, 2.0, 160, 0.25);
  scuff(0.05, STRIKER_Y + 6.2, 1.2, 4.5, 260, 0.12);
  for (let i = 0; i < 900; i++) {
    const p = project((rand() - 0.5) * 2 * w, y0 + rand() * (y1 - y0), 0);
    ctx.fillStyle = rand() < 0.5 ? "rgba(255,255,255,0.05)" : "rgba(90,60,30,0.07)";
    const s = Math.max(0.6, 0.06 * p.ppm);
    ctx.fillRect(p.x, p.y, s, s * 0.5);
  }
  ctx.restore();

  // Creases at both ends.
  for (const end of [STRIKER_Y, BOWLER_Y]) {
    const dir = end < 0 ? 1 : -1;
    crease(ctx, -1.32, end, 1.32, end); // bowling crease, through the stumps
    crease(ctx, -2.3, end + dir * CREASE, 2.3, end + dir * CREASE); // popping crease
    for (const x of [-1.32, 1.32]) crease(ctx, x, end - dir * CREASE, x, end + dir * CREASE); // return creases
  }
  // T20 wide guidelines at the striker's end.
  for (const x of [-0.89, 0.89]) crease(ctx, x, STRIKER_Y + CREASE - 0.55, x, STRIKER_Y + CREASE + 0.35);
}

/** Paint the whole static backdrop. */
export function paintBackdrop(ctx: Ctx) {
  paintSky(ctx);
  for (const t of TOWER.thetas) paintTower(ctx, t);
  paintStands(ctx);
  for (const t of TOWER.thetas) paintTowerGlow(ctx, t);
  paintSightScreen(ctx);
  paintGround(ctx);
  paintCushion(ctx);
  paintPitch(ctx);
}
