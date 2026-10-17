"use client";

import { useEffect, useState } from "react";

import StatsView from "@/components/StatsView";
import { ApiError, type StatsResponse, getStats } from "@/lib/api";

/** A scrollable career-stats panel shown over the game (from the pause menu). */
export default function StatsOverlay({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");

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
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#050a1e]/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-4 py-3">
        <h2 className="text-xl font-black tracking-tight text-white">
          Career <span className="text-amber-400">Stats</span>
        </h2>
        <button
          onClick={onClose}
          className="rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-white/20"
        >
          ✕ Close
        </button>
      </div>
      <div className="mx-auto w-full max-w-4xl flex-1 overflow-y-auto px-4 pb-6">
        {status === "loading" && <p className="text-white/60">Loading stats…</p>}
        {status === "error" && <div className="rounded-xl bg-red-500/15 p-4 text-sm text-red-200">{error}</div>}
        {status === "ready" && empty && (
          <div className="rounded-xl bg-slate-900/80 p-8 text-center text-white/70 ring-1 ring-white/10">
            No matches recorded yet — finish this one and the players will show up here.
          </div>
        )}
        {status === "ready" && data && !empty && <StatsView data={data} />}
      </div>
    </div>
  );
}
