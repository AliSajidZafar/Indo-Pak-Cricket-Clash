import random

import pytest

from app import engine


def settle_toss(state, decision="bat"):
    """Carry the toss through to the start of the first innings, whoever won."""
    if state.phase == "elect":
        engine.elect_toss(state, decision)
    elif state.phase == "toss_result":
        engine.start_match(state)


def play_full_match(seed: int, user_team="IND"):
    rng = random.Random(seed)
    state = engine.new_match(user_team)
    engine.do_toss(state, "heads", rng)
    settle_toss(state)
    for _ in range(2):
        inn = state.innings[-1]
        while not inn.complete:
            engine.next_delivery(state, rng)
            timing = round(rng.gauss(0, 90)) if rng.random() < 0.9 else None
            engine.play_ball(state, timing, rng.choice(["leg", "straight", "off"]), rng)
        if state.phase == "innings_break":
            engine.start_second_innings(state)
    return state


def test_toss_winner_elects_and_sits_who_bats():
    """Official toss: the winner elects; batting-first follows the choice."""
    for seed in range(40):
        state = engine.new_match("PAK")
        engine.do_toss(state, "tails", random.Random(seed))
        if state.toss.winner == "PAK":
            # The user won → must be asked to choose; nothing has started yet.
            assert state.phase == "elect"
            assert state.innings == []
            engine.elect_toss(state, "bowl")
            assert state.toss.choice == "bowl"
            assert state.toss.batting_first == "IND"  # elected to bowl → other side bats
        else:
            # The computer won → it has already elected; the user just starts.
            assert state.phase == "toss_result"
            assert state.toss.choice in ("bat", "bowl")
            assert state.innings == []
            engine.start_match(state)
        assert state.phase == "innings1"
        assert state.innings[0].batting == state.toss.batting_first
        # Whoever elected to bat bats first; electing to bowl sends the other side in.
        chose = state.toss.winner
        if state.toss.choice == "bat":
            assert state.toss.batting_first == chose
        else:
            assert state.toss.batting_first == engine.other(chose)


def test_cannot_start_before_choosing():
    state = engine.new_match("IND")
    engine.do_toss(state, "heads", random.Random(3))
    if state.phase == "elect":
        with pytest.raises(engine.RuleError):
            engine.start_match(state)  # must elect first
    else:
        with pytest.raises(engine.RuleError):
            engine.elect_toss(state, "bat")  # the computer already chose


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
    settle_toss(state)
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
        settle_toss(state)
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
        settle_toss(state)
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
