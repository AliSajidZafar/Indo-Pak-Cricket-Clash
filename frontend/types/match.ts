// Mirrors backend/app/models.py. Keep the two in sync.

export type TeamCode = "IND" | "PAK";
export type Phase = "toss" | "elect" | "toss_result" | "innings1" | "innings_break" | "innings2" | "finished";
export type TossChoice = "bat" | "bowl";
export type DeliveryKind = "legal" | "wide" | "no_ball";
export type Line = "wide_leg" | "leg" | "stumps" | "off" | "wide_off";
export type Length = "yorker" | "full" | "good" | "short";
export type Contact = "none" | "edge" | "mistimed" | "good" | "perfect";
export type ExtraType = "wide" | "no_ball" | "bye" | "leg_bye";
export type Direction = "leg" | "straight" | "off";
export type CoinSide = "heads" | "tails";

export interface Player {
  name: string;
  role: "bat" | "wk" | "all" | "bowl";
  bowling: "pace" | "spin" | null;
}

export interface Team {
  code: TeamCode;
  name: string;
  players: Player[];
  bowling_order: string[];
}

export interface FieldPosition {
  name: string;
  angle: number;
  distance: number;
}

export interface BatterCard {
  name: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  out: boolean;
  dismissal: string | null;
}

export interface BowlerCard {
  name: string;
  balls: number;
  runs: number;
  wickets: number;
}

export interface Extras {
  wides: number;
  no_balls: number;
  byes: number;
  leg_byes: number;
  total: number;
}

export interface Innings {
  batting: TeamCode;
  bowling: TeamCode;
  runs: number;
  wickets: number;
  legal_balls: number;
  extras: Extras;
  batters: BatterCard[];
  striker: number;
  non_striker: number;
  bowlers: BowlerCard[];
  current_bowler: number;
  this_over: string[];
  over_complete: boolean;
  complete: boolean;
}

export interface Toss {
  call: CoinSide;
  outcome: CoinSide;
  winner: TeamCode;
  choice: TossChoice | null;
  batting_first: TeamCode | null;
}

export interface Delivery {
  kind: DeliveryKind;
  line: Line;
  length: Length;
  speed_kph: number;
  free_hit: boolean;
}

export interface Wicket {
  kind: "bowled" | "caught";
  batter: string;
  bowler: string;
  fielder: string | null;
}

export interface Shot {
  angle: number;
  distance: number;
  lofted: boolean;
  fielder: number | null;
}

export interface BallResult {
  delivery: Delivery;
  swung: boolean;
  timing_ms: number | null;
  contact: Contact;
  shot: Shot | null;
  bat_runs: number;
  extra_type: ExtraType | null;
  extra_runs: number;
  wicket: Wicket | null;
  label: string;
  commentary: string;
}

export interface MatchState {
  id: string;
  user_team: TeamCode;
  teams: Record<TeamCode, Team>;
  overs_per_innings: number;
  phase: Phase;
  toss: Toss | null;
  innings: Innings[];
  target: number | null;
  pending_delivery: Delivery | null;
  free_hit: boolean;
  last_ball: BallResult | null;
  result: string | null;
  winner: TeamCode | null;
  field: FieldPosition[];
  user_batting: boolean;
}
