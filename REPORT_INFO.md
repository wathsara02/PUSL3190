# PUSL3190 Final Report — Full Project Information
## Omi Card Game Web Application with Reinforcement Learning AI

> **How to use this file:** This document contains all technical detail, architecture descriptions,
> training data, and implementation notes needed to write the full PUSL3190 final report.
> Placeholders marked `[SCREENSHOT: ...]` indicate where screenshots or charts should be inserted.
> Sections marked `[DIAGRAM: ...]` contain enough detail for an AI to auto-generate the diagram.

---

## PROJECT OVERVIEW

**Project Title:** Omi Card Game Web Application with Multi-Agent Reinforcement Learning AI

**Technology Summary:**
- Backend: Python 3.12, FastAPI, SQLAlchemy, SQLite, Supabase Auth (JWT), WebSocket (native FastAPI)
- Frontend: TypeScript, React 18, Vite, Tailwind CSS
- Real-time: WebSocket (per-room connections), WebRTC (peer-to-peer voice)
- AI/ML: PyTorch 2.x, PettingZoo AEC, MAPPO (Multi-Agent PPO), self-play, curriculum learning
- Training hardware: AMD Ryzen 5 5600G CPU (no GPU), Windows 11

---

## ABSTRACT (suggested content)

This project implements a full-stack multiplayer web application for the Sri Lankan card game Omi,
integrated with a trained reinforcement learning AI agent. The backend is built with FastAPI and
communicates with clients via WebSocket for real-time game state synchronisation. The frontend is
a React/Vite SPA with a casino-style UI, Supabase-based user authentication, and WebRTC voice chat.
The AI opponent is trained using Multi-Agent Proximal Policy Optimisation (MAPPO) with symmetric
self-play over 1.75 million episodes on commodity CPU hardware, achieving a 72% decisive win rate
against a hand-coded rule-based baseline. This report documents the design, implementation, training
methodology, and evaluation of the complete system.

---

## CHAPTER 1 — INTRODUCTION

### 1.1 Motivation
Omi is a popular trick-taking card game in Sri Lanka, traditionally played in-person with four
players. The aim of this project is to bring Omi online with real-time multiplayer support and an
AI opponent capable of playing at a competent level so users can play without needing four humans.

### 1.2 Scope
The project delivers two distinct components:
1. **Web Application** — lobby, room management, real-time multiplayer gameplay, optional voice
   chat, user authentication, game history, and AI bot opponents.
2. **RL Agent** — a trained neural network policy for Omi, developed using MARL (multi-agent RL)
   techniques, exportable and deployable as a game bot.

### 1.3 Report Structure
Chapter 2 describes the background and objectives. Chapter 3 covers the method of approach and
requirements. Chapters 4–5 detail the system and RL architectures. Chapter 6 presents training
results. Chapter 7 is the end-project report. Chapter 8 is the post-mortem. Chapter 9 concludes.

---

## CHAPTER 2 — BACKGROUND, OBJECTIVES & DELIVERABLES

### 2.1 Omi Game Rules
- **Deck:** 32 cards — ranks 7, 8, 9, 10, J, Q, K, A in four suits (Clubs, Diamonds, Hearts, Spades)
- **Players:** 4 players in two fixed teams: Team 0 (players 0 and 2) vs Team 1 (players 1 and 3)
- **Deal:** Each player receives 4 cards initially. The player designated as the **declarer** then
  chooses a trump suit from the 4 suits. After declaration, 4 more cards are dealt to each player
  (8 cards total per player).
- **Play:** Players take turns playing one card per trick (8 tricks per hand). Must-follow-suit
  rules apply: if a player holds a card matching the led suit, they must play it.
- **Trick resolution:** The highest trump card wins a trick if any trump was played; otherwise the
  highest card of the led suit wins.
- **Scoring:** The team with more than 4 tricks wins. Winning all 8 tricks is called a "cap."
  A 4-4 result is a draw. Scores are accumulated across hands (the number of winning hands).
- **Victory:** First team to a predetermined score threshold wins the match (tracked across hands).

### 2.2 Project Objectives
1. Implement the complete Omi rules engine as a PettingZoo AEC environment.
2. Train a MARL agent using MAPPO self-play to play Omi competently.
3. Build a real-time multiplayer web application supporting human vs human, human vs bot, and
   mixed configurations.
4. Integrate the trained RL agent as a bot opponent in the web application.
5. Implement user authentication, game history persistence, and optional voice communication.

### 2.3 Deliverables
| # | Deliverable | Status |
|---|-------------|--------|
| 1 | Omi rules engine (PettingZoo-compatible) | Complete |
| 2 | MAPPO training pipeline with self-play | Complete |
| 3 | Trained AI model (weights.pt) at 72% decisive win rate | Complete |
| 4 | FastAPI backend with REST + WebSocket API | Complete |
| 5 | React/TypeScript frontend SPA | Complete |
| 6 | Supabase authentication integration | Complete |
| 7 | Game history persistence (SQLite) | Complete |
| 8 | WebRTC voice chat | Complete |
| 9 | Disconnect / reconnect handling with bot takeover | Complete |

---

## CHAPTER 3 — METHOD OF APPROACH & REQUIREMENTS

