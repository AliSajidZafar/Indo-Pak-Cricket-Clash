import type { BowlerCard, Innings, MatchState, TeamCode } from "@/types/match";

export const TEAM_STYLE: Record<TeamCode, { bg: string; text: string; ring: string }> = {
  IND: { bg: "bg-blue-600", text: "text-blue-300", ring: "ring-blue-400" },
  PAK: { bg: "bg-green-700", text: "text-green-300", ring: "ring-green-400" },
};

/** 23 legal balls -> "3.5" */
export function overs(balls: number): string {
  return `${Math.floor(balls / 6)}.${balls % 6}`;
}

export function bowlerFigures(b: BowlerCard): string {
  return `${overs(b.balls)}-${b.runs}-${b.wickets}`;
}

export function surname(name: string): string {
  const parts = name.split(" ");
  return parts[parts.length - 1];
}

export function currentInnings(match: MatchState): Innings | null {
  return match.innings.length ? match.innings[match.innings.length - 1] : null;
}

/** "Need 14 from 9 balls" during a chase, otherwise null. */
export function chaseStatus(match: MatchState): string | null {
  const inn = currentInnings(match);
  if (!inn || match.target === null || match.innings.length < 2 || inn.complete) return null;
  const need = match.target - inn.runs;
  const balls = match.overs_per_innings * 6 - inn.legal_balls;
  return `Need ${need} from ${balls} ball${balls === 1 ? "" : "s"}`;
}
