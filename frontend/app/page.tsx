"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import Banner from "@/components/Banner";
import Flag from "@/components/Flag";
import HeroScene from "@/components/HeroScene";
import PauseMenu from "@/components/PauseMenu";
import Scorecard from "@/components/Scorecard";
import Stadium, { type StadiumHandle } from "@/components/Stadium";
import { ApiError, api } from "@/lib/api";
import { TEAM_STYLE, currentInnings } from "@/lib/cricket";
import type { CoinSide, Direction, MatchState, TeamCode } from "@/types/match";

const AIMS: { value: Direction; label: string; key: string }[] = [
  { value: "leg", label: "Leg side", key: "←" },
  { value: "straight", label: "Straight", key: "↑" },
  { value: "off", label: "Off side", key: "→" },
];

export default function Page() {
  const [match, setMatch] = useState<MatchState | null>(null);
  const [aim, setAim] = useState<Direction>("straight");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultSeq, setResultSeq] = useState(0);
  const [paused, setPaused] = useState(false);

  const stadium = useRef<StadiumHandle>(null);
  const aimRef = useRef<Direction>(aim);
  const matchRef = useRef<MatchState | null>(match);
  const pausedRef = useRef(false);
  const skipRef = useRef(false); // ask the computer-innings loop to fast-forward
  useEffect(() => {
    aimRef.current = aim;
  }, [aim]);
  useEffect(() => {
    matchRef.current = match;
  }, [match]);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const run = useCallback(async (fn: () => Promise<MatchState>) => {
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong.");
      throw e;
    }
  }, []);

  const userBatting = !!match && match.user_batting && !currentInnings(match)?.complete;

  // Play a single ball: delivery -> swing/wait -> outcome animation -> new score.
  const playBall = useCallback(async () => {
    if (!match || !stadium.current) return;
    setBusy(true);
    try {
      const withBall = await run(() => api.delivery(match.id));
      const timing = await stadium.current.bowl(withBall.pending_delivery!);
      const next = await run(() => api.play(match.id, timing, aimRef.current));
      if (next.last_ball) {
        await stadium.current.showResult(next.last_ball);
        setResultSeq((s) => s + 1);
      }
      setMatch(next);
    } finally {
      setBusy(false);
    }
  }, [match, run]);

  // Fast-forward the rest of the opponent's innings (the engine won't skip your
  // own). While the computer bats, the auto-loop performs the skip so there's no
  // race over match state.
  const skipInnings = useCallback(() => {
    const m = matchRef.current;
    const inn = m ? currentInnings(m) : null;
    if (!m || !inn || inn.complete || inn.batting === m.user_team) return;
    setPaused(false);
    skipRef.current = true;
  }, []);

  // Restart: a fresh match with the same team, back to the toss.
  const restart = useCallback(() => {
    const m = matchRef.current;
    if (!m) return;
    setPaused(false);
    skipRef.current = false;
    setError(null);
    setBusy(true);
    run(() => api.createMatch(m.user_team))
      .then((fresh) => {
        setMatch(fresh);
        setResultSeq(0);
      })
      .finally(() => setBusy(false));
  }, [run]);

  // Quit back to the main menu.
  const quit = useCallback(() => {
    setPaused(false);
    skipRef.current = false;
    setMatch(null);
    setError(null);
  }, []);

  // Esc toggles the pause menu, but only during live play. (Every way out of the
  // menu — resume, skip, restart, quit — clears `paused`, so it never leaks into
  // another phase.)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const m = matchRef.current;
      if (m && (m.phase === "innings1" || m.phase === "innings2")) setPaused((p) => !p);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // A key that stays constant for the whole of a computer innings, so the
  // auto-play effect below runs exactly once per such innings (and not again
  // every time we setMatch after a ball).
  const activeInn = match ? currentInnings(match) : null;
  const computerInningsKey =
    match &&
    activeInn &&
    (match.phase === "innings1" || match.phase === "innings2") &&
    !activeInn.complete &&
    activeInn.batting !== match.user_team
      ? `${match.id}:${match.innings.length}`
      : null;

  // Play out the computer's innings automatically, one ball at a time.
  useEffect(() => {
    if (!computerInningsKey) return;
    let cancelled = false;
    (async () => {
      let state = matchRef.current!;
      setBusy(true);
      try {
        while (!cancelled) {
          const inn = currentInnings(state);
          if (!inn || inn.complete || inn.batting === state.user_team) break;
          // Skip: fast-forward the rest of this (opponent's) innings at once.
          if (skipRef.current) {
            skipRef.current = false;
            const done = await run(() => api.simulate(state.id));
            if (cancelled) break;
            state = done;
            setMatch(done);
            break;
          }
          // Pause: hold here until resumed (or skipped, or cancelled).
          if (pausedRef.current) {
            await new Promise((r) => setTimeout(r, 150));
            continue;
          }
          await run(() => api.delivery(state.id));
          if (cancelled) break;
          const next = await run(() => api.play(state.id, null, "straight"));
          if (cancelled) break;
          if (next.last_ball) {
            // The outcome is known; play the whole ball (run-up → shot → result).
            await stadium.current?.replay(next.last_ball);
            if (cancelled) break; // a restart/quit may have landed during the replay
            setResultSeq((s) => s + 1);
          }
          state = next;
          setMatch(next);
          await new Promise((r) => setTimeout(r, 350));
        }
      } catch {
        /* surfaced via setError */
      } finally {
        // Always clear busy when the loop exits — including when the innings
        // ends and this effect is cancelled — so the innings-break button and
        // the next innings' controls are not left disabled.
        setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [computerInningsKey, run]);

  // Global arrow keys to aim while batting.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setAim("leg");
      else if (e.key === "ArrowRight") setAim("off");
      else if (e.key === "ArrowUp") setAim("straight");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!match) return <StartScreen onStart={(t) => run(() => api.createMatch(t)).then(setMatch)} error={error} />;

  const inn = currentInnings(match);
  const inPlay = match.phase === "innings1" || match.phase === "innings2";
  const opponentBatting = !!inn && !inn.complete && inn.batting !== match.user_team;

  return (
    <main className="mx-auto flex h-[100dvh] w-full max-w-5xl flex-col gap-2 px-3 py-2 sm:px-4 sm:py-3">
      <header className="flex shrink-0 items-center justify-between">
        <h1 className="text-lg font-black tracking-tight text-white">
          <span className="text-blue-400">India</span>
          <span className="mx-1.5 text-white/40">vs</span>
          <span className="text-green-400">Pakistan</span>
        </h1>
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/70">
          You play as {match.teams[match.user_team].name} · {match.overs_per_innings} overs
        </span>
      </header>

      <div className="relative min-h-0 flex-1">
        {/* interactive follows whose innings it is (and is off while paused) —
            NOT `busy`, which is true for the whole delivery and would disable
            the swing mid-ball. */}
        <Stadium ref={stadium} match={match} aim={aim} interactive={!!userBatting && !paused} />
        <Banner result={match.last_ball} seq={resultSeq} />
        {match.free_hit && match.phase !== "finished" && (
          <span className="absolute left-3 top-3 z-10 animate-pulse rounded-full bg-fuchsia-600 px-3 py-1 text-xs font-bold text-white shadow-lg">
            FREE HIT
          </span>
        )}
        {inPlay && !paused && (
          <button
            onClick={() => setPaused(true)}
            aria-label="Pause"
            className="absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/20 backdrop-blur transition hover:bg-black/70"
          >
            <span className="text-sm leading-none">❚❚</span> Pause
          </button>
        )}
        {inPlay && opponentBatting && !paused && (
          <button
            onClick={skipInnings}
            className="absolute bottom-3 right-3 z-10 flex items-center gap-1.5 rounded-full bg-amber-500/90 px-3 py-1.5 text-xs font-bold text-black ring-1 ring-black/10 backdrop-blur transition hover:bg-amber-400"
          >
            Skip innings ▶▶
          </button>
        )}
        <PauseMenu
          open={paused}
          match={match}
          canSkip={opponentBatting}
          onResume={() => setPaused(false)}
          onSkip={skipInnings}
          onRestart={restart}
          onQuit={quit}
        />
      </div>

      {inn && match.phase !== "finished" && (
        <div className="shrink-0">
          <Scorecard match={match} innings={inn} />
        </div>
      )}

      <div className="shrink-0">
        <Controls
          match={match}
          aim={aim}
          setAim={setAim}
          busy={busy}
          userBatting={!!userBatting}
          onBowl={playBall}
          onToss={(c) => run(() => api.toss(match.id, c)).then(setMatch)}
          onNextInnings={() => run(() => api.nextInnings(match.id)).then(setMatch)}
          onPlayAgain={() => setMatch(null)}
        />
      </div>

      {error && (
        <p className="shrink-0 rounded-lg bg-red-500/15 px-3 py-2 text-center text-sm text-red-200">
          {error}
        </p>
      )}
    </main>
  );
}

function Controls(props: {
  match: MatchState;
  aim: Direction;
  setAim: (d: Direction) => void;
  busy: boolean;
  userBatting: boolean;
  onBowl: () => void;
  onToss: (c: CoinSide) => void;
  onNextInnings: () => void;
  onPlayAgain: () => void;
}) {
  const { match, aim, setAim, busy, userBatting, onBowl } = props;

  if (match.phase === "toss") {
    return (
      <Panel>
        <p className="text-sm text-white/80">
          Call the toss — the winner bats first, the loser chases.
        </p>
        <div className="flex gap-3">
          {(["heads", "tails"] as CoinSide[]).map((c) => (
            <button
              key={c}
              disabled={busy}
              onClick={() => props.onToss(c)}
              className="flex-1 rounded-lg bg-white/10 px-4 py-3 font-semibold capitalize text-white transition hover:bg-white/20 disabled:opacity-50"
            >
              {c}
            </button>
          ))}
        </div>
      </Panel>
    );
  }

  if (match.phase === "innings_break") {
    const [first] = match.innings;
    return (
      <Panel>
        <p className="text-center text-sm text-white/80">
          Innings break — {match.teams[first.batting].name} made{" "}
          <b className="text-white">
            {first.runs}/{first.wickets}
          </b>
          . Target to chase: <b className="text-amber-300">{match.target}</b>.
        </p>
        <button
          onClick={props.onNextInnings}
          disabled={busy}
          className="w-full rounded-lg bg-amber-500 px-4 py-3 font-bold text-black transition hover:bg-amber-400 disabled:opacity-50"
        >
          Start the chase
        </button>
      </Panel>
    );
  }

  if (match.phase === "finished") {
    return (
      <Panel>
        <div className="text-center">
          <div className="flex justify-center">
            {match.winner ? (
              <Flag team={match.winner} className="h-8 w-12" />
            ) : (
              <span className="text-3xl">🤝</span>
            )}
          </div>
          <p className="mt-1 text-lg font-bold text-white">{match.result}</p>
          <div className="mt-2 flex justify-center gap-6 text-sm text-white/70">
            {match.innings.map((i, k) => (
              <span key={k}>
                {match.teams[i.batting].name}{" "}
                <b className="text-white">
                  {i.runs}/{i.wickets}
                </b>
              </span>
            ))}
          </div>
        </div>
        <button
          onClick={props.onPlayAgain}
          className="w-full rounded-lg bg-blue-600 px-4 py-3 font-bold text-white transition hover:bg-blue-500"
        >
          Play again
        </button>
      </Panel>
    );
  }

  // In play.
  if (!userBatting) {
    return (
      <Panel>
        <p className="text-center text-sm text-white/70">
          {match.teams[currentInnings(match)!.bowling].name} are bowling — watch the{" "}
          {match.teams[currentInnings(match)!.batting].name} innings.
        </p>
      </Panel>
    );
  }

  return (
    <Panel>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-1 gap-2">
          {AIMS.map((a) => (
            <button
              key={a.value}
              onClick={() => setAim(a.value)}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
                aim === a.value
                  ? "bg-white text-slate-900"
                  : "bg-white/10 text-white/80 hover:bg-white/20"
              }`}
            >
              <span className="mr-1 opacity-60">{a.key}</span>
              {a.label}
            </button>
          ))}
        </div>
        <button
          onClick={onBowl}
          disabled={busy}
          className="rounded-lg bg-blue-600 px-6 py-3 font-bold text-white shadow-lg transition hover:bg-blue-500 disabled:opacity-50 sm:w-48"
        >
          {busy ? "…" : "Bowl next ball"}
        </button>
      </div>
      <p className="text-center text-xs text-white/50">
        Pick where to hit, press <b>Bowl</b>, then tap <b>SPACE</b> (or the pitch) as the ball
        arrives. Time it right for a boundary.
      </p>
    </Panel>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-slate-900/90 p-4 ring-1 ring-white/10">
      {children}
    </div>
  );
}

function StartScreen({ onStart, error }: { onStart: (t: TeamCode) => void; error: string | null }) {
  return (
    <main className="relative mx-auto flex h-[100dvh] w-full max-w-5xl flex-col overflow-hidden">
      {/* Cinematic looping hero behind everything. */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <HeroScene className="h-full w-full scale-[1.12] object-cover [object-position:50%_44%]" />
        {/* Scrims: darken top and bottom so the title and buttons read clearly. */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#060b22]/85 via-transparent to-[#060b22]/95" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#060b22] via-transparent to-transparent" />
      </div>

      <div className="flex flex-1 flex-col items-center justify-between px-4 py-6 text-center sm:py-10">
        <div className="animate-[pop_0.5s_ease-out]">
          <div className="mb-2 flex items-center justify-center gap-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-amber-300/90">
            <span className="h-px w-6 bg-amber-300/50" />
            The Arch-Rivals · T20
            <span className="h-px w-6 bg-amber-300/50" />
          </div>
          <h1 className="text-4xl font-black leading-none tracking-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)] sm:text-6xl">
            Indo-Pak{" "}
            <span className="bg-gradient-to-r from-amber-300 via-orange-400 to-amber-500 bg-clip-text text-transparent">
              Cricket Clash
            </span>
          </h1>
          <p className="mt-3 text-sm text-white/70 sm:text-base">
            India vs Pakistan · 5 overs a side · winner of the toss bats first
          </p>
        </div>

        <div className="w-full max-w-md">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/60">
            Choose your team
          </p>
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {(["IND", "PAK"] as TeamCode[]).map((t) => {
              const s = TEAM_STYLE[t];
              return (
                <button
                  key={t}
                  onClick={() => onStart(t)}
                  className={`group relative flex flex-col items-center gap-3 overflow-hidden rounded-2xl ${s.bg} p-5 text-white shadow-2xl ring-1 ring-white/20 transition hover:scale-[1.04] hover:ring-white/50`}
                >
                  <span className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/15 to-transparent" />
                  <Flag team={t} className="h-16 w-24 shadow-lg ring-1 ring-black/30 transition group-hover:scale-110" />
                  <span className="text-lg font-bold">{t === "IND" ? "India" : "Pakistan"}</span>
                </button>
              );
            })}
          </div>
          <Link
            href="/stats"
            className="mt-4 inline-block rounded-full bg-white/10 px-5 py-2 text-sm font-medium text-white/80 backdrop-blur transition hover:bg-white/20"
          >
            📊 View career stats
          </Link>
          {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
        </div>
      </div>
    </main>
  );
}
