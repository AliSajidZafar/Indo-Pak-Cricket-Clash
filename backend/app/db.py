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


def fetch_stats() -> dict | None:
    """Return career batting/bowling stats from the views, or None if unavailable."""
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
        return {"batting": batting, "bowling": bowling}
    except Exception as err:
        print("Supabase fetch_stats failed:", err)
        return None
