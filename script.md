# Omi Card Game — 15-Minute Presentation Script

> **Pace guide:** ~140 words per minute. Each minute block ≈ 140 words spoken.
> **[SHOW]** = switch screen or run a command. **[PAUSE]** = wait 2–3 seconds, let output settle before speaking.
> **[TYPE]** = exact command to run in terminal. Have a terminal open in `demo/` with the venv activated before you begin.

---

## PRE-PRESENTATION SETUP (do this before they call your name)

```bat
cd C:\Users\Administrator\Desktop\WEBAPP\last\backend
.venv\Scripts\activate

REM Terminal 1 — keep this running the whole time:
uvicorn app.main:app --reload --port 8000

REM Terminal 2 — cd here, leave it ready:
cd C:\Users\Administrator\Desktop\WEBAPP\demo
```

Have open in browser: the running app (logged in), VS Code with the project.
Have open in VS Code: `sockets.py`, `bot_manager.py`, `useVoiceChat.ts`.

---

## SECTION 1 — Opening & Problem Statement
### ⏱ 0:00 – 1:00 (1 minute)

**[SHOW: running app — Home page]**

Good morning / afternoon. My project is a full-stack multiplayer web application for Omi — a traditional Sri Lankan trick-taking card game. The problem is simple: Omi has no online version. You need four people physically present to play.

My application solves that in two ways. First, it brings the game online so players can join from different devices in real time. Second, it includes a Reinforcement Learning AI agent — trained entirely through self-play — so a solo player always has opponents.

The system has seven modules: a FastAPI backend, a game engine, real-time WebSocket communication, WebRTC voice chat, a React frontend, Supabase authentication, and a SQLite database. The RL training pipeline is a separate component. I'll take you through all of them.

---

## SECTION 2 — Stack & Architecture
### ⏱ 1:00 – 2:00 (1 minute)

**[SHOW: architecture diagram]**

```
Browser (React SPA)
    ├── HTTP REST  ──►  FastAPI Backend  ──►  Supabase Auth API
    └── WebSocket  ──►  ConnectionManager ──► RoomState (game engine)
    └── WebRTC     ◄──► Browser (peer)        └── BotManager → OmiAgent (PyTorch)
                                                   └── SQLAlchemy → SQLite
```

**FastAPI** because it is async-native with built-in WebSocket support, and because PyTorch is Python — no cross-language bridge between the game engine and the AI. **React + TypeScript** because game state has complex nested structures and changes on every card play — types prevent runtime errors and the virtual DOM updates only what changed. **Supabase** provides auth out of the box: JWT generation, OAuth, and user metadata. **SQLite** for zero-configuration storage — SQLAlchemy means swapping to PostgreSQL later is one line change.

---

## SECTION 3 — App Demo
### ⏱ 2:00 – 3:30 (1.5 minutes)

**[SHOW: browser — Home page]**

This is the application running. A returning player sees "Continue Game" — that reads localStorage, calls the server to verify the room still exists, shows the button only if it does.

**[Click Log In — log in quickly, navigate to Play]**

Authentication uses Supabase. My backend has a custom `/api/auth/register` endpoint that calls Supabase's Admin API with `email_confirm: true` — users are created as already confirmed, so signup is instant with no email step.

**[Create a room — show lobby screen]**

This is the lobby. The room ID is the join code. Each seat is configurable — Human or Bot. Only the host can configure seats and start. I'll fill the empty seats with bots.

**[Start game — game screen appears]**

**[PAUSE]**

This is the game screen. My hand is at the bottom. The first action is trump declaration — cards I cannot legally play are greyed out. That grey-out is the action mask, enforced both in the UI and server-side. I'll play a couple of cards to show the flow.

**[Play 1–2 cards, let bots respond]**

Every card click sends a WebSocket message. The server runs the game engine, resolves the trick, and pushes the new state to every client within milliseconds. Let me now prove each layer of this technically.

---

## SECTION 4 — Real-Time: WebSocket + WebRTC
### ⏱ 3:30 – 5:30 (2 minutes)

**[SHOW: Terminal 2 — switch to demo folder]**

**[TYPE:]**
```bat
python 06_api_demo.py
```

**[PAUSE — let it run, output appears]**

This script hits every REST endpoint and opens a real WebSocket connection programmatically. You can see the room being created, a bot seat configured, the game started, and then the WebSocket authenticating and immediately receiving a state snapshot. This is exactly what the React frontend does — every state change triggers a fresh snapshot pushed to every connected client.

**[SHOW: backend/app/ws/sockets.py:56 in VS Code]**

The WebSocket handler receives a JSON message, checks the `type` field — if it's `"action"` it calls `room.process_action(token, action)`, then calls `broadcast_state`. `broadcast_state` iterates every connection in the room and sends each client a *personalised* snapshot with only their own hand visible. That's the cheat prevention boundary.