### 3.1 Development Process
An iterative development approach was followed:
- **Phase 1:** Rules engine and environment development, unit-tested
- **Phase 2:** RL training pipeline; agent trained and evaluated
- **Phase 3:** Backend API and game server development
- **Phase 4:** Frontend development and integration
- **Phase 5:** Advanced features (auth, WebRTC, disconnect handling, reward tuning)

### 3.2 Functional Requirements
| ID | Requirement |
|----|-------------|
| FR1 | Users can create and join game rooms using a unique room code |
| FR2 | Host can configure seats (open/human/bot with difficulty) |
| FR3 | Game enforces Omi rules including must-follow-suit and trump declaration |
| FR4 | Real-time game state synchronisation via WebSocket |
| FR5 | AI bot can play any seat using trained MAPPO policy |
| FR6 | Users can authenticate via Supabase (email/OAuth) |
| FR7 | Authenticated users have game history persisted in SQLite |
| FR8 | Players can communicate via WebRTC voice chat |
| FR9 | Disconnected players trigger a bot takeover after 10 seconds |
| FR10 | Reconnecting players reclaim their seat and remove the takeover bot |

### 3.3 Non-Functional Requirements
| ID | Requirement |
|----|-------------|
| NFR1 | WebSocket state broadcast latency < 100ms on LAN |
| NFR2 | Bot inference < 500ms per turn (CPU) |
| NFR3 | Frontend is responsive across desktop screen sizes |
| NFR4 | Authentication tokens expire and are validated server-side |
| NFR5 | No private game state (hand cards) exposed to wrong clients |

---

## CHAPTER 4 — SYSTEM ARCHITECTURE

### 4.1 High-Level Architecture

[DIAGRAM: Draw a three-tier architecture diagram with the following layers:
  TOP LAYER (Clients): 
    - Browser A (Player 1) — React SPA
    - Browser B (Player 2) — React SPA  
    - Browser C (Player 3) — React SPA
    - Browser D (Player 4) — React SPA
    Label WebRTC peer-to-peer arrows between browsers (voice/ICE signalling)
  
  MIDDLE LAYER (Backend Server):
    - FastAPI Application (Python)
    - Inside it: REST API Router | WebSocket Router | Room Manager | Bot Manager
    - Room Manager contains: RoomState, OmiEnv, Seat[0..3], disconnect tasks
    - Bot Manager contains: OmiAgent (PolicyNet weights.pt)
  
  BOTTOM LAYER (Data):
    - SQLite DB (game_history table)
    - Supabase (Auth service, external)
  
  Arrows:
    - Browsers ↔ FastAPI: HTTPS REST (create/join room, start game)
    - Browsers ↔ FastAPI: WSS WebSocket /ws/{room_id} (real-time game state)
    - FastAPI → SQLite: SQLAlchemy ORM
    - FastAPI → Supabase: HTTPS JWT verification
    - Browsers ↔ Browsers: WebRTC (peer-to-peer, ICE signalled via FastAPI WebSocket)
]

[SCREENSHOT: System running — show the lobby and game page side by side]

### 4.2 Backend Architecture

**Framework:** FastAPI (Python async framework)  
**Entry point:** `app/main.py` — registers routers, CORS middleware, and lifespan tasks

**Modules:**
| Module | Path | Responsibility |
|--------|------|----------------|
| REST API | `app/api/routes.py` | Room create/join/configure/start endpoints |
| Auth API | `app/api/auth.py` | Supabase login/callback, session management |
| WebSocket | `app/ws/sockets.py` | Per-room WS endpoint, auth handshake, message dispatch |
| Connection Manager | `app/ws/connection.py` | Tracks active connections, broadcasts state |
| Room Manager | `app/game/room_manager.py` | In-memory room registry, game state, bot turns |
| Bot Manager | `app/ai/bot_manager.py` | OmiAgent wrapper, async inference |
| OmiAgent | `app/rl_model/omi_agent.py` | Loads PolicyNet weights, runs forward pass |
| Security | `app/core/security.py` | JWT creation/verification, Supabase token validation |
| DB Models | `app/db/models.py` | SQLAlchemy GameHistory table |
| Schemas | `app/models/schemas.py` | Pydantic request/response models |

**Key design decisions:**
- `RoomManager` is a singleton holding all active rooms in-memory (no DB for active game state)
- Each room has an `asyncio.Lock` for thread-safe state mutation
- Bot turns run as `asyncio.create_task` so they don't block WebSocket handlers
- Disconnect bot-takeover uses `asyncio.create_task` with 10-second sleep; cancelled on reconnect
- `_displaced_humans` dict stores evicted player data so they can reclaim their seat

### 4.3 REST API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/lobby/create-room` | Create room, host gets seat 0 and a token |
| POST | `/api/lobby/join-room` | Join room, get a token and assigned seat |
| GET | `/api/room/{room_id}` | Get current room state snapshot |
| POST | `/api/room/{room_id}/configure` | Host sets seat types (human/bot/open) |
| POST | `/api/room/{room_id}/swap-seats` | Host swaps two seat positions |
| POST | `/api/room/{room_id}/start` | Host starts the game |
| GET | `/health` | Health check (DB connectivity) |

**Authentication:** Room tokens are UUID strings stored in memory. Supabase JWT is optional — if
provided, the user UUID is stored with the seat for game history attribution.

