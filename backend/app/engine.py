"""Match rules: toss, deliveries, shot outcomes, scoring and innings changes.

Every function takes a `random.Random` so tests can make results repeatable.
"""

import random
import uuid

from .models import (
    BallResult,
    BatterCard,
    BowlerCard,
    CoinSide,
    Contact,
    Delivery,
    Direction,
    ExtraType,
    Innings,
    MatchState,
    Shot,
    TeamCode,
    Toss,
    Wicket,
)
from .teams import FIELD, TEAMS

OVERS_PER_INNINGS = 5
BALLS_PER_OVER = 6


class RuleError(Exception):
    """Raised when an action is not allowed in the current phase."""


def other(code: TeamCode) -> TeamCode:
    return "PAK" if code == "IND" else "IND"


def new_match(user_team: TeamCode) -> MatchState:
    return MatchState(
        id=uuid.uuid4().hex[:12],
        user_team=user_team,
        teams=TEAMS,
        overs_per_innings=OVERS_PER_INNINGS,
        field=FIELD,
    )


# --- toss & innings -----------------------------------------------------------


def do_toss(state: MatchState, call: CoinSide, rng: random.Random) -> None:
    if state.phase != "toss":
        raise RuleError("The toss has already happened.")
    outcome: CoinSide = rng.choice(["heads", "tails"])
    winner = state.user_team if outcome == call else other(state.user_team)
    # Agreed rule for this game: the toss winner always bats first.
    state.toss = Toss(call=call, outcome=outcome, winner=winner, batting_first=winner)
    _start_innings(state, batting=winner)
    state.phase = "innings1"


def start_second_innings(state: MatchState) -> None:
    if state.phase != "innings_break":
        raise RuleError("The first innings is not over yet.")
    _start_innings(state, batting=other(state.innings[0].batting))
    state.phase = "innings2"


def _start_innings(state: MatchState, batting: TeamCode) -> None:
    bowling = other(batting)
    players = state.teams[batting].players
    state.innings.append(
        Innings(
            batting=batting,
            bowling=bowling,
            batters=[BatterCard(name=players[0].name), BatterCard(name=players[1].name)],
            bowlers=[BowlerCard(name=state.teams[bowling].bowling_order[0])],
        )
    )
    state.pending_delivery = None
    state.free_hit = False
    state.last_ball = None


def current_innings(state: MatchState) -> Innings:
    if state.phase not in ("innings1", "innings2"):
        raise RuleError("No innings is in progress.")
    return state.innings[-1]


# --- bowling ------------------------------------------------------------------


def next_delivery(state: MatchState, rng: random.Random) -> Delivery:
    """Decide the next ball. Calling it again before it is played returns the same ball."""
    inn = current_innings(state)
    if state.pending_delivery:
        return state.pending_delivery

    if inn.over_complete:
        inn.this_over = []
        inn.over_complete = False

    roll = rng.random()
    kind = "wide" if roll < 0.05 else "no_ball" if roll < 0.08 else "legal"
    if kind == "wide":
        line = rng.choice(["wide_off", "wide_leg"])
    else:
        line = rng.choices(["stumps", "off", "leg"], weights=[40, 35, 25])[0]
    length = rng.choices(["yorker", "full", "good", "short"], weights=[10, 30, 45, 15])[0]

    bowler_name = inn.bowlers[inn.current_bowler].name
    bowler = next(p for p in state.teams[inn.bowling].players if p.name == bowler_name)
    speed = rng.randint(128, 148) if bowler.bowling == "pace" else rng.randint(82, 96)

    state.pending_delivery = Delivery(
        kind=kind, line=line, length=length, speed_kph=speed, free_hit=state.free_hit
    )
    return state.pending_delivery


# --- batting ------------------------------------------------------------------


# Timing windows in ms either side of the perfect moment. Mirrored on the
# frontend (lib/render.ts TIMING) so the on-screen meter matches these exactly.
PERFECT_MS = 70
GOOD_MS = 140
MISTIMED_MS = 215
EDGE_MS = 290


def contact_from_timing(timing_ms: int | None) -> Contact:
    if timing_ms is None:
        return "none"
    error = abs(timing_ms)
    if error <= PERFECT_MS:
        return "perfect"
    if error <= GOOD_MS:
        return "good"
    if error <= MISTIMED_MS:
        return "mistimed"
    if error <= EDGE_MS:
        return "edge"
    return "none"


