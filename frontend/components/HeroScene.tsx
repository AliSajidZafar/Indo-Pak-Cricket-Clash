"use client";

import { useEffect, useRef } from "react";

import { paintBackdrop } from "@/lib/scene/backdrop";
import { drawBall, drawBallShadow, drawStumps, incomingPath } from "@/lib/scene/ball";
import {
  BOWLER_Y,
  DESIGN_H,
  DESIGN_W,
  STRIKER_Y,
  type V3,
  clamp,
  depthOf,
  fieldToWorld,
  inFront,
  lerp,
  smooth,
} from "@/lib/scene/camera";
import { Fireworks, drawBigScreen, drawFlashes } from "@/lib/scene/hud";
import {
  BAT_BACKLIFT,
  BAT_STANCE,
  type Figure,
  KITS,
  NON_STRIKER,
  type Pose,
  READY,
  RELEASE_U,
  SHOTS,
  STAND,
  blend,
  bowlPose,
  drawFigure,
  drawShadows,
  jointAt,
  runPose,
} from "@/lib/scene/people";
import type { Delivery, TeamCode } from "@/types/match";

// A looping attract-screen: a batsman lofts the bowler for six, over and over,
// alternating India and Pakistan — the whole scene engine, no match state.

const CYCLE = 4000;
const RELEASE = 1150;
const FLIGHT = 640;
const CONTACT = RELEASE + FLIGHT;
const SIX_DUR = 1750;
const BACKLIFT_FROM = RELEASE - 650;

const HOME = { x: -0.34, y: STRIKER_Y + 1.0 };
const NS_HOME = { x: -1.35, y: BOWLER_Y - 1.05 };
const MARK = { x: 1.75, y: BOWLER_Y + 14 };
const REL = { x: 0.57, y: BOWLER_Y - 0.85 };
const FOLLOW_END = { x: 1.9, y: BOWLER_Y - 3.6 };
const FACE_CAMERA = -Math.PI / 2;

const DELIVERY: Delivery = { kind: "legal", line: "stumps", length: "good", speed_kph: 134, free_hit: false };
const SHOT_CYCLE: ("off" | "straight" | "leg")[] = ["off", "straight", "leg", "off"];
const SIX_ANGLE: Record<"off" | "straight" | "leg", number> = { off: 54, straight: 4, leg: -52 };

// A handful of fielders for depth (not the full nine — this is just set dressing).
const FIELD = [
  { angle: 60, distance: 0.42 },
  { angle: 30, distance: 0.82 },
  { angle: -4, distance: 0.9 },
  { angle: -38, distance: 0.84 },
  { angle: -64, distance: 0.44 },
];

function sixArc(from: V3, angle: number) {
  const t = fieldToWorld(angle, 1.05);
  const end: V3 = [t.x * 1.18, t.y * 1.18, 11];
  const peak = 26;
  const at = (p: number): V3 => [
    lerp(from[0], end[0], p),
    lerp(from[1], end[1], p),
    Math.max(0.04, lerp(from[2], end[2], p) + peak * 4 * p * (1 - p)),
  ];
  return { at };
}

/** Stance with little bat-taps while waiting for the ball. */
function stanceTap(t: number): Pose {
  const k = Math.pow(Math.max(0, Math.sin(t / 240)), 8) * 0.2;
  const p = BAT_STANCE;
  if (!p.bat) return p;
  const d: V3 = [p.bat.dir[0] + k * 0.3, p.bat.dir[1] + k, p.bat.dir[2] + k * 0.4];
  const l = Math.hypot(d[0], d[1], d[2]);
  return { ...p, bat: { top: p.bat.top, dir: [d[0] / l, d[1] / l, d[2] / l] } };
}