### 4.4 WebSocket Protocol

Each client connects to `/ws/{room_id}` and must complete an auth handshake within 5 seconds:

[DIAGRAM: Draw a sequence diagram showing WebSocket message flow:
  Participants: Client, FastAPI WS Handler, Room Manager, Connection Manager
  
  Sequence:
  1. Client → FastAPI: TCP connect to /ws/{room_id}
  2. FastAPI → Client: WebSocket accept
  3. Client → FastAPI: {"type": "auth", "token": "<room_token>"}  (must arrive within 5s)
  4. FastAPI → Room Manager: verify token (get_seat_for_token or _displaced_humans)
  5. FastAPI → Connection Manager: register(websocket, room_id, token)
  6. FastAPI → Room Manager: on_player_reconnect(token)
  7. Room Manager → Connection Manager: broadcast_state(room_id)  [if reconnected]
  8. FastAPI → Client: {"type": "snapshot", "payload": RoomStateSnapshot}
  
  Loop [game in progress]:
    Client → FastAPI: {"type": "action", "action": <int>}
    FastAPI → Room Manager: process_action(token, action)
    Room Manager → Connection Manager: broadcast_state(room_id)
    Connection Manager → All Clients: {"type": "snapshot", "payload": updated state}
  
  Optional:
    Client → FastAPI: {"type": "audio_status", "muted": bool, "deafened": bool}
    Client → FastAPI: {"type": "webrtc_offer/answer/ice_candidate", "target_peer_id": "..."}
    FastAPI → Target Client: forwarded WebRTC signalling message
  
  On disconnect:
    FastAPI → Room Manager: on_player_disconnect(token)
    Room Manager: starts 10s asyncio task
    [after 10s] Room Manager: replaces seat with bot, broadcasts state
]

### 4.5 Disconnect / Reconnect System

Three states for a player seat during an active game:
1. **Connected** — normal play; `is_disconnected = False`
2. **Disconnected-pending** — `is_disconnected = True`, 10-second countdown task running;
   other clients see a pulsing "Disconnected" badge. If player reconnects before 10s, the task
   is cancelled and the player resumes.
3. **Displaced** — bot has taken the seat (`seat.type = "bot"`). Original player data is stored
   in `_displaced_humans[seat_id]`. If the displaced player reconnects, they reclaim their seat
   and the bot is removed.

### 4.6 Frontend Architecture

**Framework:** React 18 + Vite + TypeScript  
**Styling:** Tailwind CSS with custom casino/poker dark theme  
**State:** React hooks (useState, useEffect, useRef), WebSocket ref

**Pages:**
| Page | Path | Description |
|------|------|-------------|
| Home | `/` | Landing page with create/join room |
| Auth | `/auth` | Supabase login/signup form |
| AuthCallback | `/auth/callback` | Handles Supabase OAuth redirect |
| Room | `/room/:id` | Lobby — seat configuration, waiting for players |
| Game | `/game/:id` | Active game — card table, hand, trick display |
| History | `/history` | Authenticated user's past game results |
| Profile | `/profile` | User profile, avatar selection |
| Rules | `/rules` | Static Omi rules reference page |

**Key components:**
- `PlayerAvatar` — renders player avatar, name, status badges (disconnected, muted, deafened)
- `ModernBackground` — animated casino-style gradient background
- `ErrorBanner` — dismissable error display

[SCREENSHOT: Game.tsx — show the active game table with cards, trick, and player positions]
[SCREENSHOT: Room.tsx — show the lobby with seat configuration]
[SCREENSHOT: Home.tsx — show the landing page]

### 4.7 Database Schema

**SQLite** (via SQLAlchemy ORM), single table:

[DIAGRAM: Draw an entity-relationship diagram with one table:
  Table: game_history
    - id: INTEGER PRIMARY KEY AUTOINCREMENT
    - user_id: VARCHAR (nullable, Supabase UUID, indexed)
    - date: DATETIME (server default: now(), timezone-aware)
    - score_us: INTEGER NOT NULL
    - score_them: INTEGER NOT NULL
    - status: VARCHAR NOT NULL  (values: "win", "loss", "tie")
    - game_log: VARCHAR (nullable, JSON match trace string)
  
  Note: user_id links to Supabase Auth users (external service, no FK enforced)
]

### 4.8 Authentication Flow

[DIAGRAM: Draw a flow diagram:
  Option A (Anonymous):
    User → creates/joins room → gets UUID room token → plays game
    No account needed, no history saved
  
  Option B (Supabase Auth):
    User → clicks Login → Supabase email/OAuth → redirect to /auth/callback
    Frontend stores Supabase access token in localStorage
    When creating/joining room → sends auth_token in request body
    Backend → calls Supabase /auth/v1/user with the token → gets user UUID
    UUID stored in room seat → on game end, game_history row inserted with user_id
]

---

## CHAPTER 5 — RL AGENT ARCHITECTURE & TRAINING

### 5.1 Environment Design

**Framework:** PettingZoo AEC (Agent-Environment Cycle) API  
**File:** `finalwm/omi_env/env.py`

The environment implements Omi as a sequential multi-agent environment where agents take turns.
PettingZoo's AEC pattern naturally maps to Omi's turn-based structure.

**Observation space per agent:**

