# Project: Omi Card Game — AI-Powered Multiplayer Web Platform
**Module:** PUSL3190 Final Year Project
**Author:** Wathsara Kalhara (wathsarakalharas@gmail.com)
**University:** Plymouth University Sri Lanka (NSBM)

---

## What is this project?

This is a full-stack web application that lets people play **Omi** — a traditional Sri Lankan 4-player trick-taking card game — online in real time, against other humans or against an AI trained from scratch using reinforcement learning.

The project has two major parts:
1. A **complete multiplayer web application** (React frontend + FastAPI backend + WebSockets)
2. A **multi-agent reinforcement learning (MARL) system** that trains AI agents to play Omi at a competitive level

---

## The Game: Omi

Omi is a popular Sri Lankan card game played with 4 players in two teams (Team A: seats 0 & 2, Team B: seats 1 & 3). It uses a 32-card deck (7 through Ace in 4 suits: Clubs, Diamonds, Hearts, Spades).

**How it works:**
- Each player is dealt 8 cards
- One player declares a trump suit at the start
- Players play tricks — you must follow the lead suit if you can
- Trump cards beat all non-trump cards
- The team that wins 5 or more tricks wins the hand
- If one team wins all 8 tricks, that is a "cap" (shutout)

This is a game of strategy, teamwork, and reading your partner — which makes it an interesting and challenging problem for AI.

---

## Part 1: The Web Application

### What it does
- Players can create a room, share a room code, and invite friends to join
- Supports 1–4 human players with AI bots filling any empty seats
- Real-time gameplay over WebSockets — all players see cards played, trick results, and scores instantly
- If a human player disconnects mid-game, an AI bot automatically takes their seat so the game continues
- Players can resume a game they were disconnected from using their saved room token

### Pages & Features
- **Home** — Landing page with Supabase authentication (sign in / sign up / Google OAuth), resume game option
- **Lobby** — Create or join a room by code, configure seats (human/bot), choose bot difficulty, swap seats, start game
- **Game** — Full interactive card game: see your hand, play cards, view the trick in progress, trump suit display, score tracking, hand result screen, animated card flips and transitions
- **Profile** — View your account details and avatar
- **History** — View your past game results (win/loss/draw, scores)
- **Rules** — In-app Omi rules reference page
- **Auth / Reset Password** — Full authentication flow with Supabase

### Frontend Tech
- React 19 with TypeScript
- Vite (build tool)
- TailwindCSS v4 (styling)
- Framer Motion (animations)
- Zustand (global state management)
- Supabase JS client (authentication)
- Lucide React (icons)
- WebSocket (native browser API, real-time game state)

### Backend Tech
- FastAPI (Python web framework)
- Uvicorn (ASGI server)
- WebSockets (asyncio-based, real-time bidirectional communication)
- SQLAlchemy ORM with SQLite (development) / PostgreSQL (production)
- Supabase JWT verification (authentication)
- Room manager — handles game session lifecycle, seat management, bot injection
- Bot manager — loads the trained RL model and runs inference asynchronously for AI moves
- Game history stored in database (room ID, user ID, score, win/loss/draw, game log)
- Periodic room cleanup (inactive rooms removed every 60 seconds)

### REST API Endpoints
- `POST /api/lobby/create-room` — Create a new game room
- `POST /api/lobby/join-room` — Join an existing room by code
- `GET /api/room/{room_id}` — Get current room state
- `POST /api/room/{room_id}/configure` — Configure seats (host only)
- `POST /api/room/{room_id}/swap-seats` — Swap two seats (host only)
- `POST /api/room/{room_id}/start` — Start the game (host only)
- WebSocket: `ws://server/ws/{room_id}` — Real-time game events

---

## Part 2: The Reinforcement Learning System

### What it does
A custom multi-agent reinforcement learning pipeline that trains AI agents to play Omi from zero knowledge — no hardcoded strategies, no human game data. The agents learn purely through self-play and reward signals.