**[SHOW: sockets.py:104 — WebRTC block]**

The second real-time layer is voice chat via WebRTC. I reuse the existing WebSocket as a signalling channel — no separate signalling server. Offer → relay → answer → ICE candidates, all through WebSocket messages. Once negotiated, audio flows peer-to-peer — it never touches the backend.

**[SHOW: useVoiceChat.ts:100 — RTCPeerConnection creation]**

The `useVoiceChat` hook acquires the microphone with `getUserMedia`, creates the peer connection with STUN servers for NAT traversal, and attaches the audio tracks. Mute works by toggling `track.enabled` — not stopping the stream, just silencing it. The muted/deafened state is broadcast back through the WebSocket so all players see the correct mic icons.

---

## SECTION 5 — Game Engine & Rules
### ⏱ 5:30 – 7:00 (1.5 minutes)

**[TYPE:]**
```bat
python 02_game_simulation.py
```

**[PAUSE — output scrolls, full match plays out]**

This runs a complete Omi match — four AI agents, first to 10 points. You can see every trick printed card-by-card, who wins each trick, and the running score. Notice at hand 1 it says "Team A wins 5 tricks" and the hand stops — that is the early termination rule. Once a team has 5 tricks the other team cannot possibly win, so the hand ends immediately. This reflects real Omi practice and also shortens training episodes for the RL agent.

**[SHOW: omi_env/rules.py:81 — legal_card_mask]**

The must-follow-suit rule lives here. `legal_card_mask` returns a 32-element binary list. If you hold a card matching the lead suit, only those cards get a 1. If you're void in that suit, all cards are legal. This mask is sent to the browser to grey out cards and is also enforced inside `step()` server-side — so bypassing the UI still can't let you cheat.

---

## SECTION 6 — Reinforcement Learning Agent
### ⏱ 7:00 – 12:00 (5 minutes)

**[SHOW: training charts]**

There is no existing dataset of Omi games, so I trained an AI from scratch using Reinforcement Learning — 1.6 million episodes of self-play.

The environment uses PettingZoo AEC — one agent acts at a time, which maps perfectly to a turn-based card game. The action space is 36: 32 card actions plus 4 trump declaration actions.

**[Point to Chart 4 — illegal actions = 0]**

Action masking means the agent never attempts an illegal move — zero illegal actions for all 1.6 million episodes. Every step produces useful gradient signal, with no training wasted learning what is forbidden.

The algorithm is **MAPPO** — Multi-Agent Proximal Policy Optimisation. Standard PPO is single-agent. MAPPO adds a centralised critic that during training sees the full joint state of all four players — better value estimation for a cooperative team game. At inference, each agent acts only on its own observation. This is CTDE: Centralised Training, Decentralised Execution.

**[Point to Chart 1 — win rate ~40%]**

Win rate is 40% per team, not 50%. About 20% of Omi hands tie — 4 tricks each, no winner. 40 + 40 + 20 = 100. The flat curve is correct for self-play: as one team improves, the other improves identically because they share weights. Quality of play improves; relative advantage stays flat.

**[Point to Chart 3 — entropy]**

Entropy rises to a peak at 500K episodes then falls to 0.35. The rise is exploration — the agent discovers the game structure. The fall is convergence — it commits to the best strategies. A policy that starts deterministic gets stuck in local optima; this exploration hump is what enables real learning.

**[TYPE:]**
```bat
python 03_ai_vs_random.py
```

**[PAUSE — progress bar runs ~30 seconds]**

This benchmarks the trained agent against a random legal-move picker over 200 hands. 

**[PAUSE — results print]**

The AI wins around 59% of hands versus 31% for random — nearly double. This is quantitative proof that training produced a genuinely better-than-trivial agent. The remaining ~10% are ties. A 59% win rate against random in a 4-player hidden-information game is a strong result.

**[TYPE:]**
```bat
python 07_ai_card_decision.py
```

**[PAUSE — scenarios print]**

**[PAUSE — point to the trump declaration scenario]**

This is the most transparent demo. For every scenario I can show exactly what logit score the network assigns to each possible action. Here — a hand with Ace King Queen Jack of Hearts — the network assigns logit +19.8 to Hearts and negative scores to every other suit. It confidently declares Hearts as trump.

**[Point to the endgame scenario]**

In this endgame scenario, the raw logit for ♥9 is higher — but ♥9 is illegal because the player must follow spades. The action mask sets it to negative one billion before argmax. The AI correctly plays ♠A, the only legal winning card. This shows the mask working in inference exactly as it does in training.

---

## SECTION 7 — Authentication & Security
### ⏱ 12:00 – 13:30 (1.5 minutes)

**[SHOW: backend/app/core/security.py:35]**

