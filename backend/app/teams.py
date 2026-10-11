"""The two squads and the fielding positions used in every match."""

from .models import FieldPosition, Player, Team

INDIA = Team(
    code="IND",
    name="India",
    players=[
        Player(name="Rohit Sharma", role="bat"),
        Player(name="Shubman Gill", role="bat"),
        Player(name="Virat Kohli", role="bat"),
        Player(name="Shreyas Iyer", role="bat"),
        Player(name="KL Rahul", role="wk"),
        Player(name="Hardik Pandya", role="all", bowling="pace"),
        Player(name="Ravindra Jadeja", role="all", bowling="spin"),
        Player(name="Axar Patel", role="all", bowling="spin"),
        Player(name="Kuldeep Yadav", role="bowl", bowling="spin"),
        Player(name="Jasprit Bumrah", role="bowl", bowling="pace"),
        Player(name="Mohammed Siraj", role="bowl", bowling="pace"),
    ],
    # One over each in a 5-over innings, in this order.
    bowling_order=[
        "Jasprit Bumrah",
        "Kuldeep Yadav",
        "Mohammed Siraj",
        "Ravindra Jadeja",
        "Hardik Pandya",
    ],
)

PAKISTAN = Team(
    code="PAK",
    name="Pakistan",
    players=[
        Player(name="Babar Azam", role="bat"),
        Player(name="Fakhar Zaman", role="bat"),
        Player(name="Saim Ayub", role="bat"),
        Player(name="Mohammad Rizwan", role="wk"),
        Player(name="Saud Shakeel", role="bat"),
        Player(name="Salman Ali Agha", role="all", bowling="spin"),
        Player(name="Shadab Khan", role="all", bowling="spin"),
        Player(name="Shaheen Afridi", role="bowl", bowling="pace"),
        Player(name="Naseem Shah", role="bowl", bowling="pace"),
        Player(name="Haris Rauf", role="bowl", bowling="pace"),
        Player(name="Abrar Ahmed", role="bowl", bowling="spin"),
    ],
    bowling_order=[
        "Shaheen Afridi",
        "Abrar Ahmed",
        "Naseem Shah",
        "Shadab Khan",
        "Haris Rauf",
    ],
)

TEAMS = {"IND": INDIA, "PAK": PAKISTAN}

# Nine visible fielders. The bowler and the (hidden) wicketkeeper make eleven.
# angle: 0 = straight down the ground, + = off side (right of screen),
#        - = leg side (left of screen). distance: fraction of boundary radius.
FIELD = [
    FieldPosition(name="Point", angle=62, distance=0.40),
    FieldPosition(name="Cover", angle=36, distance=0.44),
    FieldPosition(name="Mid-off", angle=11, distance=0.42),
    FieldPosition(name="Mid-on", angle=-11, distance=0.42),
    FieldPosition(name="Mid-wicket", angle=-36, distance=0.44),
    FieldPosition(name="Square leg", angle=-62, distance=0.40),
    FieldPosition(name="Deep cover", angle=42, distance=0.88),
    FieldPosition(name="Long-on", angle=-14, distance=0.90),
    FieldPosition(name="Deep mid-wicket", angle=-48, distance=0.88),
]