def _computer_swing(delivery: Delivery, rng: random.Random) -> tuple[int | None, Direction]:
    if delivery.kind == "wide" and rng.random() < 0.7:
        return None, "straight"
    timing = max(-340, min(200, round(rng.gauss(0, 150))))
    direction: Direction = rng.choices(["leg", "straight", "off"], weights=[40, 25, 35])[0]
    return timing, direction


def _shot_angle(direction: Direction, rng: random.Random) -> float:
    if direction == "leg":
        return rng.uniform(-80, -20)
    if direction == "off":
        return rng.uniform(20, 80)
    return rng.uniform(-18, 18)


def _nearest_fielder(state: MatchState, angle: float, deep: bool | None = None) -> int:
    choices = [
        (abs(f.angle - angle), i)
        for i, f in enumerate(state.field)
        if deep is None or (f.distance > 0.7) == deep
    ]
    return min(choices)[1]


def _fielder_names(state: MatchState, inn: Innings) -> list[str]:
    """Name the nine fielders: everyone except the bowler and the wicketkeeper."""
    bowler = inn.bowlers[inn.current_bowler].name
    team = state.teams[inn.bowling]
    return [p.name for p in team.players if p.name != bowler and p.role != "wk"]


def play_ball(
    state: MatchState,
    timing_ms: int | None,
    direction: Direction,
    rng: random.Random,
) -> BallResult:
    inn = current_innings(state)
    delivery = state.pending_delivery
    if delivery is None:
        raise RuleError("No ball has been bowled yet.")

    if inn.batting != state.user_team:
        timing_ms, direction = _computer_swing(delivery, rng)

    can_be_out = delivery.kind == "legal" and not delivery.free_hit
    contact: Contact = "none" if delivery.kind == "wide" else contact_from_timing(timing_ms)
    if delivery.length == "yorker" and contact in ("perfect", "good") and rng.random() < 0.4:
        contact = "good" if contact == "perfect" else "mistimed"

    bat_runs = 0
    extra_type: ExtraType | None = None
    extra_runs = 0
    shot: Shot | None = None
    dismissal: str | None = None  # "bowled" | "caught"
    note = ""

    if delivery.kind == "wide":
        extra_type, extra_runs = "wide", 1
    elif contact == "none":
        on_stumps = delivery.line == "stumps"
        roll = rng.random()
        bowled_chance = (0.45 if timing_ms is not None else 0.65) if on_stumps else 0.0
        leg_bye_chance = 0.15 if on_stumps or delivery.line == "leg" else 0.0
        if roll < bowled_chance:
            if can_be_out:
                dismissal = "bowled"
            else:
                note = "Hits the stumps, but it's not out!"
        elif roll < bowled_chance + leg_bye_chance:
            extra_type, extra_runs = "leg_bye", 1
        elif not on_stumps and roll < 0.08:
            extra_type, extra_runs = "bye", 4 if rng.random() < 0.15 else 1
    else:
        angle = _shot_angle(direction, rng)
        if contact == "edge":
            angle = rng.choice([1, -1]) * rng.uniform(120, 160)
            bat_runs = rng.choices([0, 1, 2, 4], weights=[45, 30, 10, 15])[0]
        elif contact == "mistimed":
            angle += rng.gauss(0, 20)
            outcome = rng.choices(["catch", 0, 1, 2, 4], weights=[22, 30, 35, 10, 3])[0]
            if outcome == "catch":
                if can_be_out:
                    dismissal = "caught"
                else:
                    note = "Caught, but it's not out!"
            else:
                bat_runs = outcome
        elif contact == "good":
            outcome = rng.choices(["catch", 0, 1, 2, 3, 4, 6], weights=[5, 10, 35, 20, 5, 20, 5])[0]
            if outcome == "catch":
                if can_be_out:
                    dismissal = "caught"
                else:
                    note = "Caught in the deep, but it's not out!"
            else:
                bat_runs = outcome
        else:  # perfect
            bat_runs = rng.choices([1, 2, 4, 6], weights=[10, 15, 45, 30])[0]
        shot = _place_shot(state, angle, bat_runs, contact, dismissal == "caught" or bool(note), rng)

    # The no-ball penalty is added on top of whatever else happened.
    # Keep it simple: a no-ball is always one extra plus the batter's runs.
    if delivery.kind == "no_ball":
        extra_type, extra_runs = "no_ball", 1

    wicket = None
    if dismissal:
        fielder = None
        if dismissal == "caught" and shot and shot.fielder is not None:
            fielder = _fielder_names(state, inn)[shot.fielder]
        wicket = Wicket(
            kind=dismissal,
            batter=inn.batters[inn.striker].name,
            bowler=inn.bowlers[inn.current_bowler].name,
            fielder=fielder,
        )

    result = BallResult(
        delivery=delivery,
        swung=timing_ms is not None and delivery.kind != "wide",
        timing_ms=timing_ms,
        contact=contact,
        shot=shot,
        bat_runs=bat_runs,
        extra_type=extra_type,
        extra_runs=extra_runs,
        wicket=wicket,
        label="",
        commentary="",
    )
    result.label = _label(result)
    result.commentary = _commentary(state, inn, result, note)
    _apply(state, inn, result)
    return result


