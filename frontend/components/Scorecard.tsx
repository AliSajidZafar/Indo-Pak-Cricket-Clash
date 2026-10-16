import Flag from "@/components/Flag";
import type { BatterCard, Innings, MatchState } from "@/types/match";
import { TEAM_STYLE, bowlerFigures, chaseStatus, overs, surname } from "@/lib/cricket";

function BatterRow({
  b,
  onStrike,
  strikeBg,
}: {
  b: BatterCard;
  onStrike: boolean;
  strikeBg: string;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 transition-colors ${
        onStrike ? `${strikeBg} text-white shadow-inner` : "text-white/70"
      }`}
    >
      <span className="w-3 text-amber-300">{onStrike ? "▸" : ""}</span>
      <span className="flex-1 truncate text-sm font-medium">{surname(b.name)}</span>
      <span className="font-mono text-sm tabular-nums">
        {b.runs}
        <span className="text-white/50"> ({b.balls})</span>
      </span>
    </div>
  );
}

function OverTrack({ balls }: { balls: string[] }) {
  if (!balls.length) return <span className="text-white/40">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {balls.map((b, i) => {
        const wicket = b === "W";
        const boundary = b === "4" || b === "6";
        const extra = /[a-z]/.test(b);
        return (
          <span
            key={i}
            className={`grid h-6 min-w-6 place-items-center rounded px-1 text-xs font-bold ${
              wicket
                ? "bg-red-600 text-white"
                : boundary
                  ? "bg-amber-400 text-black"
                  : extra
                    ? "bg-white/15 text-amber-200"
                    : "bg-white/10 text-white/80"
            }`}
          >
            {b}
          </span>
        );
      })}
    </div>
  );
}

export default function Scorecard({ match, innings }: { match: MatchState; innings: Innings }) {
  const style = TEAM_STYLE[innings.batting];
  const team = match.teams[innings.batting];
  const striker = innings.batters[innings.striker];
  const nonStriker = innings.batters[innings.non_striker];
  const bowler = innings.bowlers[innings.current_bowler];
  const ex = innings.extras;
  const chase = chaseStatus(match);

  const exParts = [
    ex.wides && `w${ex.wides}`,
    ex.no_balls && `nb${ex.no_balls}`,
    ex.byes && `b${ex.byes}`,
    ex.leg_byes && `lb${ex.leg_byes}`,
  ].filter(Boolean);

  return (
    <div className="w-full rounded-xl bg-slate-900/90 p-3 ring-1 ring-white/10 backdrop-blur">
      <div className="flex flex-wrap items-stretch gap-3">
        {/* Team total */}
        <div className={`flex items-center gap-3 rounded-lg ${style.bg} px-4 py-2 text-white`}>
          <Flag team={innings.batting} className="h-6 w-9" />
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide opacity-80">
              {team.name}
            </div>
            <div className="font-mono text-2xl font-bold leading-none tabular-nums">
              {innings.runs}
              <span className="opacity-70">/{innings.wickets}</span>
            </div>
          </div>
          <div className="ml-1 border-l border-white/30 pl-3 text-sm">
            <div className="opacity-70">Overs</div>
            <div className="font-mono tabular-nums">
              {overs(innings.legal_balls)}
              <span className="opacity-60">/{match.overs_per_innings}</span>
            </div>
          </div>
        </div>

        {/* Batsmen */}
        <div className="min-w-[180px] flex-1 rounded-lg bg-black/20 p-1">
          <BatterRow b={striker} onStrike strikeBg={style.bg} />
          <BatterRow b={nonStriker} onStrike={false} strikeBg={style.bg} />
        </div>

        {/* Bowler + extras */}
        <div className="flex min-w-[150px] flex-col justify-center gap-1 rounded-lg bg-black/20 px-3 py-1.5 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-white/60">
              <Flag team={innings.bowling} className="h-3.5 w-5" />
              Bowler
            </span>
            <span className="flex-1 truncate text-right font-medium text-white/90">
              {surname(bowler?.name ?? "")}
            </span>
            <span className="font-mono text-white/70">{bowler ? bowlerFigures(bowler) : ""}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-white/60">Extras</span>
            <span className="font-mono text-white/90">
              {ex.total}
              {exParts.length > 0 && (
                <span className="ml-1 text-xs text-amber-200">({exParts.join(" ")})</span>
              )}
            </span>
          </div>
        </div>

        {/* This over */}
        <div className="flex min-w-[140px] flex-col justify-center gap-1 rounded-lg bg-black/20 px-3 py-1.5">
          <span className="text-xs uppercase tracking-wide text-white/50">This over</span>
          <OverTrack balls={innings.this_over} />
        </div>
      </div>

      {(chase || match.target) && (
        <div className="mt-2 flex items-center justify-between rounded-lg bg-amber-500/10 px-3 py-1.5 text-sm text-amber-200">
          <span>
            {match.target
              ? `Target ${match.target}`
              : `${match.teams[innings.batting].name} batting first`}
          </span>
          {chase && <span className="font-semibold">{chase}</span>}
        </div>
      )}
    </div>
  );
}
