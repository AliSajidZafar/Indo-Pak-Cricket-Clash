import type { CoinSide, Direction, MatchState, TeamCode } from "@/types/match";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {}

async function call(path: string, body?: unknown): Promise<MatchState> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/matches${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      `Can't reach the game server at ${API_URL}. Is the Python backend running?`,
    );
  }
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new ApiError(detail?.detail ?? `Server error (${res.status})`);
  }
  return res.json();
}

export const api = {
  createMatch: (userTeam: TeamCode) => call("", { user_team: userTeam }),
  toss: (id: string, coin: CoinSide) => call(`/${id}/toss`, { call: coin }),
  delivery: (id: string) => call(`/${id}/delivery`),
  play: (id: string, timingMs: number | null, direction: Direction) =>
    call(`/${id}/play`, { timing_ms: timingMs, direction }),
  simulate: (id: string) => call(`/${id}/simulate`),
  nextInnings: (id: string) => call(`/${id}/next-innings`),
};

// --- career stats (Supabase-backed) -----------------------------------------
// Numeric columns can arrive as numbers or strings depending on the driver.
type Num = number | string | null;

export interface BattingStat {
  player: string;
  team: TeamCode;
  innings: number;
  runs: number;
  high_score: number;
  dismissals: number;
  average: Num;
  strike_rate: Num;
}

export interface BowlingStat {
  player: string;
  team: TeamCode;
  wickets: number;
  runs: number;
  balls: number;
  economy: Num;
  average: Num;
  strike_rate: Num;
}

export interface StatsResponse {
  batting: BattingStat[];
  bowling: BowlingStat[];
}

export async function getStats(): Promise<StatsResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/stats`);
  } catch {
    throw new ApiError(
      `Can't reach the game server at ${API_URL}. Is the Python backend running?`,
    );
  }
  if (res.status === 503) {
    throw new ApiError(
      "Stats aren't set up yet — add your Supabase keys to backend/.env and restart the backend.",
    );
  }
  if (!res.ok) throw new ApiError(`Server error (${res.status})`);
  return res.json();
}