def _place_shot(
    state: MatchState,
    angle: float,
    runs: int,
    contact: Contact,
    caught: bool,
    rng: random.Random,
) -> Shot:
    if caught:
        deep = contact == "good"
        idx = _nearest_fielder(state, angle, deep=deep)
        f = state.field[idx]
        return Shot(angle=f.angle, distance=f.distance, lofted=True, fielder=idx)
    if runs == 6:
        return Shot(angle=angle, distance=rng.uniform(1.12, 1.35), lofted=True, fielder=None)
    distance = {
        0: rng.uniform(0.2, 0.34),
        1: rng.uniform(0.3, 0.6),
        2: rng.uniform(0.55, 0.85),
        3: rng.uniform(0.8, 0.95),
    }.get(runs, 1.02)
    if abs(angle) > 100:  # edged behind: nobody visible chases it
        return Shot(angle=angle, distance=distance, lofted=False, fielder=None)
    if runs == 4:
        return Shot(
            angle=angle,
            distance=distance,
            lofted=False,
            fielder=_nearest_fielder(state, angle, deep=True),
        )
    return Shot(
        angle=angle,
        distance=distance,
        lofted=False,
        fielder=_nearest_fielder(state, angle, deep=runs >= 2),
    )


def _label(r: BallResult) -> str:
    if r.wicket:
        return "OUT!"
    if r.extra_type == "wide":
        return "WIDE"
    if r.extra_type == "no_ball":
        return "NO BALL" + (f" + {r.bat_runs}" if r.bat_runs else "")
    if r.extra_type == "bye":
        return "FOUR BYES" if r.extra_runs == 4 else "BYE"
    if r.extra_type == "leg_bye":
        return "LEG BYE"
    if r.bat_runs == 6:
        return "SIX!"
    if r.bat_runs == 4:
        return "FOUR!"
    if r.bat_runs == 0:
        return "DOT BALL"
    return f"{r.bat_runs} RUN{'S' if r.bat_runs > 1 else ''}"


def _commentary(state: MatchState, inn: Innings, r: BallResult, note: str) -> str:
    batter = inn.batters[inn.striker].name
    bowler = inn.bowlers[inn.current_bowler].name
    lead = f"{bowler} to {batter}: "
    if r.wicket and r.wicket.kind == "bowled":
        return lead + "BOWLED! The stumps are shattered."
    if r.wicket:
        return lead + f"OUT! Caught by {r.wicket.fielder}."
    if note:
        return lead + note + " Free hit."
    if r.extra_type == "wide":
        return lead + "Way outside the line. Wide called."
    if r.extra_type == "bye":
        return lead + "Beats the bat and the keeper. Byes."
    if r.extra_type == "leg_bye":
        return lead + "Off the pads, they scamper a leg bye."
    shot = {6: "Launched into the stands! SIX!", 4: "Cracking shot, races away for FOUR!"}
    text = shot.get(r.bat_runs) or (
        "Played and missed." if r.contact == "none" else
        "Straight to the fielder, no run." if r.bat_runs == 0 else
        f"Pushed into the gap for {r.bat_runs}."
    )
    if r.extra_type == "no_ball":
        text = "NO BALL! " + text + " Next ball is a free hit."
    return lead + text


def _over_symbol(r: BallResult) -> str:
    if r.wicket:
        return "W"
    if r.extra_type == "wide":
        return "wd"
    if r.extra_type == "no_ball":
        return f"nb+{r.bat_runs}" if r.bat_runs else "nb"
    if r.extra_type == "bye":
        return f"{r.extra_runs}b"
    if r.extra_type == "leg_bye":
        return f"{r.extra_runs}lb"
    return "•" if r.bat_runs == 0 else str(r.bat_runs)