[DIAGRAM: Draw a table/breakdown of the observation vector (195 dimensions total):
  Component                 | Dimensions | Description
  hand_vec                  | 32         | One-hot: which cards the agent holds
  trump_vec                 | 4          | One-hot: current trump suit (or zeros)
  lead_vec                  | 4          | One-hot: lead suit of current trick (or zeros)
  trick_flat                | 128 (4×32) | One-hot card for each of 4 trick positions (padded)
  score_vec                 | 2          | Normalised tricks won (team0/8, team1/8)
  player_vec                | 4          | One-hot: which player this agent is (0-3)
  suit_counts               | 4          | Fraction of hand per suit (helps trump selection)
  void_flat                 | 16 (4×4)   | Estimated void matrix: player × suit
  hand_strength             | 1          | Scalar hand strength normalised to [0,1]
  TOTAL                     | 195        |
  
  Additionally, a history tensor (32 × 44) is passed separately:
  History row per play: [card one-hot (32) | player one-hot (4) | lead suit (4) | trump suit (4)]
  Last 32 plays tracked (one full hand = 32 card plays)
]

**Action space:** 36 actions — indices 0-31 are card plays (card index in the 32-card deck),
indices 32-35 are trump declaration actions (one per suit: C/D/H/S).

**Illegal action handling:** Illegal actions are penalised and replaced with the first legal action
(forced legal play). This prevents environment crashes and discourages illegal move selection.

**Void matrix inference:** `compute_void_matrix()` deduces which suits players are likely void in,
based on failure to follow suit in previous tricks. This is encoded in the observation to give
the agent implicit information about opponent hands without violating information constraints.

### 5.2 Reward Shaping Design

The reward function combines a terminal outcome reward with dense shaping signals:

**Terminal reward (dominant signal):**
```
Win:  r = (my_tricks - 4) / 4 × 2.0     → range [0.5, 2.0]
Loss: r = -(opp_tricks - 4) / 4 × 2.0   → range [-0.5, -2.0]
Cap win bonus:  +0.4  (winning all 8 tricks)
Cap loss penalty: -0.4 (opponent wins all 8 tricks)
Draw: r = 0.0
```

**Dense shaping signals:**

| Signal | Value | Trigger |
|--------|-------|---------|
| trick_reward | +0.04 | Each trick won by the agent's team |
| late_trick_reward | +0.03 | Each trick won after trick 6 (decisive tricks) |
| trump_cut_reward | +0.02 | Winning a trick by cutting with trump |
| declarer_bonus | +0.05 | Declarer's personal bonus for team win |
| trump_quality_bonus | up to +0.12 | Scaled by trump count × win fraction |
| declarer_team_win_bonus | +0.1 | Whole declarer team bonus for winning |
| declarer_team_loss_penalty | -0.1 | Whole declarer team penalty for losing |
| partner_save_reward | +0.08 | Correctly not overtaking winning partner |
| overplay_penalty | -0.10 | Taking a trick when partner was winning and safe move existed |
| wasted_trump_penalty | -0.06 | Playing trump that doesn't win (and partner wasn't winning) |
| illegal_action_penalty | -0.10 | Attempting an illegal action |

**Key design principle:** Dense rewards accumulate to a maximum of ~0.4 per episode, while the
terminal reward ranges 0.5–2.0. Terminal outcome dominates, dense rewards provide directional
gradient. Double-penalty guard: `overplay_fired` flag prevents both overplay and wasted_trump
from firing on the same card play (avoids -0.37 combined penalty on a single move).

[DIAGRAM: Draw a bar chart showing reward magnitude comparison:
  X-axis: reward components
  Y-axis: magnitude
  Bars: terminal_win(2.0), terminal_loss(-2.0), cap_bonus(0.4), cap_penalty(-0.4),
        total_max_dense(~0.4), trick_reward_single(0.04), overplay(-0.10), partner_save(0.08)
  Title: "Reward Component Magnitudes — Terminal Dominates"
]

### 5.3 Policy Network Architecture

**Type:** Feed-forward (recurrent_type="none")  
**File:** `finalwm/models/policy.py`

[DIAGRAM: Draw a neural network architecture diagram:
  Input 1: Observation vector (195 dims)
    → Linear(195 → 128) → Tanh → obs_emb (128 dims)
  
  Input 2: History tensor (32×44 = 1408 dims, flattened)
    → Linear(1408 → 256) → LayerNorm → ReLU
    → Linear(256 → 128) → LayerNorm → hist_emb (128 dims)
  
  Concatenate: [obs_emb | hist_emb] → (256 dims)
    → Linear(256 → 128) → LayerNorm → Tanh
    → Linear(128 → 128) → LayerNorm → Tanh → core_out (128 dims)
    → Linear(128 → 36) → raw logits (36 dims)
    → Action mask applied (illegal actions set to -1e9)
    → Softmax → action probabilities
  
  Output: action index (0-35) sampled from softmax probabilities
  
  Total trainable parameters: ~620K
]

**Design rationale:** History encoding replaces a recurrent network (LSTM) for simplicity and
speed on CPU. The flattened history vector gives the policy access to the full sequence of 32
card plays, preserving temporal card-play information without the complexity of LSTM state
management across multiple parallel environments.

