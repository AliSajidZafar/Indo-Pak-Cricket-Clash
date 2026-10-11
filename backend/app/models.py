"""Data shapes shared by the engine and the API.

The frontend mirrors these in frontend/types/match.ts, so keep the two in sync.
"""

from typing import Literal

from pydantic import BaseModel, Field, computed_field

TeamCode = Literal["IND", "PAK"]
Phase = Literal["toss", "innings1", "innings_break", "innings2", "finished"]
DeliveryKind = Literal["legal", "wide", "no_ball"]
Line = Literal["wide_leg", "leg", "stumps", "off", "wide_off"]
Length = Literal["yorker", "full", "good", "short"]
Contact = Literal["none", "edge", "mistimed", "good", "perfect"]
ExtraType = Literal["wide", "no_ball", "bye", "leg_bye"]
Direction = Literal["leg", "straight", "off"]
CoinSide = Literal["heads", "tails"]


class Player(BaseModel):
    name: str
    role: Literal["bat", "wk", "all", "bowl"]
    bowling: Literal["pace", "spin"] | None = None


class Team(BaseModel):
    code: TeamCode
    name: str
    players: list[Player]
    bowling_order: list[str]


class FieldPosition(BaseModel):
    name: str
    angle: float
    distance: float


class BatterCard(BaseModel):
    name: str
    runs: int = 0
    balls: int = 0
    fours: int = 0
    sixes: int = 0
    out: bool = False
    dismissal: str | None = None


class BowlerCard(BaseModel):
    name: str
    balls: int = 0
    runs: int = 0
    wickets: int = 0


class Extras(BaseModel):
    wides: int = 0
    no_balls: int = 0
    byes: int = 0
    leg_byes: int = 0

    @computed_field
    @property
    def total(self) -> int:
        return self.wides + self.no_balls + self.byes + self.leg_byes


class Innings(BaseModel):
    batting: TeamCode
    bowling: TeamCode
    runs: int = 0
    wickets: int = 0
    legal_balls: int = 0
    extras: Extras = Field(default_factory=Extras)
    batters: list[BatterCard]
    striker: int = 0
    non_striker: int = 1
    bowlers: list[BowlerCard] = Field(default_factory=list)
    current_bowler: int = 0
    this_over: list[str] = Field(default_factory=list)
    over_complete: bool = False
    complete: bool = False


class Toss(BaseModel):
    call: CoinSide
    outcome: CoinSide
    winner: TeamCode
    batting_first: TeamCode


class Delivery(BaseModel):
    kind: DeliveryKind
    line: Line
    length: Length
    speed_kph: int
    free_hit: bool


class Wicket(BaseModel):
    kind: Literal["bowled", "caught"]
    batter: str
    bowler: str
    fielder: str | None = None


class Shot(BaseModel):
    angle: float
    distance: float  # >= 1.0 means it reached the boundary
    lofted: bool
    fielder: int | None  # index into MatchState.field of the fielder involved


class BallResult(BaseModel):
    delivery: Delivery
    swung: bool
    timing_ms: int | None
    contact: Contact
    shot: Shot | None
    bat_runs: int
    extra_type: ExtraType | None
    extra_runs: int
    wicket: Wicket | None
    label: str
    commentary: str


class MatchState(BaseModel):
    id: str
    user_team: TeamCode
    teams: dict[TeamCode, Team]
    overs_per_innings: int
    phase: Phase = "toss"
    toss: Toss | None = None
    innings: list[Innings] = Field(default_factory=list)
    target: int | None = None
    pending_delivery: Delivery | None = None
    free_hit: bool = False
    last_ball: BallResult | None = None
    result: str | None = None
    winner: TeamCode | None = None
    field: list[FieldPosition]

    @computed_field
    @property
    def user_batting(self) -> bool:
        return bool(self.innings) and self.innings[-1].batting == self.user_team


# --- request bodies ---------------------------------------------------------


class NewMatchRequest(BaseModel):
    user_team: TeamCode


class TossRequest(BaseModel):
    call: CoinSide


class PlayRequest(BaseModel):
    # Milliseconds between the swing and the perfect moment: negative = early,
    # positive = late, null = no swing. Ignored when the computer is batting.
    timing_ms: int | None = None
    direction: Direction = "straight"
