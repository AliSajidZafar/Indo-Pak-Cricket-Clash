-- Indo-Pak Cricket Clash — Supabase schema for player stats.
-- Paste this into Supabase → SQL Editor → New query → Run (once).
-- It creates three tables of raw per-match facts, locks them with RLS, and
-- adds two views that compute career stats (average / strike rate / economy)
-- on read, so the derived numbers never go stale.

-- ── Tables: raw per-match facts ──────────────────────────────────────────────
create table matches (
  id         bigint generated always as identity primary key,
  match_id   text unique not null,
  team_a     text not null,
  team_b     text not null,
  winner     text,
  result     text,
  played_at  timestamptz default now()
);

create table batting_innings (
  id       bigint generated always as identity primary key,
  match_id text references matches(match_id) on delete cascade,
  player   text not null,
  team     text not null,
  runs int default 0, balls int default 0,
  fours int default 0, sixes int default 0,
  out  boolean default false
);

create table bowling_spells (
  id       bigint generated always as identity primary key,
  match_id text references matches(match_id) on delete cascade,
  player   text not null,
  team     text not null,
  balls int default 0, runs int default 0, wickets int default 0
);

-- ── Security: only the backend's secret (service_role) key may read/write ────
alter table matches          enable row level security;
alter table batting_innings  enable row level security;
alter table bowling_spells   enable row level security;

-- ── Views: career stats, calculated on read ──────────────────────────────────
-- Batting average = runs / times out; strike rate = runs / balls * 100.
create view player_batting_stats as
select player, team,
  count(*)                      as innings,
  sum(runs)                     as runs,
  max(runs)                     as high_score,
  count(*) filter (where out)   as dismissals,
  round(sum(runs)::numeric / nullif(count(*) filter (where out),0), 2) as average,
  round(sum(runs)::numeric * 100 / nullif(sum(balls),0), 2)            as strike_rate
from batting_innings group by player, team;

-- Economy = runs / overs; average = runs / wickets; strike rate = balls / wickets.
create view player_bowling_stats as
select player, team,
  sum(wickets) as wickets, sum(runs) as runs, sum(balls) as balls,
  round(sum(runs)::numeric * 6 / nullif(sum(balls),0), 2) as economy,
  round(sum(runs)::numeric     / nullif(sum(wickets),0), 2) as average,
  round(sum(balls)::numeric    / nullif(sum(wickets),0), 1) as strike_rate
from bowling_spells group by player, team;
