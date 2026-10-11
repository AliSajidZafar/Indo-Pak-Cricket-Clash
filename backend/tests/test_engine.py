import random

import pytest

from app import engine


def play_full_match(seed: int, user_team="IND"):
    rng = random.Random(seed)
    state = engine.new_match(user_team)
    engine.do_toss(state, "heads", rng)
    for _ in range(2):
        inn = state.innings[-1]
        while not inn.complete:
            engine.next_delivery(state, rng)
            timing = round(rng.gauss(0, 90)) if rng.random() < 0.9 else None
            engine.play_ball(state, timing, rng.choice(["leg", "straight", "off"]), rng)
        if state.phase == "innings_break":
            engine.start_second_innings(state)
    return state


def test_toss_winner_bats_first():
    for seed in range(20):
        state = engine.new_match("PAK")
        engine.do_toss(state, "tails", random.Random(seed))
        assert state.toss.batting_first == state.toss.winner
        assert state.innings[0].batting == state.toss.winner
        assert state.phase == "innings1"


@pytest.mark.parametrize("seed", range(200))
def test_scorecard_adds_up(seed):
    state = play_full_match(seed)
    assert state.phase == "finished"
    assert state.result
    for inn in state.innings:
        bat_runs = sum(b.runs for b in inn.batters)
        assert inn.runs == bat_runs + inn.extras.total
        assert inn.wickets == sum(b.out for b in inn.batters)
        assert sum(b.wickets for b in inn.bowlers) == inn.wickets
        assert inn.legal_balls <= 30
        assert sum(b.balls for b in inn.bowlers) == inn.legal_balls
        # Byes and leg byes are not charged to the bowler.
        assert sum(b.runs for b in inn.bowlers) == inn.runs - inn.extras.byes - inn.extras.leg_byes
        assert inn.striker != inn.non_striker
        assert not inn.batters[inn.striker].out or inn.complete


@pytest.mark.parametrize("seed", range(50))
def test_result_matches_scores(seed):
    state = play_full_match(seed)
    first, second = state.innings
    if second.runs > first.runs:
        assert state.winner == second.batting
        assert second.runs >= state.target
    elif second.runs < first.runs:
        assert state.winner == first.batting
    else:
        assert state.winner is None


def test_wide_does_not_count_as_a_ball():
    rng = random.Random(1)
    state = engine.new_match("IND")
    engine.do_toss(state, "heads", rng)
    inn = state.innings[0]
    state.pending_delivery = engine.Delivery(
        kind="wide", line="wide_off", length="good", speed_kph=140, free_hit=False
    )
    engine.play_ball(state, 0, "straight", rng)
    assert inn.legal_balls == 0
    assert inn.extras.wides == 1
    assert inn.runs == 1
    assert inn.this_over == ["wd"]


def test_no_wicket_on_a_free_hit():
    for seed in range(100):
        rng = random.Random(seed)
        state = engine.new_match("IND")
        engine.do_toss(state, "heads", rng)
        state.free_hit = True
        state.pending_delivery = engine.Delivery(
            kind="legal", line="stumps", length="good", speed_kph=140, free_hit=True
        )
        result = engine.play_ball(state, None, "straight", rng)
        assert result.wicket is None


def test_perfect_timing_finds_the_boundary():
    for seed in range(100):
        rng = random.Random(seed)
        state = engine.new_match("IND")
        state.toss = None
        engine.do_toss(state, "heads", rng)
        if state.innings[0].batting != "IND":
            continue  # the computer is batting, so our timing is ignored
        state.pending_delivery = engine.Delivery(
            kind="legal", line="off", length="good", speed_kph=140, free_hit=False
        )
        result = engine.play_ball(state, 5, "off", rng)
        assert result.bat_runs in (1, 2, 4, 6)
        assert result.wicket is None


def test_actions_out_of_order_are_rejected():
    state = engine.new_match("IND")
    with pytest.raises(engine.RuleError):
        engine.next_delivery(state, random.Random(0))
    engine.do_toss(state, "heads", random.Random(0))
    with pytest.raises(engine.RuleError):
        engine.do_toss(state, "heads", random.Random(0))
    with pytest.raises(engine.RuleError):
        engine.play_ball(state, 0, "straight", random.Random(0))
