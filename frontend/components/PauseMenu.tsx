import Flag from "@/components/Flag";
import { currentInnings, overs } from "@/lib/cricket";
import type { MatchState } from "@/types/match";

/** The in-game pause overlay: resume, auto-play the opponent's innings, restart or quit. */
export default function PauseMenu({
  open,
  match,
  canSkip,
  onResume,
  onSkip,
  onRestart,
  onQuit,
}: {
  open: boolean;
  match: MatchState;
  canSkip: boolean;
  onResume: () => void;
  onSkip: () => void;
  onRestart: () => void;
  onQuit: () => void;
}) {
  if (!open) return null;
  const inn = currentInnings(match);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#050a1e]/80 backdrop-blur-sm">
      <div className="animate-[pop_0.2s_ease-out] w-[min(22rem,90%)] rounded-2xl bg-slate-900/95 p-5 text-center shadow-2xl ring-1 ring-white/15">
        <div className="mb-1 text-xs font-semibold uppercase tracking-[0.25em] text-amber-300/80">Paused</div>
        {inn && (
          <div className="mb-4 flex items-center justify-center gap-2 text-white">
            <Flag team={inn.batting} className="h-5 w-8" />
            <span className="font-bold">{match.teams[inn.batting].name}</span>
            <span className="font-mono text-lg tabular-nums">
              {inn.runs}/{inn.wickets}
            </span>
            <span className="text-white/50">({overs(inn.legal_balls)} ov)</span>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <button
            onClick={onResume}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 font-bold text-white shadow-lg transition hover:bg-blue-500"
          >
            ▶ Resume
          </button>

          {canSkip && (
            <button
              onClick={onSkip}
              className="w-full rounded-lg bg-amber-500 px-4 py-3 font-bold text-black transition hover:bg-amber-400"
            >
              ▶▶ Auto-play rest of innings
            </button>
          )}

          <button
            onClick={onRestart}
            className="w-full rounded-lg bg-white/10 px-4 py-3 font-semibold text-white transition hover:bg-white/20"
          >
            ↻ Restart match
          </button>

          <button
            onClick={onQuit}
            className="w-full rounded-lg bg-white/5 px-4 py-3 font-semibold text-red-300 transition hover:bg-red-500/20"
          >
            ✕ Quit to menu
          </button>
        </div>

        <p className="mt-3 text-[11px] text-white/40">Press Esc to resume</p>
      </div>
    </div>
  );
}
