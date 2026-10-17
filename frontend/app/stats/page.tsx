"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import StatsView from "@/components/StatsView";
import { ApiError, type StatsResponse, getStats } from "@/lib/api";

export default function StatsPage() {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    getStats()
      .then((d) => {
        setData(d);
        setStatus("ready");
      })
      .catch((e) => {
        setError(e instanceof ApiError ? e.message : "Couldn't load stats.");
        setStatus("error");
      });
  }, []);

  const empty = !!data && data.batting.length === 0 && data.bowling.length === 0;

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

      {status === "error" && <div className="rounded-xl bg-red-500/15 p-4 text-sm text-red-200">{error}</div>}

      {status === "ready" && empty && (
        <div className="rounded-xl bg-slate-900/80 p-8 text-center text-white/70 ring-1 ring-white/10">
          No matches recorded yet. Play a full match and your players will show up here.
        </div>
      )}

      {status === "ready" && data && !empty && (
        <>
          <StatsView data={data} />
          <p className="text-center text-xs text-white/40">
            Averages, strike rates and economy are computed across all matches played.
          </p>
        </>
      )}
    </main>
  );
}