### 5.4 Centralised Critic Architecture

**File:** `finalwm/models/critic.py`  
**CTDE paradigm:** Centralised Training, Decentralised Execution — the critic sees all 4 players'
hands during training but is not used at inference time.

[DIAGRAM: Draw the CentralCritic architecture:
  Centralised State Input:
    - All 4 hands (4 × 32 = 128 dims, one-hot per card)
    - Trump suit (4 dims), Lead suit (4 dims)
    - Current trick (4 × 32 = 128 dims)
    - Score vector (2 dims)
    → state_features (266 dims total)
    
    History (32 × 44 = 1408 dims)
  
  state_features → Linear(266 → 128) → LayerNorm → Tanh → state_emb (128)
  history → Linear(44 → 128) → Tanh → hist_proj (32 × 128)
  
  Single-head attention:
    query = Linear(128 → 128)(state_emb).unsqueeze(1)  → (1 × 128)
    key   = Linear(128 → 128)(hist_proj)               → (32 × 128)
    scores = softmax(Q × K^T × scale)                  → (1 × 32)
    attended = scores × hist_proj                       → (128)
  
  concat([state_emb, attended]) → (256)
    → Linear(256 → 128) → LayerNorm → Tanh
    → Linear(128 → 1) → V(s) scalar value output
]

### 5.5 Training Algorithm — MAPPO

**Algorithm:** Multi-Agent Proximal Policy Optimisation (MAPPO)  
**File:** `finalwm/marl/r_mappo.py`

MAPPO extends PPO to cooperative multi-agent settings:
- **Shared policy:** A single policy network is used for all 4 agents (parameter sharing)
- **Centralised critic:** The critic observes all agents' full state for value estimation
- **Symmetric self-play:** All 4 players train simultaneously, so both teams improve together

**PPO update equations:**

```
Advantage: A_t = δ_t + (γλ)δ_{t+1} + ... (GAE-λ)
where δ_t = r_t + γV(s_{t+1}) - V(s_t)

Policy loss: L_π = -min(r_t × A_t, clip(r_t, 1-ε, 1+ε) × A_t)
where r_t = π(a_t|s_t) / π_old(a_t|s_t)

Value loss: L_V = (V(s_t) - R_t)²

Total loss: L = L_π + c_v × L_V - c_e × H(π)
where H(π) is policy entropy (encourages exploration)
```

**Hyperparameters:**

| Parameter | Value | Notes |
|-----------|-------|-------|
| learning_rate | 0.0003 → 0.00001 | Linear annealing over training |
| clip_range (ε) | 0.2 | Standard PPO clipping |
| entropy_coef | 0.04 → 0.003 | Annealed to allow convergence |
| value_coef | 0.5 | Critic loss weight |
| gae_lambda | 0.95 | GAE smoothing factor |
| gamma | 0.99 | Discount factor |
| batch_size | 2048 | Transitions per update |
| ppo_epochs | 3 | Gradient passes per batch |
| max_grad_norm | 0.5 | Gradient clipping |

**Curriculum learning:**
- Phase 1 (win rate < 65%): trains against frozen copy of own policy
- Phase 2 (win rate ≥ 65%): frozen policy updated every 2000 episodes to current best
- Rule-mix probability: 35% — some episodes pair the agent against the rule-based agent to
  prevent exploitation of self-play blind spots

[DIAGRAM: Draw a flowchart of the training loop:
  START
    ↓
  Reset OmiEnv (all 4 agents)
    ↓
  [For each turn in episode]
    Observe current agent state (obs, history, mask)
    PolicyNet forward pass → action probabilities
    Sample action → step environment → get reward
    Critic evaluates centralised state → V(s)
    Store (obs, action, reward, value, log_prob) in AgentBuffer
    ↓
  [Episode ends after 32 card plays + 1 trump declaration = 33 steps]
    ↓
  [If buffer has ≥ batch_size transitions]
    Compute GAE advantages
    Run PPO update (3 epochs over shuffled batch)
    Update policy and critic with Adam
    Anneal LR and entropy_coef
    ↓
  [Every 10,000 episodes]
    Evaluate policy against rule-based baseline (1000 games, deterministic)
    Log win rate, value loss, entropy, policy loss
    Save checkpoint
    ↓
  [Check curriculum threshold]
    If decisive win rate ≥ 65%: advance curriculum phase
    ↓
  Repeat until total_episodes reached
  END
]

### 5.6 Training Infrastructure

**Parallel environments:** `CloudVectorEnv` — spawns 10 parallel Omi environments as separate
processes (Windows multiprocessing with `spawn` context). Observations are collected in parallel
and batched for inference, significantly increasing throughput vs single-environment training.

**Hardware:** AMD Ryzen 5 5600G (6-core, 12 threads), 16GB RAM, no GPU.  
`torch.compile` is disabled on CPU (only activates on CUDA). Training ran for approximately
72 hours to reach 1.75 million episodes.

**Checkpointing:** Policy weights saved every 5,000 episodes as `policy_snapshot.pt`.
Each checkpoint is evaluated against the rule-based baseline (1,000 deterministic games)
and results saved to `evaluation_summary.csv`.

### 5.7 Baseline Agents

