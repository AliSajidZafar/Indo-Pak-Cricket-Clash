import { type ReactNode } from "react";

import Flag from "@/components/Flag";
import type { StatsResponse, TeamStat } from "@/lib/api";
import { overs, surname } from "@/lib/cricket";
import { TEAM_STYLE } from "@/lib/cricket";
import type { TeamCode } from "@/types/match";

const fmt = (v: number | string | null, dp = 2) =>
  v === null || v === undefined || v === "" ? "—" : Number(v).toFixed(dp);

const TEAM_NAME: Record<TeamCode, string> = { IND: "India", PAK: "Pakistan" };

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
    <th className={`px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white/50 ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function Td({ children, right }: { children: ReactNode; right?: boolean }) {
  return <td className={`px-3 py-2 ${right ? "text-right font-mono tabular-nums" : "text-left"}`}>{children}</td>;
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg bg-black/25 px-2 py-1.5 text-center">
      <div className="font-mono text-lg font-bold tabular-nums text-white">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-white/50">{label}</div>
    </div>
  );
}

function TeamCard({ t }: { t: TeamStat }) {
  const style = TEAM_STYLE[t.team];
  return (
    <div className={`flex-1 rounded-xl ${style.bg} p-3 ring-1 ring-white/15`}>
      <div className="mb-2 flex items-center gap-2">
        <Flag team={t.team} className="h-6 w-9" />
        <span className="font-bold text-white">{TEAM_NAME[t.team]}</span>
        <span className="ml-auto font-mono text-sm text-white/80">{t.wins} wins</span>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        <Stat label="Runs" value={t.runs} />
        <Stat label="30s" value={t.thirties} />
        <Stat label="50s" value={t.fifties} />
        <Stat label="100s" value={t.hundreds} />
        <Stat label="Fours" value={t.fours} />
        <Stat label="Sixes" value={t.sixes} />
      </div>
    </div>
  );
}

function HeadToHead({ h2h }: { h2h: NonNullable<StatsResponse["head_to_head"]> }) {
  return (
    <section className="rounded-xl bg-gradient-to-br from-slate-900 to-slate-950 p-4 ring-1 ring-white/10">
      <h2 className="mb-3 text-center text-sm font-bold uppercase tracking-[0.2em] text-amber-300">Head to Head</h2>
      <div className="flex items-center justify-center gap-4 sm:gap-8">
        <div className="flex flex-col items-center gap-1">
          <Flag team="IND" className="h-9 w-14 shadow-lg" />
          <span className="text-xs text-white/60">India</span>
        </div>
        <div className="flex items-baseline gap-2 font-mono font-black tabular-nums">
          <span className="text-4xl text-blue-400">{h2h.IND}</span>
          <span className="text-xl text-white/40">–</span>
          <span className="text-4xl text-green-400">{h2h.PAK}</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <Flag team="PAK" className="h-9 w-14 shadow-lg" />
          <span className="text-xs text-white/60">Pakistan</span>
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-white/40">
        {h2h.matches} match{h2h.matches === 1 ? "" : "es"} played
        {h2h.ties ? ` · ${h2h.ties} tied` : ""}
      </p>
    </section>
  );
}

/** The whole career-stats body: team summary, batting, bowling and head-to-head. */
export default function StatsView({ data }: { data: StatsResponse }) {
  const { batting, bowling, teams, head_to_head } = data;

  return (
    <div className="flex flex-col gap-5">
      {teams && teams.length > 0 && (
        <section className="flex flex-col gap-3 sm:flex-row">
          {teams.map((t) => (
            <TeamCard key={t.team} t={t} />
          ))}
        </section>
      )}

      <section className="overflow-x-auto rounded-xl bg-slate-900/80 ring-1 ring-white/10">
        <h2 className="px-4 pt-3 text-sm font-bold uppercase tracking-wide text-blue-300">Batting</h2>
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
        <h2 className="px-4 pt-3 text-sm font-bold uppercase tracking-wide text-green-300">Bowling</h2>
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

      {head_to_head && head_to_head.matches > 0 && <HeadToHead h2h={head_to_head} />}
    </div>
  );
}
