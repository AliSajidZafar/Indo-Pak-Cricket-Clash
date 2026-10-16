"""HTTP API for Indo-Pak Cricket Clash. Run with: uvicorn app.main:app --reload"""

import os
import random
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# Load backend/.env explicitly (robust regardless of the working directory).
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from . import engine
from .db import fetch_stats
from .models import MatchState, NewMatchRequest, PlayRequest, TossRequest

app = FastAPI(title="Indo-Pak Cricket Clash API")

# CORS: trust the configured origins, and — as a safety net — any Railway app
# domain, so the deployed frontend works even if FRONTEND_ORIGINS is slightly off
# (wrong scheme, trailing slash, stray spaces). No cookies/credentials are used.
_origins = [o.strip() for o in os.environ.get("FRONTEND_ORIGINS", "http://localhost:3000").split(",") if o.strip()]
_allow_all = "*" in _origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if _allow_all else _origins,
    allow_origin_regex=None if _allow_all else r"https://.*\.up\.railway\.app",
    allow_methods=["*"],
    allow_headers=["*"],
)

# Matches live in memory for now; they disappear when the server restarts.
MATCHES: dict[str, MatchState] = {}
rng = random.Random()


def get_match(match_id: str) -> MatchState:
    state = MATCHES.get(match_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Match not found")
    return state


def run_rule(action, *args) -> None:
    try:
        action(*args)
    except engine.RuleError as err:
        raise HTTPException(status_code=409, detail=str(err)) from err


# Bump this on each deploy so /api/health confirms the live build.
VERSION = "2026.10.16.1"


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "version": VERSION}


@app.get("/api/stats")
def stats() -> dict:
    """Career batting and bowling stats across all finished matches."""
    data = fetch_stats()
    if data is None:
        raise HTTPException(status_code=503, detail="Stats are not configured yet.")
    return data


@app.post("/api/matches")
def create_match(body: NewMatchRequest) -> MatchState:
    state = engine.new_match(body.user_team)
    MATCHES[state.id] = state
    return state


@app.get("/api/matches/{match_id}")
def read_match(match_id: str) -> MatchState:
    return get_match(match_id)


@app.post("/api/matches/{match_id}/toss")
def toss(match_id: str, body: TossRequest) -> MatchState:
    state = get_match(match_id)
    run_rule(engine.do_toss, state, body.call, rng)
    return state


@app.post("/api/matches/{match_id}/delivery")
def delivery(match_id: str) -> MatchState:
    state = get_match(match_id)
    run_rule(engine.next_delivery, state, rng)
    return state


@app.post("/api/matches/{match_id}/play")
def play(match_id: str, body: PlayRequest) -> MatchState:
    state = get_match(match_id)
    run_rule(engine.play_ball, state, body.timing_ms, body.direction, rng)
    return state


@app.post("/api/matches/{match_id}/simulate")
def simulate(match_id: str) -> MatchState:
    state = get_match(match_id)
    run_rule(engine.simulate_innings, state, rng)
    return state


@app.post("/api/matches/{match_id}/next-innings")
def next_innings(match_id: str) -> MatchState:
    state = get_match(match_id)
    run_rule(engine.start_second_innings, state)
    return state
