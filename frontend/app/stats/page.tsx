"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";

import Flag from "@/components/Flag";
import { ApiError, type BattingStat, type BowlingStat, getStats } from "@/lib/api";
import { overs, surname } from "@/lib/cricket";
import type { TeamCode } from "@/types/match";

const fmt = (v: number | string | null, dp = 2) =>
  v === null || v === undefined || v === "" ? "—" : Number(v).toFixed(dp);

function TeamCell({ team }: { team: TeamCode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Flag team={team} className="h-4 w-6" />
      <span className="text-white/50">{team}</span>
    </span>
  );
}

function Th({ children, right }: { children: ReactNode; right?: boolean }) {
  return (
    <th
      className={`px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white/50 ${
        right ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function Td({ children, right }: { children: ReactNode; right?: boolean }) {
  return (
    <td className={`px-3 py-2 ${right ? "text-right font-mono tabular-nums" : "text-left"}`}>
      {children}
    </td>
  );
}

export default function StatsPage() {
  const [batting, setBatting] = useState<BattingStat[]>([]);
  const [bowling, setBowling] = useState<BowlingStat[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    getStats()
      .then((data) => {
        setBatting(data.batting);
        setBowling(data.bowling);
        setStatus("ready");
      })
      .catch((e) => {
        setError(e instanceof ApiError ? e.message : "Couldn't load stats.");
        setStatus("error");
      });
  }, []);

  const empty = batting.length === 0 && bowling.length === 0;

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-4xl flex-col gap-5 px-4 py-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-black tracking-tight text-white">
          Career <span className="text-amber-400">Stats</span>
        </h1>
        <Link
          href="/"
          className="rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-white/20"
        >
          ← Back to game
        </Link>
      </header>

      {status === "loading" && <p className="text-white/60">Loading stats…</p>}

      {status === "error" && (
        <div className="rounded-xl bg-red-500/15 p-4 text-sm text-red-200">{error}</div>
      )}

      {status === "ready" && empty && (
        <div className="rounded-xl bg-slate-900/80 p-8 text-center text-white/70 ring-1 ring-white/10">
          No matches recorded yet. Play a full match and your players will show up here.
        </div>
      )}

      {status === "ready" && !empty && (
        <>
          <section className="overflow-x-auto rounded-xl bg-slate-900/80 ring-1 ring-white/10">
            <h2 className="px-4 pt-3 text-sm font-bold uppercase tracking-wide text-blue-300">
              Batting
            </h2>
            <table className="w-full text-sm text-white/90">
              <thead>
                <tr className="border-b border-white/10">
                  <Th>Player</Th>
                  <Th>Team</Th>
                  <Th right>Inns</Th>
                  <Th right>Runs</Th>
                  <Th right>HS</Th>
                  <Th right>Avg</Th>
                  <Th right>SR</Th>
                </tr>
              </thead>
              <tbody>
                {batting.map((b) => (
                  <tr key={`${b.player}-${b.team}`} className="border-b border-white/5 last:border-0">
                    <Td>{surname(b.player)}</Td>
                    <Td>
                      <TeamCell team={b.team} />
                    </Td>
                    <Td right>{b.innings}</Td>
                    <Td right>{b.runs}</Td>
                    <Td right>{b.high_score}</Td>
                    <Td right>{fmt(b.average)}</Td>
                    <Td right>{fmt(b.strike_rate)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="overflow-x-auto rounded-xl bg-slate-900/80 ring-1 ring-white/10">
            <h2 className="px-4 pt-3 text-sm font-bold uppercase tracking-wide text-green-300">
              Bowling
            </h2>
            <table className="w-full text-sm text-white/90">
              <thead>
                <tr className="border-b border-white/10">
                  <Th>Player</Th>
                  <Th>Team</Th>
                  <Th right>Overs</Th>
                  <Th right>Wkts</Th>
                  <Th right>Runs</Th>
                  <Th right>Econ</Th>
                  <Th right>Avg</Th>
                  <Th right>SR</Th>
                </tr>
              </thead>
              <tbody>
                {bowling.map((b) => (
                  <tr key={`${b.player}-${b.team}`} className="border-b border-white/5 last:border-0">
                    <Td>{surname(b.player)}</Td>
                    <Td>
                      <TeamCell team={b.team} />
                    </Td>
                    <Td right>{overs(b.balls)}</Td>
                    <Td right>{b.wickets}</Td>
                    <Td right>{b.runs}</Td>
                    <Td right>{fmt(b.economy)}</Td>
                    <Td right>{fmt(b.average)}</Td>
                    <Td right>{fmt(b.strike_rate, 1)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <p className="text-center text-xs text-white/40">
            Averages, strike rates and economy are computed across all matches you&apos;ve played.
          </p>
        </>
      )}
    </main>
  );
}
