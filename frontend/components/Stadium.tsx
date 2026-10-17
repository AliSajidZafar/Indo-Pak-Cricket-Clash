"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

import { currentInnings, overs } from "@/lib/cricket";
import { paintBackdrop } from "@/lib/scene/backdrop";
import {
  type Incoming,
  type Outgoing,
  type StumpsState,
  drawBall,
  drawBallShadow,
  drawStumps,
  incomingPath,
  outgoingPath,
} from "@/lib/scene/ball";
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
  project,
  smooth,
} from "@/lib/scene/camera";
import { Fireworks, TIMING, drawBigScreen, drawFlashes, drawTimingMeter } from "@/lib/scene/hud";
import {
  BAT_BACKLIFT,
  BAT_LEAVE,
  BAT_STANCE,
  CATCH,
  CELEBRATE,
  DESPAIR,
  type Figure,
  KITS,
  NON_STRIKER,
  PICKUP,
  type Pose,
  READY,
  RELEASE_U,
  SHOTS,
  STAND,
  type Signal,
  UMPIRE_KIT,
  blend,
  bowlPose,
  drawFigure,
  drawShadows,
  jointAt,
  lift,
  runPose,
  umpirePose,
} from "@/lib/scene/people";
import type { BallResult, Delivery, Direction, MatchState } from "@/types/match";

export interface StadiumHandle {
  /** Bowl the delivery. Resolves with the user's timing (ms from perfect), or null if unplayed. */
  bowl: (delivery: Delivery) => Promise<number | null>;
  /** Animate the outcome of the ball just bowled. */
  showResult: (result: BallResult) => Promise<void>;
  /** Computer batting: play out a ball whose outcome is already known, start to finish. */
  replay: (result: BallResult) => Promise<void>;
}

interface Props {
  match: MatchState;
  aim: Direction;
  interactive: boolean; // true only while the user is batting
}

// --- where everyone stands ----------------------------------------------------------------

type Spot = { x: number; y: number };

const HOME: Spot = { x: -0.34, y: STRIKER_Y + 1.0 }; // striker, guard on leg stump
const NS_HOME: Spot = { x: -1.35, y: BOWLER_Y - 1.05 }; // non-striker, backing up
const UMPIRE_AT: Spot = { x: -0.15, y: BOWLER_Y + 1.75 };
const RELEASE_AT: Spot = { x: 0.57, y: BOWLER_Y - 0.85 };
const FOLLOW_END: Spot = { x: 1.9, y: BOWLER_Y - 3.6 };
const MARKS = { pace: { x: 1.75, y: BOWLER_Y + 14 }, spin: { x: 1.0, y: BOWLER_Y + 5.2 } };
const ACTION_PRE = 330; // ms of the delivery stride before release
const ACTION_POST = 270; // ...and after it
const TOWARD_CAMERA = -Math.PI / 2;
const UP_THE_PITCH = Math.PI / 2;

const SHIRT_NUMBERS: Record<string, number> = {
  "Rohit Sharma": 45, "Virat Kohli": 18, "Shubman Gill": 77, "Shreyas Iyer": 41, "KL Rahul": 1,
  "Hardik Pandya": 33, "Ravindra Jadeja": 8, "Axar Patel": 20, "Kuldeep Yadav": 23,
  "Jasprit Bumrah": 93, "Mohammed Siraj": 73, "Babar Azam": 56, "Fakhar Zaman": 39,
  "Mohammad Rizwan": 16, "Shaheen Afridi": 10, "Shadab Khan": 7, "Naseem Shah": 71, "Haris Rauf": 97,
};
const shirtNumber = (name: string) =>
  SHIRT_NUMBERS[name] ?? (Array.from(name).reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 98) + 1;
const surnameOf = (name: string) => name.split(" ").pop() ?? name;

// --- animation state ------------------------------------------------------------------------

interface Pending {
  result: BallResult;
  done: () => void;
}

interface DeliveryAnim {
  kind: "delivery";
  start: number; // run-up begins
  release: number; // ball leaves the hand
  flight: number; // ms from release to the bat
  delivery: Delivery;
  spin: boolean;
  path: Incoming;
  runFrom: Spot;
  fadeIn: boolean;
  meter: boolean;
  scripted: boolean; // outcome known in advance (computer batting)
  swungAt: number | null;
  swingDir: Direction;
  contact: boolean;
  resolve: ((timing: number | null) => void) | null;
  pending: Pending | null;
}

