"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import Banner from "@/components/Banner";
import Flag from "@/components/Flag";
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

  const stadium = useRef<StadiumHandle>(null);
  const aimRef = useRef<Direction>(aim);
  const matchRef = useRef<MatchState | null>(match);
  useEffect(() => {
    aimRef.current = aim;
  }, [aim]);
  useEffect(() => {
    matchRef.current = match;
  }, [match]);

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
          const d = await run(() => api.delivery(state.id));
          if (cancelled) break;
          await stadium.current?.bowl(d.pending_delivery!);
          const next = await run(() => api.play(state.id, null, "straight"));
          if (cancelled) break;
          if (next.last_ball) {
            await stadium.current?.showResult(next.last_ball);
            setResultSeq((s) => s + 1);
          }
          state = next;
          setMatch(next);
          await new Promise((r) => setTimeout(r, 450));
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
        {/* interactive follows only whose innings it is — NOT `busy`, which is
            true for the whole delivery and would disable the swing mid-ball. */}
        <Stadium ref={stadium} match={match} aim={aim} interactive={!!userBatting} />
        <Banner result={match.last_ball} seq={resultSeq} />
        {match.free_hit && match.phase !== "finished" && (
          <span className="absolute left-3 top-3 z-10 animate-pulse rounded-full bg-fuchsia-600 px-3 py-1 text-xs font-bold text-white shadow-lg">
            FREE HIT
          </span>
        )}
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
    <main className="mx-auto flex min-h-full max-w-xl flex-col items-center justify-center gap-8 px-4 py-16 text-center">
      <div>
        <h1 className="text-4xl font-black tracking-tight text-white sm:text-5xl">
          Indo-Pak <span className="text-amber-400">Cricket Clash</span>
        </h1>
        <p className="mt-2 text-white/60">The arch-rivals, 5 overs a side. Pick your team.</p>
      </div>
      <div className="grid w-full grid-cols-2 gap-4">
        {(["IND", "PAK"] as TeamCode[]).map((t) => {
          const s = TEAM_STYLE[t];
          return (
            <button
              key={t}
              onClick={() => onStart(t)}
              className={`group flex flex-col items-center gap-3 rounded-2xl ${s.bg} p-6 text-white shadow-xl ring-2 ring-transparent transition hover:scale-[1.03]`}
            >
              <Flag team={t} className="h-16 w-24 shadow-lg transition group-hover:scale-110" />
              <span className="text-lg font-bold">{t === "IND" ? "India" : "Pakistan"}</span>
            </button>
          );
        })}
      </div>
      <Link
        href="/stats"
        className="rounded-full bg-white/10 px-5 py-2 text-sm font-medium text-white/80 transition hover:bg-white/20"
      >
        📊 View career stats
      </Link>
      {error && <p className="text-sm text-red-300">{error}</p>}
    </main>
  );
}
