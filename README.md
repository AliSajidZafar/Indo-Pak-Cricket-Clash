# Indo-Pak Cricket Clash 🏏

A small browser cricket game: **India vs Pakistan**, 5 overs a side. You pick a
team, call the toss (the winner bats first, the loser chases), bat with timed
shots, and bowl out the computer's innings — all watched from behind the
batsman, Stick Cricket style.

- **Frontend:** Next.js (App Router) + TypeScript + Tailwind CSS. The ground is
  drawn on an HTML `<canvas>` in a pseudo-3D perspective; the scorecard and menus
  are React + Tailwind.
- **Backend:** Python + FastAPI. It owns all the rules, randomness and scoring —
  the frontend only presents what the backend decides.

## What's in the game

- Toss (winner bats first), two 5-over innings, then a result + "Play again".
- Scorecard: runs/wickets, overs, both batsmen with the **striker highlighted**,
  the bowler's figures, and a ball-by-ball track for the current over.
- Extras: **wide, no-ball, bye, leg-bye** — shown as a banner and tallied.
- Dismissals: **bowled** and **caught** (with a named fielder).
- Free hit after a no-ball; a live "Need X from Y balls" chase status.
- The wicketkeeper is hidden behind the camera (as in Stick Cricket).

## Running it

You need **Node.js 20+** and **Python 3.11+**.

### 1. Backend (port 8000)

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
# source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

API docs are then at http://localhost:8000/docs. Run the tests with `pytest`.

### 2. Frontend (port 3000)

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000. If the backend runs somewhere other than
`http://localhost:8000`, set `NEXT_PUBLIC_API_URL` in `frontend/.env.local`.

## How to play

1. Pick India or Pakistan, then call the toss.
2. When you're batting: choose a direction (**← Leg / ↑ Straight / → Off**),
   press **Bowl next ball**, then tap **SPACE** (or click the pitch) as the ball
   reaches you. Good timing finds the boundary; mistimed shots can be caught.
3. When you're bowling, the opposition's innings plays out automatically.

## Project layout

```
backend/
  app/
    models.py   # shared data shapes (mirrored in frontend/types/match.ts)
    teams.py    # the two squads + fielding positions
    engine.py   # all the cricket rules
    main.py     # FastAPI routes
  tests/        # pytest suite for the engine
frontend/
  app/page.tsx        # screens + match orchestration
  components/         # Stadium (canvas), Scorecard, Banner, Flag
  lib/                # api client, render helpers, cricket helpers
  types/match.ts      # TypeScript mirror of the backend models
```
