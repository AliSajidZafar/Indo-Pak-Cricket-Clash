"use client";

import { useEffect, useState } from "react";

import type { BallResult } from "@/types/match";

type Tone = "runs" | "boundary" | "wicket" | "extra" | "dot";

function toneFor(r: BallResult): Tone {
  if (r.wicket) return "wicket";
  if (r.bat_runs === 4 || r.bat_runs === 6) return "boundary";
  if (r.extra_type) return "extra";
  if (r.bat_runs > 0) return "runs";
  return "dot";
}

const TONE_CLASS: Record<Tone, string> = {
  runs: "from-sky-500 to-blue-600",
  boundary: "from-amber-400 to-orange-500",
  wicket: "from-red-500 to-rose-700",
  extra: "from-violet-500 to-fuchsia-600",
  dot: "from-slate-500 to-slate-700",
};

/** A short-lived pop-up for each ball's headline (FOUR!, OUT!, WIDE…). */
export default function Banner({ result, seq }: { result: BallResult | null; seq: number }) {
  // Hide the banner 1.8s after each new ball, without setting state synchronously.
  const [dismissedSeq, setDismissedSeq] = useState(-1);

  useEffect(() => {
    if (!result) return;
    const id = setTimeout(() => setDismissedSeq(seq), 1800);
    return () => clearTimeout(id);
  }, [seq, result]);

  if (!result || seq === dismissedSeq) return null;
  const tone = toneFor(result);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-6 z-10 flex justify-center">
      <div
        className={`animate-[pop_0.25s_ease-out] rounded-2xl bg-gradient-to-br ${TONE_CLASS[tone]} px-6 py-3 text-center text-white shadow-2xl ring-1 ring-white/30`}
      >
        <div className="text-3xl font-black tracking-tight drop-shadow">{result.label}</div>
        <div className="mt-0.5 max-w-xs text-xs font-medium text-white/85">{result.commentary}</div>
      </div>
    </div>
  );
}
