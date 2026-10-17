"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ACHIEVEMENTS, type AchievementState, achievementProgress } from "@/lib/achievements";
import { ApiError, getStats } from "@/lib/api";

const EMPTY = { batting: [], bowling: [], teams: [], head_to_head: { IND: 0, PAK: 0, ties: 0, matches: 0 } };

export default function AchievementsPage() {
  const [result, setResult] = useState<ReturnType<typeof achievementProgress> | null>(null);
  const [note, setNote] = useState<string>("");

  useEffect(() => {
    getStats()
      .then((d) => setResult(achievementProgress(d)))
      .catch((e) => {
        // Stats not configured / unreachable — still show the goals, all locked.
        setNote(e instanceof ApiError ? e.message : "Couldn't load your progress — showing goals only.");
        setResult(achievementProgress(EMPTY));
      });
  }, []);

  const states = result?.states ?? ACHIEVEMENTS.map((a) => ({ a, st: { done: false } as AchievementState }));
  const done = result?.done ?? 0;
  const pct = Math.round((done / ACHIEVEMENTS.length) * 100);

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-4xl flex-col gap-5 px-4 py-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-black tracking-tight text-white">
          Achieve<span className="text-amber-400">ments</span>
        </h1>
        <Link
          href="/"
          className="rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-white/20"
        >
          ← Back
        </Link>
      </header>

      <div className="rounded-xl bg-slate-900/80 p-4 ring-1 ring-white/10">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-semibold text-white">Progress</span>
          <span className="font-mono text-amber-300">
            {done} / {ACHIEVEMENTS.length}
          </span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {note && <p className="text-xs text-white/40">{note}</p>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {states.map(({ a, st }) => {
          const hasBar = st.goal !== undefined && !st.done;
          const barPct = hasBar ? Math.round(((st.cur ?? 0) / (st.goal as number)) * 100) : 0;
          return (
            <div
              key={a.id}
              className={`flex items-start gap-3 rounded-xl p-3 ring-1 transition ${
                st.done ? "bg-amber-500/10 ring-amber-400/40" : "bg-slate-900/70 ring-white/10"
              }`}
            >
              <div
                className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg text-2xl ${
                  st.done ? "bg-amber-400/20" : "bg-white/5 grayscale"
                }`}
              >
                {a.icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className={`font-bold ${st.done ? "text-amber-200" : "text-white/90"}`}>{a.title}</h3>
                  {st.done && <span className="text-xs text-amber-300">✓ Unlocked</span>}
                </div>
                <p className="text-sm text-white/60">{a.desc}</p>
                {hasBar && (
                  <div className="mt-2">
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-white/40" style={{ width: `${barPct}%` }} />
                    </div>
                    <div className="mt-0.5 text-right font-mono text-[11px] text-white/40">
                      {st.cur ?? 0} / {st.goal}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