**Rule-based agent (`RuleBasedAgent`):**
- Trump declaration: selects the suit with the most cards in hand
- Card play: follows a priority heuristic — (1) if partner is winning, discard lowest card;
  (2) cut with lowest trump if can take the trick; (3) lead highest card of strongest suit
- Represents an informed, consistent opponent for curriculum training and evaluation

**Random legal agent (`RandomLegalAgent`):**
- Selects uniformly at random from legal actions
- Used for early-stage curriculum training and as a lower-bound baseline

### 5.8 Evaluation Methodology

**Decisive win rate:** Computed as wins / (wins + losses), excluding draws. This is the primary
metric because draws (4-4 result) don't advance the game score and their frequency is not
indicative of skill.

**Checkpoint progression data (key milestones):**
| Training Episode | Decisive Win Rate | Raw Win Rate | Draw Rate |
|-----------------|-------------------|--------------|-----------|
| 10,002 | ~39% | ~30% | ~22% |
| 250,000 | ~52% | ~40% | ~22% |
| 500,000 | ~58% | ~45% | ~21% |
| 1,000,000 | ~64% | ~50% | ~22% |
| 1,500,000 | ~70% | ~55% | ~21% |
| 1,750,000 | **72%** | **51.3%** | **22.1%** |

**Final evaluation (ep 1,750,000 — 1,000 games vs rule-based, deterministic):**
- Win: 51.3% | Loss: 26.6% | Draw: 22.1%
- **Decisive win rate: 72.1%**

[SCREENSHOT: plot — eval_progression.png — decisive win rate over all 175 checkpoints]
[SCREENSHOT: plot — training_summary policy loss, value loss, entropy curves]
[SCREENSHOT: plot — training_summary win/loss/draw rates over training]
[SCREENSHOT: plot — score_distribution.png — score margin histogram]
[SCREENSHOT: plot — declarer_win_rate.png — declarer team win rate over training]

---

## CHAPTER 6 — TRAINING RESULTS & ANALYSIS

### 6.1 Learning Curve Interpretation

The raw training win rate chart shows approximately 38-42% win rate throughout training. This is
**not a training defect** — it is expected behaviour from symmetric self-play. When both teams
train simultaneously, neither team has a persistent advantage, so the win rate around 50% (minus
draws) reflects a roughly equal match between improving agents.

The true evidence of learning is the **checkpoint evaluation progression**: at episode 10K the
agent loses to the rule-based baseline at 39% decisive win rate, and steadily improves to 72%
by episode 1.75M.

[SCREENSHOT: checkpoint eval progression chart — show the learning curve from 39% to 72%]

### 6.2 Training Health Indicators

**Policy loss:** Declined from ~0.08 to ~0.02 over training — the policy is converging toward
a stable behaviour.

**Value loss:** Declined from ~0.4 to ~0.10 but still slowly decreasing at 1.75M episodes —
the critic has not fully converged, indicating potential for further improvement with more training.

**Entropy:** Declined from ~0.85 nats to ~0.35 nats — the policy is becoming more decisive but
still exploring. Final entropy_coef_end of 0.003 will allow further decay in continued training.

**Illegal actions:** Declined to near-zero over training — the agent learned to respect
must-follow-suit rules and legal action constraints.

[SCREENSHOT: entropy decay curve]
[SCREENSHOT: value loss curve]
[SCREENSHOT: illegal actions over training]

### 6.3 Score Distribution Analysis

[SCREENSHOT: score_distribution.png — show grouped bar chart of trick margins]

The score distribution shows the agent frequently achieves 5-6 trick margins (close wins) and
occasionally caps (8 tricks). As a declarer, the agent wins at a higher rate than as a defender,
reflecting the strategic advantage of trump selection.

### 6.4 Convergence Assessment

The agent at 1.75M episodes is **undertrained but functional**. Key indicators:
- Value loss still declining → more training would improve advantage estimation
- Entropy at 0.35 nats → policy not yet fully decisive
- Win rate still rising at final checkpoint → plateau not yet reached
- Projected plateau: ~75-80% decisive win rate with additional 750K+ episodes

For the purposes of this project, 72% decisive win rate constitutes a **competent, deployable
agent** that clearly outperforms the rule-based baseline.

---

## CHAPTER 7 — END-PROJECT REPORT

### 7.1 Objectives Review

| Objective | Outcome |
|-----------|---------|
| Implement Omi rules engine | Fully implemented; unit tested with 20+ test cases |
| Train MAPPO agent | Trained to 72% decisive win rate; deployed to webapp |
| Build real-time multiplayer webapp | Complete with WebSocket, lobby, room management |
| Integrate RL agent as bot | Complete; OmiAgent loads weights.pt, runs CPU inference |
| Authentication | Complete via Supabase with optional anonymous play |
| Game history | Complete; SQLite persistence for authenticated users |
| Voice chat | Complete via WebRTC with mute/deafen controls |
| Disconnect handling | Complete; 10s bot takeover with reconnect restore |

### 7.2 Changes During Development

1. **Reward shaping evolved significantly** — initial rewards used larger dense penalties
   (-0.22 overplay, -0.15 wasted trump) that created double-penalty scenarios. Values were
   reduced and a `overplay_fired` guard was added after training analysis.

2. **Curriculum learning added mid-project** — initially disabled; added after observing that
   pure self-play caused the agent to exploit predictable patterns. The rule-mix probability
   (35%) and frozen-opponent curriculum prevent over-fitting to self-play.