The authentication system uses two separate tokens for two different purposes.

The **Supabase JWT** proves identity — who the user is. Every call to the game history API verifies this token by making a live HTTP request to Supabase's server. It does not decode the JWT locally — revoked tokens are rejected immediately.

The **room token** proves seat ownership — what the user is authorised to do in a specific room. It is a UUID generated by my backend when a player creates or joins a room, stored in localStorage, and sent as the first WebSocket message. This separation means anonymous guests can play — their seat is identified by a room token, not a Supabase identity.

**[SHOW: auth.py:21]**

Custom signup bypasses email confirmation by calling Supabase's Admin API on the backend with the service role key and `email_confirm: true`. The key never reaches the browser. The frontend then calls `signInWithPassword()` to get a session immediately.

For security: CORS restricts allowed origins, all room actions require the `X-Room-Token` header, host-only actions additionally check `token == host_token`, and SQLAlchemy uses parameterised queries throughout.

---

## SECTION 8 — Closing
### ⏱ 13:30 – 15:00 (1.5 minutes)

**[SHOW: History page]**

To summarise: this project delivers a complete multiplayer card game platform with six technically distinct layers working together.

The **game engine** enforces all Omi rules from scratch — must-follow-suit, trump rotation, trick resolution, tie bonuses, early termination.

The **real-time layer** uses WebSocket for game state with personalised per-client snapshots, WebRTC for peer-to-peer voice chat, and handles disconnects with a 10-second bot takeover and restore-on-reconnect.

The **RL agent** trained via MAPPO self-play for 1.6 million episodes achieves a 59% win rate against random play — without any human game data.

**Authentication** uses two token systems: Supabase JWT for identity, room tokens for seat authorisation.

Known limitations I would address at production scale: Redis for room state persistence across server restarts, Redis Pub/Sub for multi-instance WebSocket scaling, and more training episodes for the AI. The architecture is designed for these upgrades — the room manager and connection manager are already isolated behind clean interfaces.

Thank you. I'm happy to take questions.

---

## POST-PRESENTATION: Quick Reference for Q&A

### Demo scripts — run if asked

| What they ask | Command | Time |
|---|---|---|
| "Show the model architecture" | `python 01_weights_check.py` | ~3s |
| "Show a full game" | `python 02_game_simulation.py` | ~10s |
| "Prove the AI is better than random" | `python 03_ai_vs_random.py` | ~30s |
| "Show the action masking" | `python 04_rules_demo.py` | ~1s |
| "Show the observation vector" | `python 05_observation_demo.py` | ~2s |
| "Show the API working" | `python 06_api_demo.py` | ~5s |
| "Show how the AI picks a card" | `python 07_ai_card_decision.py` | ~3s |

### Code locations — open in VS Code if asked

| Question | File:Line |
|---|---|
| WebSocket message handler | `backend/app/ws/sockets.py:56` |
| broadcast_state (per-client snapshots) | `backend/app/ws/connection.py:40` |
| WebRTC signalling relay | `backend/app/ws/sockets.py:104` |
| RTCPeerConnection creation | `frontend/src/hooks/useVoiceChat.ts:100` |
| getUserMedia (mic capture) | `frontend/src/hooks/useVoiceChat.ts:25` |
| Mute toggle (track.enabled) | `frontend/src/hooks/useVoiceChat.ts:63` |
| Audio status backend handler | `backend/app/ws/sockets.py:85` |
| JWT verification (live Supabase call) | `backend/app/core/security.py:35` |
| Custom signup (Admin API, no email) | `backend/app/api/auth.py:21` |
| Game engine step() | `backend/app/game/omi_env/env.py:127` |
| Action masking (legal_card_mask) | `backend/app/game/omi_env/rules.py:81` |
| AI inference + asyncio.to_thread | `backend/app/ai/bot_manager.py:28` |
| Disconnect / 10-second bot takeover | `backend/app/game/room_manager.py:104` |
| Room TTL cleanup (5 min) | `backend/app/game/room_manager.py:588` |
| DB schema migration | `backend/app/main.py:19` |
| Game history save | `backend/app/game/room_manager.py:352` |
| Frontend WebSocket hook | `frontend/src/hooks/useGameState.ts:19` |

### Key numbers — memorise these

| Item | Value |
|---|---|
| Observation vector | **195 dimensions** |
| History tensor | **32 × 44 = 1,408 values** |
| Action space | **36** (32 cards + 4 trump) |
| PolicyNet parameters | **474,020** |
| Training episodes | **1.6 million** |
| AI win rate vs random | **~59%** |
| Match target | **10 points** |
| Early termination | **max(tricks) ≥ 5** |
| Room TTL | **5 minutes** |
| Bot takeover delay | **10 seconds** |
| WebSocket auth timeout | **5 seconds** |