def _apply(state: MatchState, inn: Innings, r: BallResult) -> None:
    """Write one ball's result into the scorecard and move the match on."""
    batter = inn.batters[inn.striker]
    bowler = inn.bowlers[inn.current_bowler]
    legal = r.delivery.kind == "legal"

    inn.runs += r.bat_runs + r.extra_runs
    batter.runs += r.bat_runs
    batter.fours += r.bat_runs == 4
    batter.sixes += r.bat_runs == 6
    if r.delivery.kind != "wide":
        batter.balls += 1

    if r.extra_type == "wide":
        inn.extras.wides += r.extra_runs
        bowler.runs += r.extra_runs
    elif r.extra_type == "no_ball":
        inn.extras.no_balls += r.extra_runs
        bowler.runs += r.extra_runs + r.bat_runs
    else:
        bowler.runs += r.bat_runs
        if r.extra_type == "bye":
            inn.extras.byes += r.extra_runs
        elif r.extra_type == "leg_bye":
            inn.extras.leg_byes += r.extra_runs

    if legal:
        inn.legal_balls += 1
        bowler.balls += 1

    inn.this_over.append(_over_symbol(r))
    state.last_ball = r
    state.pending_delivery = None
    # A free hit carries over a wide, and a no-ball always earns one.
    state.free_hit = r.delivery.kind == "no_ball" or (r.delivery.kind == "wide" and state.free_hit)

    # Batters swap ends after an odd number of runs actually run.
    ran = r.bat_runs if r.bat_runs not in (4, 6) else 0
    if r.extra_type in ("bye", "leg_bye") and r.extra_runs != 4:
        ran = r.extra_runs
    if ran % 2 == 1:
        inn.striker, inn.non_striker = inn.non_striker, inn.striker

    if r.wicket:
        inn.wickets += 1
        bowler.wickets += 1
        # Bowled and caught always dismiss the striker, and no runs are run.
        batter.out = True
        batter.dismissal = (
            f"b {r.wicket.bowler}"
            if r.wicket.kind == "bowled"
            else f"c {r.wicket.fielder} b {r.wicket.bowler}"
        )
        players = state.teams[inn.batting].players
        if inn.wickets < len(players) - 1:
            inn.batters.append(BatterCard(name=players[len(inn.batters)].name))
            inn.striker = len(inn.batters) - 1  # the new batter takes strike

    if _innings_over(state, inn):
        _finish_innings(state, inn)
        return

    if legal and inn.legal_balls % BALLS_PER_OVER == 0:
        inn.over_complete = True
        inn.striker, inn.non_striker = inn.non_striker, inn.striker
        over = inn.legal_balls // BALLS_PER_OVER
        order = state.teams[inn.bowling].bowling_order
        name = order[over % len(order)]
        existing = [i for i, b in enumerate(inn.bowlers) if b.name == name]
        if existing:
            inn.current_bowler = existing[0]
        else:
            inn.bowlers.append(BowlerCard(name=name))
            inn.current_bowler = len(inn.bowlers) - 1


def _innings_over(state: MatchState, inn: Innings) -> bool:
    all_out = inn.wickets >= len(state.teams[inn.batting].players) - 1
    overs_done = inn.legal_balls >= state.overs_per_innings * BALLS_PER_OVER
    chased = state.target is not None and inn.runs >= state.target
    return all_out or overs_done or chased


def _finish_innings(state: MatchState, inn: Innings) -> None:
    inn.complete = True
    inn.over_complete = True
    if state.phase == "innings1":
        state.target = inn.runs + 1
        state.phase = "innings_break"
        return

    state.phase = "finished"
    first, second = state.innings
    names = {code: team.name for code, team in state.teams.items()}
    if second.runs >= state.target:
        wickets_left = len(state.teams[second.batting].players) - 1 - second.wickets
        balls_left = state.overs_per_innings * BALLS_PER_OVER - second.legal_balls
        state.winner = second.batting
        state.result = (
            f"{names[second.batting]} won by {wickets_left} wicket{'s' if wickets_left != 1 else ''}"
            f" ({balls_left} ball{'s' if balls_left != 1 else ''} left)"
        )
    elif second.runs == first.runs:
        state.winner = None
        state.result = "Match tied!"
    else:
        margin = first.runs - second.runs
        state.winner = first.batting
        state.result = f"{names[first.batting]} won by {margin} run{'s' if margin != 1 else ''}"
    on_match_finished(state)


def on_match_finished(state: MatchState) -> None:
    """Hook for saving finished matches (e.g. to Supabase) in a later version."""


def simulate_innings(state: MatchState, rng: random.Random) -> None:
    """Play the rest of the computer's innings instantly."""
    inn = current_innings(state)
    if inn.batting == state.user_team:
        raise RuleError("You can't skip your own innings.")
    while not inn.complete:
        next_delivery(state, rng)
        play_ball(state, None, "straight", rng)
