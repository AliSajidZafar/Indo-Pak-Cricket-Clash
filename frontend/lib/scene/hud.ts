// Live overlays: the batting timing meter, the big screen in the stands, camera
// flashes in the crowd and fireworks for sixes.

import { BIG_SCREEN, crowdSpots } from "./backdrop";
import { DESIGN_H, DESIGN_W, projectV, ring } from "./camera";

// Timing windows (ms), mirroring backend/app/engine.py. graceLate is how long
// after the perfect moment the ball waits before it counts as unplayed.
export const TIMING = {
  perfect: 70,
  good: 140,
  mistimed: 215,
  edge: 290,
  graceLate: 320,
};

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
  const W = 440;
  const H = 14;
  const x0 = (DESIGN_W - W) / 2;
  const y0 = DESIGN_H - 24;
  const span = flightMs + TIMING.graceLate;
  const px = (timing: number) => x0 + Math.max(0, Math.min(1, (timing + flightMs) / span)) * W;

  ctx.fillStyle = "rgba(2,6,23,0.78)";
  roundRect(ctx, x0 - 8, y0 - 22, W + 16, H + 28, 9);
  ctx.fill();

  const band = (win: number, color: string) => {
    const a = px(-win);
    const b = px(win);
    ctx.fillStyle = color;
    roundRect(ctx, a, y0, b - a, H, 4);
    ctx.fill();
  };
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  roundRect(ctx, x0, y0, W, H, 4);
  ctx.fill();
  band(TIMING.edge, "#92400e");
  band(TIMING.mistimed, "#b45309");
  band(TIMING.good, "#4d7c0f");
  band(TIMING.perfect, "#22c55e");

  const markerTiming = swungTimingMs ?? (progress - 1) * flightMs;
  const mx = px(markerTiming);
  ctx.fillStyle = swungTimingMs === null ? "#ffffff" : "#f472b6";
  ctx.fillRect(mx - 1.5, y0 - 4, 3, H + 8);

  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "600 11px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("Press SPACE as the marker hits the green", DESIGN_W / 2, y0 - 8);
  ctx.textAlign = "left";
}

/** The big screen hanging over the stands, showing the live score or the latest drama. */
export function drawBigScreen(
  ctx: CanvasRenderingContext2D,
  lines: { top: string; main: string; accent: string; flash: string | null },
  now: number,
) {
  const { r, theta0, theta1, z0, z1 } = BIG_SCREEN;
  const tl = projectV(ring(r, theta0, z1));
  const tr = projectV(ring(r, theta1, z1));
  const br = projectV(ring(r, theta1, z0));
  const bl = projectV(ring(r, theta0, z0));

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(tl.x, tl.y);
  ctx.lineTo(tr.x, tr.y);
  ctx.lineTo(br.x, br.y);
  ctx.lineTo(bl.x, bl.y);
  ctx.closePath();
  ctx.fillStyle = "#0b0d14";
  ctx.fill();
  ctx.strokeStyle = "#475069";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Draw in a 200×100 box mapped onto the screen face.
  const W = 200;
  const H = 100;
  ctx.transform((tr.x - tl.x) / W, (tr.y - tl.y) / W, (bl.x - tl.x) / H, (bl.y - tl.y) / H, tl.x, tl.y);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#0f1d4a");
  g.addColorStop(1, "#071029");
  ctx.fillStyle = g;
  ctx.fillRect(6, 6, W - 12, H - 12);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (lines.flash && Math.floor(now / 260) % 2 === 0) {
    ctx.fillStyle = lines.accent;
    ctx.font = '900 46px "Arial Black", system-ui, sans-serif';
    ctx.fillText(lines.flash, W / 2, H / 2 + 2);
  } else if (!lines.flash) {
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = "700 15px system-ui, sans-serif";
    ctx.fillText(lines.top, W / 2, 24);
    ctx.fillStyle = "#ffffff";
    ctx.font = '900 34px "Arial Black", system-ui, sans-serif';
    ctx.fillText(lines.main, W / 2, 60);
  }
  ctx.restore();
}

/** Camera flashes popping in the crowd — busier when something big happens. */
export function drawFlashes(ctx: CanvasRenderingContext2D, now: number, intensity: number) {
  if (!crowdSpots.length) return;
  const count = Math.round(4 + intensity * 40);
  const slot = Math.floor(now / 70);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < count; i++) {
    const h = Math.abs(Math.sin((slot + 1) * 12.9898 + i * 78.233) * 43758.5453) % 1;
    const p = crowdSpots[Math.floor(h * crowdSpots.length)];
    const s = 1.2 + (i % 3) * 0.5;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
  }
  ctx.restore();
}

// --- fireworks -----------------------------------------------------------------------------

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  color: string;
}

const SPARK_COLORS = ["#ff9933", "#ffffff", "#22c55e", "#facc15", "#60a5fa", "#f472b6"];

export class Fireworks {
  private sparks: Spark[] = [];
  private pending: { at: number; x: number; y: number }[] = [];

  private burst(now: number, x: number, y: number) {
    const color = SPARK_COLORS[Math.floor(Math.random() * SPARK_COLORS.length)];
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * Math.PI * 2 + Math.random() * 0.1;
      const sp = 60 + Math.random() * 70;
      this.sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, born: now, color });
    }
  }

  /** Three bursts over the stands, a beat apart. */
  show(now: number) {
    const spots: [number, number][] = [
      [DESIGN_W * 0.25, 60],
      [DESIGN_W * 0.72, 48],
      [DESIGN_W * 0.5, 34],
    ];
    spots.forEach(([x, y], i) => this.pending.push({ at: now + i * 280, x, y }));
  }

  draw(ctx: CanvasRenderingContext2D, now: number) {
    const due = this.pending.filter((p) => p.at <= now);
    this.pending = this.pending.filter((p) => p.at > now);
    for (const p of due) this.burst(now, p.x, p.y);
    if (!this.sparks.length) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    this.sparks = this.sparks.filter((s) => now - s.born < 1400);
    for (const s of this.sparks) {
      const t = (now - s.born) / 1000;
      const x = s.x + s.vx * t;
      const y = s.y + s.vy * t + 40 * t * t;
      const a = Math.max(0, 1 - t / 1.4);
      ctx.globalAlpha = a;
      ctx.fillStyle = s.color;
      ctx.fillRect(x - 1, y - 1, 2.2, 2.2);
    }
    ctx.restore();
  }
}