interface ResultAnim {
  kind: "result";
  start: number;
  result: BallResult;
  path: Outgoing;
  swungAt: number | null;
  swingDir: Direction;
  preSwing: Pose | null;
  hold: Pose;
  runs: number;
  done: () => void;
}

type Placed = { pose: Pose; x: number; y: number; yaw: number };

interface IdleAnim {
  kind: "idle";
  since: number;
  from: Placed | null;
}

type Anim = IdleAnim | DeliveryAnim | ResultAnim;

const now = () => performance.now();

// --- pure helpers ---------------------------------------------------------------------------

function shotDir(r: BallResult, fallback: Direction): Direction {
  const a = r.shot?.angle;
  if (a === undefined || Math.abs(a) > 100) return fallback;
  return a < -20 ? "leg" : a > 20 ? "off" : "straight";
}

function signalFor(r: BallResult): Signal {
  if (r.wicket) return "out";
  if (r.extra_type === "wide") return "wide";
  if (r.extra_type === "no_ball") return "no_ball";
  if (r.bat_runs === 6) return "six";
  if (r.bat_runs === 4) return "four";
  if (r.extra_type === "bye") return "bye";
  if (r.extra_type === "leg_bye") return "leg_bye";
  return null;
}

function flashFor(r: BallResult): { text: string; color: string; roar: boolean } | null {
  if (r.wicket) return { text: "OUT!", color: "#f87171", roar: true };
  if (r.bat_runs === 6) return { text: "SIX!", color: "#22d3ee", roar: true };
  if (r.bat_runs === 4) return { text: "FOUR!", color: "#fbbf24", roar: true };
  if (r.extra_type === "wide") return { text: "WIDE", color: "#c084fc", roar: false };
  if (r.extra_type === "no_ball") return { text: "NO BALL", color: "#c084fc", roar: false };
  return null;
}

function runsToRun(r: BallResult): number {
  if (r.wicket) return 0;
  if (r.bat_runs >= 1 && r.bat_runs <= 3) return r.bat_runs;
  if ((r.extra_type === "bye" || r.extra_type === "leg_bye") && r.extra_runs < 4) return r.extra_runs;
  return 0;
}

/** Carry the bat in the right hand while running. */
const withBat = (p: Pose): Pose => ({ ...p, bat: { top: p.rHand, dir: [0.55, -0.05, -0.83] } });

/** The striker's little bat-taps while waiting. */
function tap(p: Pose, t: number): Pose {
  if (!p.bat) return p;
  const k = Math.pow(Math.max(0, Math.sin(t / 230)), 8) * 0.25;
  const d: V3 = [p.bat.dir[0] + k * 0.3, p.bat.dir[1] + k, p.bat.dir[2] + k * 0.4];
  const l = Math.hypot(d[0], d[1], d[2]);
  return { ...p, bat: { top: p.bat.top, dir: [d[0] / l, d[1] / l, d[2] / l] } };
}

/** Striker before any swing: stance, backlift as the ball comes, or a leave. */
function readyPose(a: DeliveryAnim, t: number): Pose {
  if (t < a.release) return t < a.release - 700 ? tap(BAT_STANCE, t) : BAT_STANCE;
  const p = (t - a.release) / a.flight;
  const pose = blend(BAT_STANCE, BAT_BACKLIFT, smooth((p - 0.3) / 0.45));
  const leaveFrom = a.scripted ? (a.swungAt === null ? 0.88 : Infinity) : 1.1;
  return p > leaveFrom ? blend(pose, BAT_LEAVE, smooth((p - leaveFrom) / 0.16)) : pose;
}

function swingPose(base: Pose, swungAt: number, dir: Direction, t: number): Pose {
  const s = t - swungAt;
  const shot = SHOTS[dir];
  if (s < 110) return blend(base, shot.impact, smooth(s / 110));
  return blend(shot.impact, shot.finish, smooth((s - 110) / 260));
}

function strikerInDelivery(a: DeliveryAnim, t: number): Pose {
  if (a.swungAt !== null && t >= a.swungAt) return swingPose(readyPose(a, a.swungAt), a.swungAt, a.swingDir, t);
  return readyPose(a, t);
}