3. **Disconnect handling added as a late feature** — initially disconnected players simply left
   their seat empty. The 10-second bot-takeover system was designed and implemented to prevent
   games from stalling.

4. **WebRTC voice added** — peer-to-peer signalling routed through existing WebSocket connection
   (offer/answer/ICE messages forwarded by server), avoiding need for a TURN server for LAN use.

### 7.3 Known Limitations

- Training performed on CPU only; agent would be significantly stronger with GPU training
- Voice chat requires WebRTC browser support; may degrade on restrictive NAT networks without TURN
- Room state is in-memory only; server restart clears all active games
- Agent does not differentiate difficulty levels (easy/medium/hard use same weights)

---

## CHAPTER 8 — POST-MORTEM

### 8.1 What Worked Well
- PettingZoo AEC was an excellent fit for Omi's turn-based structure
- FastAPI's async WebSocket support required minimal boilerplate for real-time state sync
- Symmetric MAPPO self-play produced consistent, progressive learning without reward engineering
  for opponent cooperation
- Separation of RL training code from webapp code kept both codebases clean

### 8.2 What Could Be Improved
- **GPU training**: 72 hours on CPU to reach 1.75M episodes. A mid-range GPU would reduce
  this to ~8 hours, enabling more hyperparameter experiments
- **Recurrent policy (LSTM)**: the feed-forward policy's flattened history is not as expressive
  as a true recurrent network for sequential reasoning about card play
- **Database**: SQLite is sufficient for development but would need migration to PostgreSQL
  for production multi-user deployment
- **Testing**: integration tests for the WebSocket game flow were not implemented; testing was
  limited to unit tests for the rules engine and environment

### 8.3 Technology Choices Reflection
- **FastAPI** was the right choice — async-native, fast, excellent WebSocket support, Pydantic
  validation reduces bugs at API boundaries
- **PettingZoo** introduced some complexity with the AEC loop but provided a clean interface
  that made the MAPPO training loop straightforward
- **Supabase** was useful for OAuth/email auth out-of-the-box but adds an external dependency;
  a self-hosted auth solution would improve portability
- **Tailwind CSS** enabled rapid UI iteration but custom casino styling required significant
  override work

---

## CHAPTER 9 — CONCLUSIONS

This project successfully delivers a complete Omi card game platform combining a real-time
multiplayer web application with a trained MARL AI opponent. The RL agent, trained via MAPPO
self-play on CPU hardware over 1.75 million episodes, achieves a 72% decisive win rate against
a hand-coded rule-based baseline — demonstrating that deep RL can learn competitive play in
imperfect-information cooperative card games without handcrafted strategies.

The web application provides a full feature set: room creation, configurable bot opponents,
real-time state synchronisation, optional Supabase authentication, game history, WebRTC voice
chat, and resilient disconnect/reconnect handling. The system is deployable as a self-contained
application with minimal infrastructure requirements.

Future work would focus on: GPU-accelerated training to explore higher episode counts;
a recurrent policy for richer temporal reasoning; and production deployment with PostgreSQL
and a reverse proxy.

---

## APPENDIX A — USER GUIDE

### Installation Requirements
- Python 3.12+
- Node.js 18+
- (Optional) Supabase project for authentication