export default function HeroScene({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = DESIGN_W * dpr;
    canvas.height = DESIGN_H * dpr;

    const backdrop = document.createElement("canvas");
    backdrop.width = canvas.width;
    backdrop.height = canvas.height;
    const bctx = backdrop.getContext("2d")!;
    bctx.scale(dpr, dpr);
    paintBackdrop(bctx);

    const releasePoint = jointAt(bowlPose(RELEASE_U), REL.x, REL.y, FACE_CAMERA, "rHand");
    const incoming = incomingPath(DELIVERY, releasePoint, false);
    const fireworks = new Fireworks();
    const start = performance.now();
    let lastCycle = -1;
    let raf = 0;

    const batsmanPose = (t: number, shot: "off" | "straight" | "leg"): Pose => {
      if (t < BACKLIFT_FROM) return stanceTap(t);
      if (t < CONTACT) return blend(BAT_STANCE, BAT_BACKLIFT, smooth((t - BACKLIFT_FROM) / 650));
      const s = SHOTS[shot];
      if (t < CONTACT + 120) return blend(BAT_BACKLIFT, s.impact, smooth((t - CONTACT) / 120));
      if (t < CONTACT + 520) return blend(s.impact, s.finish, smooth((t - CONTACT - 120) / 400));
      if (t > CYCLE - 320) return blend(s.finish, BAT_STANCE, smooth((t - (CYCLE - 320)) / 320));
      return s.finish;
    };

    const heroBowler = (t: number): { pose: Pose; x: number; y: number; yaw: number; ball: boolean } => {
      const pre = { x: REL.x + 0.15, y: REL.y + 1.35 };
      const actPre = 300;
      const actPost = 220;
      const actStart = RELEASE - actPre;
      if (t < actStart) {
        const q = clamp(t / actStart, 0, 1);
        const e = 0.4 * q + 0.6 * q * q;
        const x = lerp(MARK.x, pre.x, e);
        const y = lerp(MARK.y, pre.y, e);
        const dist = Math.hypot(x - MARK.x, y - MARK.y);
        return { pose: runPose((dist / 1.3) * Math.PI, 1.1), x, y, yaw: FACE_CAMERA, ball: true };
      }
      if (t < RELEASE + actPost) {
        const u = clamp((t - actStart) / (actPre + actPost), 0, 1);
        let x: number;
        let y: number;
        if (u < RELEASE_U) {
          const k = u / RELEASE_U;
          x = lerp(pre.x, REL.x, k);
          y = lerp(pre.y, REL.y, k);
        } else {
          const k = (u - RELEASE_U) / (1 - RELEASE_U);
          x = lerp(REL.x, REL.x + 0.3, k);
          y = lerp(REL.y, REL.y - 1.2, k);
        }
        return { pose: bowlPose(u), x, y, yaw: FACE_CAMERA, ball: t < RELEASE };
      }
      const from = { x: REL.x + 0.3, y: REL.y - 1.2 };
      const s = clamp((t - RELEASE - actPost) / 800, 0, 1);
      const e = 1 - (1 - s) * (1 - s);
      const x = lerp(from.x, FOLLOW_END.x, e);
      const y = lerp(from.y, FOLLOW_END.y, e);
      const dist = Math.hypot(x - from.x, y - from.y);
      return {
        pose: s >= 1 ? STAND : runPose((dist / 1.1) * Math.PI, lerp(1, 0.4, s)),
        x,
        y,
        yaw: Math.atan2(FOLLOW_END.y - from.y, FOLLOW_END.x - from.x),
        ball: false,
      };
    };

    const frame = () => {
      const elapsed = performance.now() - start;
      const cycle = Math.floor(elapsed / CYCLE);
      const t = elapsed - cycle * CYCLE;
      const batting: TeamCode = cycle % 2 === 0 ? "IND" : "PAK";
      const bowling: TeamCode = batting === "IND" ? "PAK" : "IND";
      const batKit = KITS[batting];
      const bowlKit = KITS[bowling];
      const shot = SHOT_CYCLE[cycle % SHOT_CYCLE.length];

      if (cycle !== lastCycle) {
        lastCycle = cycle;
        fireworks.show(performance.now() + CONTACT + SIX_DUR * 0.5 - t);
      }

      // The ball: in the bowler's hand, flighted in, then sailing for six.
      let ball: V3 | null = null;
      if (t >= RELEASE && t <= CONTACT) ball = incoming.at((t - RELEASE) / FLIGHT);
      else if (t > CONTACT) {
        const p = (t - CONTACT) / SIX_DUR;
        if (p <= 1) ball = sixArc(incoming.at(1), SIX_ANGLE[shot]).at(p);
      }

      const bowler = heroBowler(t);
      const big = t > CONTACT + 200 && t < CONTACT + SIX_DUR ? "SIX!" : null;

      // --- draw
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.drawImage(backdrop, 0, 0, DESIGN_W, DESIGN_H);
      drawBigScreen(
        ctx,
        { top: "T20 CLASH · THE ARCH-RIVALS", main: "IND v PAK", accent: "#22d3ee", flash: big },
        performance.now(),
      );
      drawFlashes(ctx, performance.now(), big ? 1 : 0.15);
      fireworks.draw(ctx, performance.now());

      const figures: Figure[] = [
        { pose: bowler.pose, x: bowler.x, y: bowler.y, yaw: bowler.yaw, kit: bowlKit, gear: "field", ballInHand: bowler.ball, look: ball ?? [0, STRIKER_Y, 1] },
        { pose: NON_STRIKER, x: NS_HOME.x, y: NS_HOME.y, yaw: FACE_CAMERA, kit: batKit, gear: "bat" },
        ...FIELD.map((f): Figure => {
          const w = fieldToWorld(f.angle, f.distance);
          const toward = Math.atan2(HOME.y - w.y, HOME.x - w.x);
          return { pose: READY, x: w.x, y: w.y, yaw: toward, kit: bowlKit, gear: "field", look: ball ?? undefined };
        }),
        { pose: batsmanPose(t, shot), x: HOME.x, y: HOME.y, yaw: 0, kit: batKit, gear: "bat", look: ball ?? [0, BOWLER_Y, 1.6] },
      ];

      for (const f of figures) drawShadows(ctx, f.x, f.y, 1.75, 1);
      if (ball) drawBallShadow(ctx, ball);

      const items: { d: number; draw: () => void }[] = figures.map((f) => ({ d: depthOf(f.y), draw: () => drawFigure(ctx, f) }));
      items.push({ d: depthOf(BOWLER_Y), draw: () => drawStumps(ctx, BOWLER_Y, null, performance.now()) });
      items.push({ d: depthOf(STRIKER_Y), draw: () => drawStumps(ctx, STRIKER_Y, null, performance.now()) });
      if (ball && inFront(ball[1], 1.2)) {
        const b = ball;
        items.push({ d: depthOf(b[1]) - 0.05, draw: () => drawBall(ctx, b, []) });
      }
      items.sort((p, q) => q.d - p.d);
      for (const it of items) it.draw();

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={DESIGN_W}
      height={DESIGN_H}
      className={className}
      aria-hidden
    />
  );
}