/** The ball during a delivery: in the hand, in flight, or just deflected off the bat. */
function ballInDelivery(a: DeliveryAnim, t: number): V3 | null {
  if (t < a.release) return null;
  const perfect = a.release + a.flight;
  const incoming = (tt: number): V3 => {
    const p = (tt - a.release) / a.flight;
    if (p <= 1) return a.path.at(p);
    // Past the bat: ease toward the stumps (a little slow-motion drama) or on to the keeper.
    const stumps = a.delivery.line === "stumps";
    const k = 1 - Math.exp(-(tt - perfect) / (stumps ? 170 : 260));
    const [x, y, z] = a.path.arrive;
    return [x, lerp(y, stumps ? STRIKER_Y + 0.22 : STRIKER_Y - 2.2, k), z + (stumps ? 0 : 0.25 * k)];
  };
  if (a.contact && a.swungAt !== null) {
    const ct = Math.max(a.swungAt, perfect);
    if (t >= ct) {
      // Off the bat, heading roughly where the shot was aimed until the server confirms.
      const c = incoming(ct);
      const ang = a.swingDir === "leg" ? -0.8 : a.swingDir === "off" ? 0.8 : 0;
      const s = (t - ct) / 1000;
      return [c[0] + Math.sin(ang) * 9 * s, c[1] + Math.cos(ang) * 9 * s, c[2] + 0.8 * s];
    }
  }
  return incoming(t);
}

/** When the delivery hands over to the result animation. */
function resultReadyAt(a: DeliveryAnim): number {
  const perfect = a.release + a.flight;
  return a.contact && a.swungAt !== null ? Math.max(a.swungAt, perfect) : perfect + 140;
}

const releaseY = (d: Delivery) => RELEASE_AT.y - (d.kind === "no_ball" ? 0.3 : 0); // overstepping!

function bowlerInDelivery(a: DeliveryAnim, t: number): Placed & { ballInHand: boolean; alpha: number } {
  const ry = releaseY(a.delivery);
  const actStart = a.release - ACTION_PRE;
  const pre = { x: RELEASE_AT.x + 0.15, y: ry + 1.35 };
  const alpha = a.fadeIn ? smooth((t - a.start) / 220) : 1;

  if (t < actStart) {
    const q = clamp((t - a.start) / (actStart - a.start), 0, 1);
    const e = 0.4 * q + 0.6 * q * q; // accelerating into the crease
    const x = lerp(a.runFrom.x, pre.x, e);
    const y = lerp(a.runFrom.y, pre.y, e);
    const dist = Math.hypot(x - a.runFrom.x, y - a.runFrom.y);
    return { pose: runPose((dist / 1.3) * Math.PI, a.spin ? 0.85 : 1.1), x, y, yaw: TOWARD_CAMERA, ballInHand: true, alpha };
  }
  if (t < a.release + ACTION_POST) {
    const u = clamp((t - actStart) / (ACTION_PRE + ACTION_POST), 0, 1);
    let x: number;
    let y: number;
    if (u < RELEASE_U) {
      const k = u / RELEASE_U;
      x = lerp(pre.x, RELEASE_AT.x, k);
      y = lerp(pre.y, ry, k);
    } else {
      const k = (u - RELEASE_U) / (1 - RELEASE_U);
      x = lerp(RELEASE_AT.x, RELEASE_AT.x + 0.3, k);
      y = lerp(ry, ry - 1.2, k);
    }
    return { pose: bowlPose(u), x, y, yaw: TOWARD_CAMERA, ballInHand: t < a.release, alpha };
  }
  // Follow-through: jog on, peeling away from the pitch.
  const from = { x: RELEASE_AT.x + 0.3, y: ry - 1.2 };
  const s = clamp((t - a.release - ACTION_POST) / 800, 0, 1);
  const e = 1 - (1 - s) * (1 - s);
  const x = lerp(from.x, FOLLOW_END.x, e);
  const y = lerp(from.y, FOLLOW_END.y, e);
  if (s >= 1) return { pose: STAND, x, y, yaw: TOWARD_CAMERA, ballInHand: false, alpha: 1 };
  const dist = Math.hypot(x - from.x, y - from.y);
  return {
    pose: runPose((dist / 1.1) * Math.PI, lerp(1, 0.35, s)),
    x,
    y,
    yaw: Math.atan2(FOLLOW_END.y - from.y, FOLLOW_END.x - from.x),
    ballInHand: false,
    alpha: 1,
  };
}