### The Environment
- Built from scratch using the **PettingZoo AEC (Agent Environment Cycle)** interface
- Implements the full Omi rules engine: dealing, trump declaration, must-follow-suit enforcement, trick resolution, early termination, score calculation
- **Action masking** — illegal actions (playing a card you don't have, not following suit when you can) are masked out so the agent only learns from legal moves
- **195-dimensional observation vector** per agent, encoding:
  - Cards in hand (one-hot)
  - Cards played so far in the current trick
  - Cards played in previous tricks
  - Trump suit
  - Current score
  - Which player declared trump
  - Team assignments
  - Who led the current trick
- **36-dimensional action space** (32 card plays + 4 trump suit declarations)

### The Algorithm
- **MAPPO** — Multi-Agent Proximal Policy Optimization
- All 4 agents share the same policy network (parameter sharing)
- Centralized critic (sees full game state) with decentralized actors (each agent only sees its own observation)
- Learning rate annealing: 3×10⁻⁴ → 1×10⁻⁵
- Entropy coefficient annealing: encourages exploration early, becomes more deterministic over time
- GAE (Generalized Advantage Estimation) with λ=0.95, γ=0.99
- PPO clip range: 0.2
- 3 PPO epochs per update
- Batch size: 2048
- 10 parallel environments during training

### Reward Shaping
The agents are guided by a rich reward shaping system designed for the cooperative nature of Omi:
- **Trick reward** (+0.04 per trick won by your team)
- **Terminal reward** — scaled by margin: `(tricks_won - 4) / 4 × 2.0` (win) or mirror penalty (loss)
- **Cap bonus / penalty** (±0.4 for winning/losing all 8 tricks)
- **Trump quality bonus** (+0.12 × trump quality × win fraction — rewards good trump declaration)
- **Declarer bonuses** — rewards the trump declarer's team for winning
- **Partner save reward** (+0.08 — for choosing not to overtake a trick your partner is already winning)
- **Trump cut reward** (+0.02 — for cutting a non-trump lead with trump)
- **Wasted trump penalty** (−0.06 — for playing trump when not needed)
- **Late trick reward** (+0.03 — for winning tricks 6, 7, 8)
- **Illegal action penalty** (−0.1)
- **Overplay penalty** (−0.10 — for stealing a trick your partner was already winning when it wasn't necessary)

### Training Results
| Metric | Value |
|--------|-------|
| Total training episodes | 4,000,000 |
| Training duration | ~4 days on AMD Ryzen 5 5600G (CPU only) |
| Final win rate vs rule-based baseline | **60% wins, 20% losses, 20% draws** |
| Win rate at 1M episodes | 50% |
| Win rate at 2M episodes | 54% |
| Win rate at 3M episodes | 56% |
| Win rate at 4M episodes | 60% |
| Final value loss | 0.0235 |
| Final policy loss | −0.000256 |

The agent's win rate kept improving throughout training and reached 60% by the end — beating a hand-crafted rule-based opponent in 60% of decisive games.

### Model Architecture
- **Policy network (actor):** MLP, ~474,000 parameters
- **Critic network (value):** Separate MLP, same size
- Input: 195-dimensional observation
- Output: logits over 36 actions (softmax + action mask applied)
- Model size: ~1.9 MB (easily deployable)
- No recurrent layers (feedforward only, no hidden state between steps)

### Training Infrastructure
- 10 parallel environments for data collection
- Checkpoints saved every 5,000 episodes
- Periodic evaluation against rule-based baseline every 10,000 episodes (1,000 eval games per checkpoint)
- Training metrics logged to CSV: win rate, policy loss, value loss, entropy, illegal actions, shaping events
- Curriculum learning: once the learned policy achieves >65% win rate over a 500-episode window, a frozen copy of it becomes the opponent (self-play improvement)
- Training plots auto-generated: win rate, losses, entropy, illegal actions, reward shaping events

### Baselines Used for Evaluation
1. **Rule-based agent** — A hand-crafted agent that follows deterministic Omi strategy (follow suit, play highest card it can win with, cut with trump if needed)
2. **Random agent** — Plays a random legal card each turn

### Deployment
- Trained weights exported as a single `.pt` file (1.9 MB)
- Loaded by the FastAPI backend at startup via `OmiAgent` inference wrapper
- Bot inference runs asynchronously (non-blocking) so it doesn't stall real-time gameplay
- Falls back to random legal move if model fails to load

---

## Key Numbers Summary

| Item | Value |
|------|-------|
| Observation space | 195 dimensions |
| Action space | 36 (32 cards + 4 trump suits) |
| Model parameters | ~474,000 |
| Model file size | 1.9 MB |
| Training episodes | 4,000,000 |
| Training hardware | AMD Ryzen 5 5600G (CPU only, no GPU) |
| Final AI win rate vs rule baseline | 60% |
| Frontend framework | React 19 + TypeScript |
| Backend framework | FastAPI (Python) |
| Real-time protocol | WebSockets |
| Auth provider | Supabase |
| Database | SQLite / PostgreSQL |
| RL algorithm | MAPPO (Multi-Agent PPO) |
| RL library | PyTorch + PettingZoo |

---

## What Makes This Project Interesting

- **End-to-end**: Everything was built from scratch — the game engine, the RL environment, the training loop, the web app, the deployment pipeline
- **CPU-only training**: The entire 4M episode training run was done on a consumer CPU (Ryzen 5 5600G) with no GPU, taking roughly 4 days
- **Culturally specific**: Omi is a game specific to Sri Lanka with no existing AI implementations to reference
- **Cooperative AI**: The agents had to learn not just to play cards well, but to cooperate with a partner they cannot communicate with — emerging strategies like saving partner's trick, smart trump cutting
- **Live deployment**: The trained model is not just a research artifact — it runs in real time inside a fully playable multiplayer web app
- **Full-stack scope**: The project spans reinforcement learning research, game theory, backend engineering, real-time systems, frontend development, and authentication — all in one project
