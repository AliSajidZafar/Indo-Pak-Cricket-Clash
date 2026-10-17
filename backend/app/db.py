"""Optional Supabase persistence for finished-match stats.

Everything here is best-effort: if SUPABASE_URL / SUPABASE_SERVICE_KEY aren't
set (e.g. local dev without keys, or the test suite), the helpers quietly do
nothing, so the game runs exactly as before. A DB error never breaks a match.
"""

import os

from .models import MatchState

_client = None  # created lazily on first use, once the env vars are present


def _db():
    """Return a cached Supabase client, or None if it isn't configured."""
    global _client
    if _client is not None:
        return _client
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not (url and key):
        return None
    from supabase import create_client  # imported lazily so tests don't need it

    _client = create_client(url, key)
    return _client


def save_match(state: MatchState) -> None:
    """Write one finished match's batting and bowling lines to Supabase."""
    client = _db()
    if client is None:
        return
    try:
        client.table("matches").insert(
            {
                "match_id": state.id,
                "team_a": state.innings[0].batting,
                "team_b": state.innings[1].batting,
                "winner": state.winner,
                "result": state.result,
            }
        ).execute()

        batting = [
            {
                "match_id": state.id,
                "player": b.name,
                "team": inn.batting,
                "runs": b.runs,
                "balls": b.balls,
                "fours": b.fours,
                "sixes": b.sixes,
                "out": b.out,
            }
            for inn in state.innings
            for b in inn.batters
        ]
        bowling = [
            {
                "match_id": state.id,
                "player": bw.name,
                "team": inn.bowling,
                "balls": bw.balls,
                "runs": bw.runs,
                "wickets": bw.wickets,
            }
            for inn in state.innings
            for bw in inn.bowlers
        ]
        if batting:
            client.table("batting_innings").insert(batting).execute()
        if bowling:
            client.table("bowling_spells").insert(bowling).execute()
    except Exception as err:  # never let a stats hiccup break the match
        print("Supabase save_match failed:", err)


def _team_totals(batting_rows: list[dict]) -> dict[str, dict]:
    """Aggregate per-team batting milestones from raw innings rows."""
    teams: dict[str, dict] = {
        code: {"team": code, "runs": 0, "thirties": 0, "fifties": 0, "hundreds": 0, "fours": 0, "sixes": 0}
        for code in ("IND", "PAK")
    }
    for r in batting_rows:
        t = teams.get(r.get("team"))
        if t is None:
            continue
        runs = r.get("runs") or 0
        t["runs"] += runs
        t["fours"] += r.get("fours") or 0
        t["sixes"] += r.get("sixes") or 0
        # A score counts once, in its highest bracket (a 50 is not also a 30).
        if runs >= 100:
            t["hundreds"] += 1
        elif runs >= 50:
            t["fifties"] += 1
        elif runs >= 30:
            t["thirties"] += 1
    return teams


def _head_to_head(match_rows: list[dict]) -> dict:
    """Count match wins per team (winner is a team code, or null for a tie)."""
    h2h = {"IND": 0, "PAK": 0, "ties": 0, "matches": len(match_rows)}
    for m in match_rows:
        w = m.get("winner")
        if w in ("IND", "PAK"):
            h2h[w] += 1
        else:
            h2h["ties"] += 1
    return h2h


def fetch_stats() -> dict | None:
    """Return career batting/bowling stats, team totals and the head-to-head record."""
    client = _db()
    if client is None:
        return None
    try:
        batting = (
            client.table("player_batting_stats").select("*").order("runs", desc=True).execute().data
        )
        bowling = (
            client.table("player_bowling_stats")
            .select("*")
            .order("wickets", desc=True)
            .execute()
            .data
        )
        # Raw rows for team milestones and the head-to-head record. (Aggregated in
        # Python so no extra SQL views are needed; fine at this scale.)
        innings_rows = client.table("batting_innings").select("team,runs,fours,sixes").execute().data
        match_rows = client.table("matches").select("winner").execute().data
        teams = _team_totals(innings_rows)
        h2h = _head_to_head(match_rows)
        for code in ("IND", "PAK"):
            teams[code]["wins"] = h2h[code]
        return {
            "batting": batting,
            "bowling": bowling,
            "teams": [teams["IND"], teams["PAK"]],
            "head_to_head": h2h,
        }
    except Exception as err:
        print("Supabase fetch_stats failed:", err)
        return None