function isSpinner(m: MatchState): boolean {
  const inn = currentInnings(m);
  if (!inn) return false;
  const name = inn.bowlers[inn.current_bowler]?.name;
  return m.teams[inn.bowling].players.find((p) => p.name === name)?.bowling === "spin";
}

// --- the component ---------------------------------------------------------------------------

const Stadium = forwardRef<StadiumHandle, Props>(function Stadium({ match, aim, interactive }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const anim = useRef<Anim>({ kind: "idle", since: 0, from: null });
  const aimRef = useRef<Direction>(aim);
  const matchRef = useRef<MatchState>(match);
  const interactiveRef = useRef(interactive);
  // Scene memory that outlives a single ball.
  const scene = useRef({
    bowler: { ...MARKS.pace },
    bowlerWalk: 0,
    lastStriker: null as Placed | null,
    stumps: { hitAt: null } as StumpsState,
    signal: null as { signal: Signal; from: number; until: number } | null,
    flash: null as { text: string; color: string; roar: boolean; from: number; until: number } | null,
    trail: [] as { x: number; y: number }[],
    fireworks: null as Fireworks | null,
    lastFrame: 0,
  });

  useEffect(() => {
    aimRef.current = aim;
  }, [aim]);
  useEffect(() => {
    matchRef.current = match;
  }, [match]);
  useEffect(() => {
    interactiveRef.current = interactive;
  }, [interactive]);

  const startDelivery = (delivery: Delivery, meter: boolean, scripted: boolean): DeliveryAnim => {
    const t = now();
    const sc = scene.current;
    const spin = isSpinner(matchRef.current);
    const mark = spin ? MARKS.spin : MARKS.pace;
    const ry = releaseY(delivery);
    // Start from wherever the bowler walked back to, if he's in his run-up; otherwise his mark.
    const inRunUp = sc.bowler.y > ry + 3 && Math.abs(sc.bowler.x - mark.x) < 2.5;
    const runFrom = inRunUp ? { ...sc.bowler } : { ...mark };
    const runDist = Math.hypot(runFrom.x - RELEASE_AT.x, runFrom.y - ry);
    const runup = clamp((runDist / (spin ? 5.5 : 11)) * 1000, 450, 1400) + ACTION_PRE;
    const flight = Math.round(165000 / delivery.speed_kph) + 320; // ~1.4s pace, ~1.7s spin
    const releasePoint = jointAt(bowlPose(RELEASE_U), RELEASE_AT.x, ry, TOWARD_CAMERA, "rHand");
    sc.stumps = { hitAt: null };
    sc.trail = [];
    return {
      kind: "delivery",
      start: t,
      release: t + runup,
      flight,
      delivery,
      spin,
      path: incomingPath(delivery, releasePoint, spin),
      runFrom,
      fadeIn: !inRunUp && Math.hypot(sc.bowler.x - mark.x, sc.bowler.y - mark.y) > 1.5,
      meter,
      scripted,
      swungAt: null,
      swingDir: "straight",
      contact: false,
      resolve: null,
      pending: null,
    };
  };

  // Resolve the swing: record timing; the result animation takes over later.
  const swing = () => {
    const a = anim.current;
    const t = now();
    if (a.kind !== "delivery" || a.scripted || a.swungAt !== null || !a.resolve || t < a.release) return;
    a.swungAt = t;
    a.swingDir = aimRef.current;
    const timing = Math.round(t - (a.release + a.flight));
    a.contact = a.delivery.kind !== "wide" && Math.abs(timing) <= TIMING.edge;
    a.resolve(timing);
    a.resolve = null;
  };

  useImperativeHandle(ref, () => ({
    bowl: (delivery) =>
      new Promise<number | null>((resolve) => {
        const a = startDelivery(delivery, interactiveRef.current, false);
        a.resolve = resolve;
        anim.current = a;
      }),
    showResult: (result) =>
      new Promise<void>((resolve) => {
        const a = anim.current;
        if (a.kind === "delivery") a.pending = { result, done: resolve };
        else resolve();
      }),
    replay: (result) =>
      new Promise<void>((resolve) => {
        const a = startDelivery(result.delivery, false, true);
        if (result.swung && result.timing_ms !== null) {
          a.swungAt = a.release + a.flight + result.timing_ms;
          a.swingDir = shotDir(result, "straight");
        }
        a.contact = result.contact !== "none";
        a.pending = { result, done: resolve };
        anim.current = a;
      }),
  }));

  // Keyboard input for the swing.
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
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = DESIGN_W * dpr;
    canvas.height = DESIGN_H * dpr;

    // The stadium never changes: paint it once.
    const backdrop = document.createElement("canvas");
    backdrop.width = canvas.width;
    backdrop.height = canvas.height;
    const bctx = backdrop.getContext("2d")!;
    bctx.scale(dpr, dpr);
    paintBackdrop(bctx);

    const sc = scene.current;
    sc.fireworks ??= new Fireworks();
    const fireworks = sc.fireworks;
    let raf = 0;

    const beginResult = (d: DeliveryAnim, t: number): ResultAnim => {
      const { result, done } = d.pending!;
      const from = ballInDelivery(d, t) ?? d.path.at(1);
      const path = outgoingPath(result, from);
      if (path.hitStumpsAt !== null) sc.stumps = { hitAt: t + path.hitStumpsAt * path.dur };
      const sig = signalFor(result);
      sc.signal = sig ? { signal: sig, from: t + path.dur * 0.55, until: t + path.dur + 2000 } : null;
      const fl = flashFor(result);
      sc.flash = fl ? { ...fl, from: t + path.dur * 0.55, until: t + path.dur + 2600 } : null;
      if (result.bat_runs === 6) fireworks.show(t + path.dur * 0.8);
      sc.trail = [];
      return {
        kind: "result",
        start: t,
        result,
        path,
        swungAt: d.swungAt,
        swingDir: d.swingDir,
        preSwing: d.swungAt !== null ? readyPose(d, d.swungAt) : null,
        hold: strikerInDelivery(d, t),
        runs: runsToRun(result),
        done,
      };
    };

    const frame = () => {
      const t = now();
      const dt = sc.lastFrame ? Math.min(0.05, (t - sc.lastFrame) / 1000) : 0;
      sc.lastFrame = t;
      const m = matchRef.current;
      const inn = currentInnings(m);
      const batting = inn?.batting ?? m.user_team;
      const bowling = inn?.bowling ?? (m.user_team === "IND" ? "PAK" : "IND");
      const batKit = KITS[batting];
      const bowlKit = KITS[bowling];

      // --- phase changes
      let a = anim.current;
      if (a.kind === "delivery") {
        const perfect = a.release + a.flight;
        if (a.resolve && a.swungAt === null && t > perfect + TIMING.graceLate) {
          a.resolve(null);
          a.resolve = null;
        }
        if (a.pending && t >= resultReadyAt(a)) a = anim.current = beginResult(a, t);
      }
      if (a.kind === "result" && t - a.start >= a.path.dur + 220) {
        const done = a.done;
        a = anim.current = { kind: "idle", since: t, from: sc.lastStriker };
        done();
      }

      // --- the ball
      let ball: V3 | null = null;
      if (a.kind === "delivery") ball = ballInDelivery(a, t);
      else if (a.kind === "result") ball = a.path.at(Math.min(1, (t - a.start) / a.path.dur));

      // --- striker
      let striker: Placed;
      if (a.kind === "delivery") {
        striker = { pose: strikerInDelivery(a, t), ...HOME, yaw: 0 };
      } else if (a.kind === "result") {
        const s = (t - a.start - 260) / 1000;
        if (a.runs > 0 && s > 0) {
          const d = Math.min(9, 6.8 * s);
          striker = { pose: withBat(runPose((d / 1.25) * Math.PI, 1)), x: HOME.x, y: HOME.y + d, yaw: UP_THE_PITCH };
        } else {
          const pose = a.swungAt !== null && a.preSwing ? swingPose(a.preSwing, a.swungAt, a.swingDir, t) : a.hold;
          striker = { pose, ...HOME, yaw: 0 };
        }
      } else {
        const k = smooth((t - a.since) / 450);
        const from = a.from;
        striker =
          from && from.yaw === 0 && k < 1
            ? { pose: blend(from.pose, BAT_STANCE, k), ...HOME, yaw: 0 }
            : { pose: tap(BAT_STANCE, t), ...HOME, yaw: 0 };
      }
      sc.lastStriker = striker;

      // --- non-striker
      let nonStriker: Placed;
      const backedUp = NS_HOME.y - 1.1;
      if (a.kind === "delivery") {
        const s = (t - a.release) / 700;
        if (s <= 0) nonStriker = { pose: NON_STRIKER, ...NS_HOME, yaw: TOWARD_CAMERA };
        else if (s < 1) {
          const y = NS_HOME.y - 1.1 * smooth(s);
          nonStriker = { pose: withBat(runPose(((NS_HOME.y - y) / 0.7) * Math.PI, 0.4)), x: NS_HOME.x, y, yaw: TOWARD_CAMERA };
        } else nonStriker = { pose: NON_STRIKER, x: NS_HOME.x, y: backedUp, yaw: TOWARD_CAMERA };
      } else if (a.kind === "result") {
        const s = (t - a.start - 260) / 1000;
        if (a.runs > 0 && s > 0) {
          const d = Math.min(9, 6.8 * s);
          nonStriker = { pose: withBat(runPose((d / 1.25) * Math.PI, 1)), x: NS_HOME.x, y: backedUp - d, yaw: TOWARD_CAMERA };
        } else nonStriker = { pose: NON_STRIKER, x: NS_HOME.x, y: backedUp, yaw: TOWARD_CAMERA };
      } else {
        nonStriker = { pose: NON_STRIKER, ...NS_HOME, yaw: TOWARD_CAMERA };
      }

      // --- bowler
      let bowler: Placed & { ballInHand: boolean; alpha: number };
      if (a.kind === "delivery") {
        bowler = bowlerInDelivery(a, t);
        sc.bowler = { x: bowler.x, y: bowler.y };
      } else if (a.kind === "result") {
        const r = a.result;
        const pose = r.wicket ? lift(CELEBRATE, 0.12 * Math.abs(Math.sin(t / 130))) : r.bat_runs >= 4 ? DESPAIR : STAND;
        bowler = { pose, ...FOLLOW_END, yaw: TOWARD_CAMERA, ballInHand: false, alpha: 1 };
        sc.bowler = { ...FOLLOW_END };
      } else {
        // Walk back to the mark for the next ball.
        const mark = isSpinner(m) ? MARKS.spin : MARKS.pace;
        const b = sc.bowler;
        const dx = mark.x - b.x;
        const dy = mark.y - b.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0.05) {
          const step = Math.min(dist, 3.6 * dt);
          b.x += (dx / dist) * step;
          b.y += (dy / dist) * step;
          sc.bowlerWalk += step;
          bowler = { pose: runPose((sc.bowlerWalk / 0.9) * Math.PI, 0.5), x: b.x, y: b.y, yaw: Math.atan2(dy, dx), ballInHand: true, alpha: 1 };
        } else {
          bowler = { pose: STAND, x: b.x, y: b.y, yaw: TOWARD_CAMERA, ballInHand: true, alpha: 1 };
        }
      }

      // --- umpire
      let umpire: Pose;
      const sig = sc.signal && t >= sc.signal.from && t < sc.signal.until ? sc.signal.signal : null;
      if (sig) umpire = umpirePose(sig, t, 0);
      else if (a.kind === "delivery") {
        const crouch = smooth((t - (a.release - 700)) / 300) * (1 - smooth((t - (a.release + a.flight + 200)) / 300));
        umpire = umpirePose(null, t, crouch);
      } else umpire = umpirePose(null, t, 0);

      // --- fielders
      const shot = a.kind === "result" ? a.result.shot : null;
      const caught = a.kind === "result" && a.result.wicket?.kind === "caught";
      const fielders: Figure[] = m.field.map((fp, i) => {
        const base = fieldToWorld(fp.angle, fp.distance);
        const toward = Math.atan2(HOME.y - base.y, HOME.x - base.x);
        const walkIn = (k: number) => ({ x: base.x + Math.cos(toward) * 1.2 * k, y: base.y + Math.sin(toward) * 1.2 * k });
        const lookAtBall: V3 | undefined = ball ?? undefined;

        if (a.kind === "delivery") {
          const r = smooth((t - (a.release - 900)) / 600);
          const at = walkIn(r);
          return { pose: blend(STAND, READY, r), ...at, yaw: toward, kit: bowlKit, gear: "field", look: lookAtBall };
        }
        if (a.kind === "result") {
          const from = walkIn(1);
          const p = (t - a.start) / a.path.dur;
          if (shot && shot.fielder === i) {
            const target = { x: a.path.end[0], y: a.path.end[1] };
            const dx = target.x - from.x;
            const dy = target.y - from.y;
            const dist = Math.hypot(dx, dy);
            const s = Math.max(0, (t - a.start - 150) / 1000);
            const goal = Math.max(0, dist - (caught ? 0 : 0.6));
            const travel = Math.min(goal, 7.2 * s);
            const x = from.x + (dist ? (dx / dist) * travel : 0);
            const y = from.y + (dist ? (dy / dist) * travel : 0);
            const moving = travel < goal - 0.05 && s > 0;
            const pose = caught && p > 0.72 ? CATCH : moving ? runPose((travel / 1.3) * Math.PI, 1) : p > 0.9 && !caught ? PICKUP : READY;
            const yaw = moving ? Math.atan2(dy, dx) : ball ? Math.atan2(ball[1] - y, ball[0] - x) : toward;
            return { pose, x, y, yaw, kit: bowlKit, gear: "field", look: lookAtBall, highlight: true };
          }
          return { pose: blend(READY, STAND, smooth((t - a.start) / 500)), ...from, yaw: toward, kit: bowlKit, gear: "field", look: lookAtBall };
        }
        return { pose: STAND, ...base, yaw: toward, kit: bowlKit, gear: "field" };
      });

      // --- draw ----------------------------------------------------------------------------
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.drawImage(backdrop, 0, 0, DESIGN_W, DESIGN_H);

      const flash = sc.flash && t >= sc.flash.from && t < sc.flash.until ? sc.flash : null;
      const team = m.teams[batting].name.toUpperCase();
      drawBigScreen(
        ctx,
        inn
          ? { top: `${team}  ·  ${overs(inn.legal_balls)} OV`, main: `${inn.runs}/${inn.wickets}`, accent: flash?.color ?? "#fff", flash: flash?.text ?? null }
          : { top: "5-OVER CLASH", main: "IND v PAK", accent: "#fff", flash: null },
        t,
      );
      drawFlashes(ctx, t, flash?.roar ? 1 : 0);
      fireworks.draw(ctx, t);

      const strikerName = inn ? inn.batters[inn.striker]?.name : undefined;
      const figures: Figure[] = [
        { pose: umpire, x: UMPIRE_AT.x, y: UMPIRE_AT.y, yaw: TOWARD_CAMERA, kit: UMPIRE_KIT, gear: "umpire", look: [0, STRIKER_Y, 1] },
        { ...bowler, kit: bowlKit, gear: "field", look: ball ?? [0, STRIKER_Y, 1] },
        { ...nonStriker, kit: batKit, gear: "bat", look: [0, STRIKER_Y, 1.2] },
        ...fielders,
        {
          ...striker,
          kit: batKit,
          gear: "bat",
          look: ball ?? [0, BOWLER_Y, 1.6],
          name: strikerName ? surnameOf(strikerName) : undefined,
          number: strikerName ? shirtNumber(strikerName) : undefined,
        },
      ];

      for (const f of figures) drawShadows(ctx, f.x, f.y, 1.75, f.alpha ?? 1);
      if (ball) drawBallShadow(ctx, ball);

      const items: { d: number; draw: () => void }[] = figures.map((f) => ({ d: depthOf(f.y), draw: () => drawFigure(ctx, f) }));
      items.push({ d: depthOf(BOWLER_Y), draw: () => drawStumps(ctx, BOWLER_Y, null, t) });
      items.push({ d: depthOf(STRIKER_Y), draw: () => drawStumps(ctx, STRIKER_Y, sc.stumps, t) });
      if (ball && inFront(ball[1], 1.2)) {
        const s = project(ball[0], ball[1], ball[2]);
        const trail = sc.trail.slice();
        sc.trail.push({ x: s.x, y: s.y });
        if (sc.trail.length > 6) sc.trail.shift();
        const b = ball;
        items.push({ d: depthOf(b[1]) - 0.05, draw: () => drawBall(ctx, b, trail) });
      } else sc.trail = [];
      items.sort((p, q) => q.d - p.d);
      for (const it of items) it.draw();

      if (a.kind === "delivery" && a.meter && t >= a.release) {
        const swung = a.swungAt === null ? null : Math.round(a.swungAt - (a.release + a.flight));
        drawTimingMeter(ctx, (t - a.release) / a.flight, a.flight, swung);
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-xl bg-[#0a1236] ring-1 ring-white/10 shadow-2xl">
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