### Backend Setup
```bash
cd webapp/backend
pip install -r requirements.txt
# Set environment variables:
# SECRET_KEY=<generated hex key>
# SUPABASE_URL=<your supabase url>  (optional)
# SUPABASE_SERVICE_KEY=<your service key>  (optional)
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Frontend Setup
```bash
cd webapp/frontend
npm install
# Set VITE_API_URL in .env
npm run dev       # development
npm run build     # production build
```

### Running the RL Training
```bash
cd RL_Agent
pip install -r requirements.txt
python scripts/train.py --config configs/new.yaml
# Generate training charts:
python scripts/plot_training.py --run-dir runs/local_5600g --out runs/local_5600g/charts
```

### Deploying AI Weights to Webapp
Copy `RL_Agent/runs/local_5600g/baseline_evals/eval_ep_<latest>/policy_snapshot.pt`
to `webapp/backend/rl_model/weights.pt`

---

## APPENDIX B — KEY DIAGRAMS (AI-generatable)

### B1 — Complete File Structure

[DIAGRAM: Draw a file tree diagram:
WEBAPP/
├── webapp/                          (renamed from 'last')
│   ├── backend/
│   │   ├── app/
│   │   │   ├── main.py              FastAPI app, CORS, lifespan
│   │   │   ├── api/
│   │   │   │   ├── routes.py        REST endpoints
│   │   │   │   └── auth.py          Supabase auth routes
│   │   │   ├── ws/
│   │   │   │   ├── sockets.py       WebSocket endpoint
│   │   │   │   └── connection.py    Connection manager
│   │   │   ├── game/
│   │   │   │   └── room_manager.py  Room state, game logic, bot turns
│   │   │   ├── ai/
│   │   │   │   └── bot_manager.py   OmiAgent async wrapper
│   │   │   ├── core/
│   │   │   │   └── security.py      JWT + Supabase verification
│   │   │   ├── db/
│   │   │   │   ├── database.py      SQLAlchemy engine/session
│   │   │   │   └── models.py        GameHistory table
│   │   │   └── models/
│   │   │       └── schemas.py       Pydantic models
│   │   └── rl_model/
│   │       ├── omi_agent.py         PolicyNet loader + inference
│   │       └── weights.pt           Trained model weights
│   └── frontend/
│       └── src/
│           ├── pages/               React page components
│           ├── components/          Shared UI components
│           └── types/game.ts        TypeScript type definitions
│
└── RL_Agent/                        (renamed from 'finalwm')
    ├── omi_env/
    │   ├── env.py                   PettingZoo AEC environment
    │   ├── rules.py                 Omi rules engine
    │   └── encoding.py              Observation + history encoding
    ├── models/
    │   ├── policy.py                PolicyNet (feed-forward)
    │   └── critic.py                CentralCritic (attention)
    ├── marl/
    │   ├── r_mappo.py               MAPPO trainer
    │   └── vector_env.py            Parallel env wrapper
    ├── baselines/
    │   ├── rule_based_agent.py      Heuristic rule agent
    │   └── random_agent.py          Random legal agent
    ├── configs/
    │   └── new.yaml                 Training hyperparameters
    ├── scripts/
    │   ├── train.py                 Training entrypoint
    │   ├── eval.py                  Standalone evaluation
    │   └── plot_training.py         Chart generation
    └── runs/
        └── local_5600g/             Training run outputs
            ├── training_summary.csv
            └── baseline_evals/      175 checkpoint folders
]

### B2 — MAPPO Data Flow

[DIAGRAM: Draw a data flow diagram showing MAPPO training:
  
  CloudVectorEnv (10 parallel OmiEnv instances)
    ↓ observations (batch of 40: 10 envs × 4 agents)
  PolicyNet (shared weights) → action probabilities → sample actions
    ↓ actions
  CloudVectorEnv → step all envs → rewards + next observations
    ↓ (obs, action, reward, done, log_prob, value)
  AgentBuffer (accumulates transitions)
    ↓ [when buffer ≥ 2048 transitions]
  Compute GAE advantages (using CentralCritic values)
    ↓
  PPO Update Loop (3 epochs):
    Shuffle batch → mini-batches
    PolicyNet forward → new log_probs + entropy
    CentralCritic forward → new values
    Compute L_π + L_V + entropy bonus → backprop
    Adam optimiser step (policy and critic separately)
    ↓
  Updated policy weights → CloudVectorEnv continues collecting
]

### B3 — Observation Encoding Detail

[DIAGRAM: Draw a visual breakdown of the 195-dimensional observation vector as a coloured bar:
  Segment 1 (dims 0-31, 32 wide):     Hand (card one-hot)
  Segment 2 (dims 32-35, 4 wide):     Trump suit
  Segment 3 (dims 36-39, 4 wide):     Lead suit
  Segment 4 (dims 40-167, 128 wide):  Current trick (4 × 32)
  Segment 5 (dims 168-169, 2 wide):   Score (team 0, team 1)
  Segment 6 (dims 170-173, 4 wide):   Player ID
  Segment 7 (dims 174-177, 4 wide):   Suit counts (hand distribution)
  Segment 8 (dims 178-193, 16 wide):  Void matrix (4 players × 4 suits)
  Segment 9 (dim 194, 1 wide):        Hand strength scalar
  
  Plus separate history tensor: 32 rows × 44 cols (not part of flat observation)
]

---

## TECHNICAL STACK SUMMARY (for quick reference)

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| Backend framework | FastAPI | 0.110+ | REST API + WebSocket server |
| ASGI server | Uvicorn | 0.29+ | Async Python web server |
| ORM | SQLAlchemy | 2.0+ | DB access layer |
| Database | SQLite | — | Game history persistence |
| Auth service | Supabase | — | User auth (email + OAuth) |
| JWT | PyJWT | 2.x | Room token signing |
| HTTP client | httpx | 0.27+ | Supabase token verification |
| Frontend framework | React | 18 | SPA component model |
| Build tool | Vite | 5.x | Frontend bundler/dev server |
| Language | TypeScript | 5.x | Type-safe frontend |
| CSS | Tailwind CSS | 3.x | Utility-first styling |
| ML framework | PyTorch | 2.x | Neural network training/inference |
| RL environment | PettingZoo | 1.24+ | Multi-agent env API |
| Scientific computing | NumPy | 1.26+ | Observation encoding |
| Training hardware | AMD 5600G CPU | — | 6-core, no GPU |

---

## TRAINING RUN STATISTICS

| Metric | Value |
|--------|-------|
| Total training episodes | 1,750,000 |
| Parallel environments | 10 (multiprocessing) |
| Approximate wall-clock time | ~72 hours (CPU) |
| Hardware | AMD Ryzen 5 5600G, 16GB RAM |
| Checkpoints saved | 175 (every 10K episodes) |
| Evaluation games per checkpoint | 1,000 (vs rule-based, deterministic) |
| Final decisive win rate | 72.1% |
| Final raw win rate | 51.3% |
| Final draw rate | 22.1% |
| Final entropy | ~0.35 nats |
| Final value loss | ~0.10 (still declining) |
| Policy parameters | ~620K |
| Critic parameters | ~280K |
