import type { StatsResponse } from "@/lib/api";

// Career goals for the player to chase. Each one works out whether it's done —
// and how far along — from the career stats the backend already returns, so no
// extra tracking is needed. Add more over time; the pages adapt automatically.

export interface AchievementState {
  done: boolean;
  cur?: number; // current value, for a progress bar
  goal?: number; // target value
}

export interface Achievement {
  id: string;
  title: string;
  desc: string;
  icon: string;
  check: (s: StatsResponse) => AchievementState;
}

// --- helpers over the stats payload -------------------------------------------

const matches = (s: StatsResponse) => s.head_to_head?.matches ?? 0;
const wins = (s: StatsResponse) => (s.head_to_head?.IND ?? 0) + (s.head_to_head?.PAK ?? 0);
const h2hLead = (s: StatsResponse) => Math.abs((s.head_to_head?.IND ?? 0) - (s.head_to_head?.PAK ?? 0));
const sumTeams = (s: StatsResponse, k: "runs" | "fours" | "sixes") =>
  (s.teams ?? []).reduce((n, t) => n + (t[k] ?? 0), 0);
const maxHighScore = (s: StatsResponse) => s.batting.reduce((m, b) => Math.max(m, b.high_score ?? 0), 0);
const maxWickets = (s: StatsResponse) => s.bowling.reduce((m, b) => Math.max(m, b.wickets ?? 0), 0);
const bothTeamsWon = (s: StatsResponse) => (s.head_to_head?.IND ?? 0) >= 1 && (s.head_to_head?.PAK ?? 0) >= 1;
const bestEconomy = (s: StatsResponse) => {
  const q = s.bowling.filter((b) => (b.balls ?? 0) >= 6 && b.economy !== null);
  return q.length ? Math.min(...q.map((b) => Number(b.economy))) : Infinity;
};

const by = (cur: number, goal: number): AchievementState => ({ done: cur >= goal, cur: Math.min(cur, goal), goal });

export const ACHIEVEMENTS: Achievement[] = [
  { id: "debut", title: "Debut", desc: "Play your first match.", icon: "🎬", check: (s) => by(matches(s), 1) },
  { id: "regular", title: "Regular", desc: "Play 5 matches.", icon: "📅", check: (s) => by(matches(s), 5) },
  { id: "veteran", title: "Veteran", desc: "Play 15 matches.", icon: "🎖️", check: (s) => by(matches(s), 15) },
  { id: "first-blood", title: "First Blood", desc: "Win your first match.", icon: "🏆", check: (s) => by(wins(s), 1) },
  { id: "on-a-roll", title: "On a Roll", desc: "Win 5 matches.", icon: "🔥", check: (s) => by(wins(s), 5) },
  { id: "rivalry", title: "Rivalry Ruler", desc: "Lead the head-to-head by 3.", icon: "👑", check: (s) => by(h2hLead(s), 3) },
  { id: "both-sides", title: "No Favourites", desc: "Win a match with each team.", icon: "🤝", check: (s) => ({ done: bothTeamsWon(s) }) },
  { id: "thirty", title: "Thirty Up", desc: "Score 30+ in an innings.", icon: "🏏", check: (s) => by(maxHighScore(s), 30) },
  { id: "fifty", title: "Half-Century Hero", desc: "Score 50+ in an innings.", icon: "⭐", check: (s) => by(maxHighScore(s), 50) },
  { id: "century", title: "Centurion", desc: "Score a hundred (good luck in 5 overs!).", icon: "💯", check: (s) => by(maxHighScore(s), 100) },
  { id: "big-hitter", title: "Big Hitter", desc: "Hit 10 sixes in all.", icon: "💥", check: (s) => by(sumTeams(s, "sixes"), 10) },
  { id: "boundary-boss", title: "Boundary Boss", desc: "Hit 30 fours in all.", icon: "🧱", check: (s) => by(sumTeams(s, "fours"), 30) },
  { id: "run-factory", title: "Run Factory", desc: "Score 500 team runs in all.", icon: "🏭", check: (s) => by(sumTeams(s, "runs"), 500) },
  { id: "strike-bowler", title: "Strike Bowler", desc: "Take 5 career wickets with one bowler.", icon: "🎯", check: (s) => by(maxWickets(s), 5) },
  { id: "miser", title: "The Miser", desc: "Bowl a spell under 6 an over (min 1 over).", icon: "🪙", check: (s) => ({ done: bestEconomy(s) < 6 }) },
];

export function achievementProgress(s: StatsResponse) {
  const states = ACHIEVEMENTS.map((a) => ({ a, st: a.check(s) }));
  const done = states.filter((x) => x.st.done).length;
  return { states, done, total: ACHIEVEMENTS.length };
}
