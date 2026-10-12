"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

import type { BallResult, Delivery, Direction, MatchState } from "@/types/match";
import {
  DESIGN_H,
  DESIGN_W,
  type FielderDot,
  TIMING,
  WORLD,
  drawBall,
  drawBowler,
  drawFielder,
  drawGround,
  drawNonStriker,
  drawPitch,
  drawSky,
  drawStands,
  drawStriker,
  drawTimingMeter,
  fieldToWorld,
} from "@/lib/render";
import { currentInnings } from "@/lib/cricket";

export interface StadiumHandle {
  /** Bowl the delivery. Resolves with the user's timing (ms from perfect), or null if unplayed. */
  bowl: (delivery: Delivery) => Promise<number | null>;
  /** Animate the outcome of the ball. */
  showResult: (result: BallResult) => Promise<void>;
}

interface Props {
  match: MatchState;
  aim: Direction;
  interactive: boolean; // true only while the user is batting
}

type Anim =
  | { kind: "idle" }
  | {
      kind: "incoming";
      start: number;
      flight: number;
      resolve: (t: number | null) => void;
      swungAt: number | null;
      meter: boolean; // show the timing meter (only while the user is batting)
    }
  | { kind: "outgoing"; start: number; dur: number; result: BallResult; resolve: () => void };

const now = () => performance.now();

const Stadium = forwardRef<StadiumHandle, Props>(function Stadium(
  { match, aim, interactive },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const anim = useRef<Anim>({ kind: "idle" });
  const aimRef = useRef<Direction>(aim);
  const matchRef = useRef<MatchState>(match);

  useEffect(() => {
    aimRef.current = aim;
  }, [aim]);
  useEffect(() => {
    matchRef.current = match;
  }, [match]);

  // Resolve the swing: record timing, let the outgoing phase take over later.
  const swing = () => {
    const a = anim.current;
    if (a.kind !== "incoming" || a.swungAt !== null) return;
    a.swungAt = now();
    const perfect = a.start + a.flight;
    a.resolve(Math.round(a.swungAt - perfect));
  };

  useImperativeHandle(ref, () => ({
    bowl: (delivery) =>
      new Promise<number | null>((resolve) => {
        // Quicker ball = shorter flight; keep it playable.
        const flight = Math.round(165000 / delivery.speed_kph) + 320; // ~1.4s pace, ~1.7s spin
        anim.current = { kind: "incoming", start: now(), flight, resolve, swungAt: null, meter: interactive };
      }),
    showResult: (result) =>
      new Promise<void>((resolve) => {
        const dur = result.shot ? 850 + result.bat_runs * 60 : 650;
        anim.current = { kind: "outgoing", start: now(), dur, result, resolve };
      }),
  }));

  // Keyboard + click input for the swing.
  useEffect(() => {
    if (!interactive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        swing();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [interactive]);

  // The render loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;

    const frame = () => {
      const m = matchRef.current;
      const inn = currentInnings(m);
      const battingTeam = inn?.batting ?? m.user_team;
      const fieldingTeam = inn?.bowling ?? (m.user_team === "IND" ? "PAK" : "IND");

      ctx.clearRect(0, 0, DESIGN_W, DESIGN_H);
      drawSky(ctx);
      drawStands(ctx);
      drawGround(ctx);
      drawPitch(ctx);

      const a = anim.current;
      const activeFielder =
        a.kind === "outgoing" && a.result.shot ? a.result.shot.fielder : null;
      const fielders: FielderDot[] = m.field.map((f, i) => ({
        world: fieldToWorld(f.angle, f.distance),
        name: f.name,
        active: i === activeFielder,
      }));
      // Draw far fielders first so nearer ones overlap correctly.
      fielders
        .map((f, i) => ({ f, i }))
        .sort((p, q) => q.f.world.y - p.f.world.y)
        .forEach(({ f }) => drawFielder(ctx, f, fieldingTeam));

      drawBowler(ctx, fieldingTeam);
      drawNonStriker(ctx, battingTeam);

      // Ball.
      const t = now();
      if (a.kind === "incoming") {
        const progress = (t - a.start) / a.flight;
        const p = Math.min(1, progress);
        const y = WORLD.BOWLER_Y + (WORLD.STRIKER_Y - WORLD.BOWLER_Y) * p;
        const lift = Math.sin(p * Math.PI) * 10 * (1 - p);
        drawBall(ctx, -0.6 * (1 - p) - 2.4 * p, y, lift);
        if (a.meter) {
          const swungTiming =
            a.swungAt === null ? null : Math.round(a.swungAt - (a.start + a.flight));
          drawTimingMeter(ctx, progress, a.flight, swungTiming);
        }
        // Ball passed the bat unplayed.
        if (p >= 1 && a.swungAt === null) {
          if (t - (a.start + a.flight) > TIMING.graceLate) a.resolve(null);
        }
      } else if (a.kind === "outgoing") {
        const p = Math.min(1, (t - a.start) / a.dur);
        const res = a.result;
        if (res.shot) {
          const target = fieldToWorld(res.shot.angle, res.shot.distance);
          const sx = -2.4;
          const sy = WORLD.STRIKER_Y;
          const x = sx + (target.x - sx) * p;
          const y = sy + (target.y - sy) * p;
          const lift = res.shot.lofted ? Math.sin(p * Math.PI) * 60 : Math.sin(p * Math.PI) * 6;
          drawBall(ctx, x, y, lift);
        } else {
          // Beaten / bowled: ball continues past the bat toward the keeper.
          const y = WORLD.STRIKER_Y - p * 6;
          drawBall(ctx, -2.4 + p * 0.3, y, 2);
        }
        if (p >= 1) {
          a.resolve();
          anim.current = { kind: "idle" };
        }
      }

      drawStriker(ctx, battingTeam);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-xl bg-[#141e4a] ring-1 ring-white/10 shadow-2xl">
      <canvas
        ref={canvasRef}
        width={DESIGN_W}
        height={DESIGN_H}
        onPointerDown={() => interactive && swing()}
        className="block h-full max-h-full w-full cursor-pointer object-contain touch-none"
      />
    </div>
  );
});

export default Stadium;
