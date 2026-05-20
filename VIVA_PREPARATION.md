# Omi Card Game Web Application — Viva Preparation Guide

---

## 1. PROJECT OVERVIEW

**What is this project?**
A full-stack multiplayer web application for playing Omi, a traditional Sri Lankan trick-taking card game. The system supports human vs human, human vs AI, and mixed games in real time. It integrates a trained Reinforcement Learning agent that plays as the AI opponent.

**What problem does it solve?**
Omi is traditionally played in person with a physical deck. This application brings the game online, allowing players to play remotely in real time, and introduces an AI opponent trained via self-play so solo players always have someone to play against.

**What are the key modules?**
1. Backend API & Game Engine (FastAPI/Python)
2. Real-time communication layer (WebSocket)
3. Reinforcement Learning AI agent (PyTorch / MAPPO)
4. Frontend single-page application (React/TypeScript)
5. Authentication (Supabase)
6. Database (SQLite via SQLAlchemy)
7. RL Training Pipeline (PettingZoo / MAPPO — separate from the webapp)

---

## 2. TECHNOLOGY STACK — CHOICES AND REASONS

### Backend: FastAPI (Python)
- **Why FastAPI?** Async-first framework; native support for WebSockets which are essential for real-time game state broadcast. Automatic OpenAPI docs. Pydantic for data validation. Much faster than Django for I/O-bound tasks.
- **Why Python?** The AI model (PyTorch) and the RL training environment (PettingZoo) are Python-native. Using Python for the backend avoids a cross-language bridge.
- **Why not Django/Flask?** Django is synchronous by default and heavier. Flask lacks built-in WebSocket support and async. FastAPI is the modern standard for async Python APIs.

### Frontend: React 18 + TypeScript + Vite
- **Why React?** Component-based architecture suits a game UI where state changes frequently (card hands, trick display, scores). Virtual DOM efficiently updates only changed parts.
- **Why TypeScript?** Static typing catches bugs at compile time. Game state has complex nested structures; types act as documentation and prevent runtime errors.
- **Why Vite?** Fast HMR (Hot Module Replacement) for development. Much faster cold start than webpack/CRA.
- **UI libraries used:** Tailwind CSS (utility classes), Framer Motion (animations), Lucide React (icons).

### Authentication: Supabase
- **Why Supabase?** Managed Backend-as-a-Service providing auth out of the box: email/password, Google OAuth, JWT generation. Eliminates need to build auth from scratch (hashing, session management, token rotation).
- **Why not JWT with custom backend?** Supabase handles token refresh, session expiry, OAuth flows. Building this securely from scratch is non-trivial.
- **What does Supabase provide here specifically?** User accounts, JWT access tokens, user metadata storage (display name, avatar ID), Admin API for creating pre-confirmed users.
- **Service Role Key:** Used on the backend to call Supabase Admin API (e.g., creating a user without email confirmation). Never exposed to the frontend.

### Database: SQLite via SQLAlchemy
- **Why SQLite?** Single-file database; zero configuration; sufficient for a demonstration/academic project with low concurrent write load. Easy to inspect and back up.
- **Why SQLAlchemy?** ORM abstracts raw SQL; easy to swap SQLite for PostgreSQL in production (just change DATABASE_URL). Migrations handled by inspecting schema at startup.
- **Why not PostgreSQL directly?** PostgreSQL would be the production choice, but for this prototype SQLite reduces infrastructure complexity.

### Real-time: WebSockets (native FastAPI)
- **Why WebSockets and not polling?** Polling wastes bandwidth and introduces latency. WebSockets keep a persistent bidirectional connection; the server pushes state the moment it changes (card played, trick resolved, score updated).
- **Why not Socket.IO?** Socket.IO adds overhead and a separate library. FastAPI's native WebSocket support is sufficient.

### AI/RL: PyTorch + PettingZoo + MAPPO
- **Why PyTorch?** Industry-standard deep learning framework. Supports CUDA GPU inference. Large community.
- **Why PettingZoo?** Standard library for multi-agent RL environments; provides AEC (Agent Environment Cycle) which maps perfectly to turn-based card games. Standardises observation/action space APIs.
- **Why MAPPO (Multi-Agent PPO)?** PPO (Proximal Policy Optimisation) is stable and widely proven. MAPPO extends PPO to cooperative multi-agent settings with a centralised critic — appropriate here because Omi is a 2v2 team game where teammates share information.
- **Why self-play?** No existing dataset of Omi games exists. Self-play generates training data by having the agent play against copies of itself, improving iteratively from scratch.

---

## 3. SYSTEM ARCHITECTURE

```
Browser (React SPA)
    │
    ├── HTTP REST  ──►  FastAPI Backend  ──►  Supabase Auth API (token verify)
    │                        │
    └── WebSocket  ──►  ConnectionManager  ──►  RoomState (game engine)
                                                     │
                                          OmiEnv (PettingZoo AEC)
                                                     │
                                          BotManager → OmiAgent (PyTorch)
                                                     │
                                          SQLAlchemy → SQLite (game_history)
```

**Request lifecycle for a card play:**
1. Player clicks a card in the browser.
2. Frontend sends `{type: "action", action: 17}` over WebSocket.
3. `sockets.py` receives the message, calls `room.process_action(token, action)`.
4. `OmiEnv.step(action)` validates and applies the move; resolves trick if complete.
5. `connection_manager.broadcast_state(room_id)` serialises state for every connected client (each gets only their own hand).
6. Each client receives `{type: "snapshot", payload: {...}}` and React re-renders.

---

## 4. GAME RULES (Omi)

**Deck:** 32 cards — ranks 7, 8, 9, 10, J, Q, K, A across 4 suits (Clubs, Diamonds, Hearts, Spades).

**Players:** 4 players in 2 fixed teams. Seats 0 & 2 = Team A; Seats 1 & 3 = Team B.

**Dealing:**
- Phase 1: 4 cards dealt to each player → trump declaration.
- Phase 2: Remaining 4 cards dealt to each player → trick play begins.

**Trump declaration:** The designated declarer (rotates each hand) looks at their first 4 cards and chooses a trump suit. This is the first action in the AEC environment (actions 32–35 map to C/D/H/S).

**Trick-taking:** Must follow suit if possible (enforced by action mask). Highest trump wins if trumps played, otherwise highest card of lead suit. Winner leads next trick.

**Scoring per hand:**
- Team with more tricks scores 1 point (or 2 if they also won the previous tied hand's bonus).
- If tied tricks: no point scored; a "pending tie bonus" transfers to the next hand's winner.

**Match:** First team to reach 10 points wins.

**Early termination:** Hand ends if any team wins 5 or more tricks before all 8 tricks are played (`is_terminal = max(tricks_won) >= 5 or cards_remaining == 0`). This reflects real Omi practice and shortens training episodes.

---

## 5. REINFORCEMENT LEARNING — DETAILED

### Environment (PettingZoo AEC)
- **AEC (Agent Environment Cycle):** One agent acts at a time, matching Omi's turn-based structure perfectly. Each `step()` advances the game by exactly one action.
- **Action space:** Discrete(36) — 32 card actions + 4 trump declaration actions.
- **Action masking:** Illegal actions (wrong suit when must follow, trump action outside trump phase) are masked to 0. The policy only sees a legal subset. This prevents invalid moves without needing to penalise them.

### Observation Space (195-dimensional flat vector)
| Component | Dims | Description |
|-----------|------|-------------|
| hand_vec | 32 | One-hot: cards in current agent's hand |
| trump_vec | 4 | One-hot: trump suit (zeros if not declared) |
| lead_vec | 4 | One-hot: lead suit of current trick |
| trick_flat | 128 | 4 × 32 one-hot: cards played in current trick (padded) |
| score_vec | 2 | Normalised team trick counts (÷ 8) |
| player_vec | 4 | One-hot: agent's own seat (0–3) |
| suit_counts | 4 | Fraction of hand in each suit (helps trump declaration) |
| void_flat | 16 | 4×4 void matrix: which players are known void in which suits |
| hand_strength | 1 | Normalised average card value (helps trump declaration) |
| **Total** | **195** | |

### History Tensor (32 × 44)
- Records every card played in the hand in chronological order.
- Each row: 32 (card one-hot) + 4 (player one-hot) + 4 (lead suit) + 4 (trump suit) = 44 features.
- Gives the policy a memory of what was played and by whom.

### Policy Network (PolicyNet — ~620K parameters)
```
obs_encoder:   Linear(195 → 128)
hist_encoder:  Linear(1408 → 256) → LayerNorm → ReLU → Linear(256 → 128) → LayerNorm
core:          Linear(256 → 128) → LayerNorm → Tanh → Linear(128 → 128) → LayerNorm → Tanh
actor:         Linear(128 → 36)   [outputs logits over action space]
```
- Observation and history embeddings are concatenated (128+128=256) before the core.
- Output logits are masked (illegal actions set to −1e9) and argmax is taken at inference.

### Training Algorithm: MAPPO (Multi-Agent PPO)
- **PPO (Proximal Policy Optimisation):** Policy gradient algorithm that clips the update ratio to prevent destructive large updates. More stable than vanilla policy gradient.
- **MAPPO:** Adds a **centralised critic** that sees the joint global state (all 4 players' observations). This is the CTDE paradigm — Centralised Training, Decentralised Execution. During training the critic has global info; at test time each agent acts on its own observation only.
- **Centralised Critic (~280K parameters):** Receives concatenated observations from all 4 agents to estimate a better value function.
- **Self-play:** All 4 agents share one policy network and are trained against themselves. This generates endless high-quality training data without needing human opponents.
- **Reward shaping:** +1 for winning a hand, −1 for losing, +0.1 per trick won, −0.1 per trick lost, +2 for winning the match. Shaped rewards guide learning before the agent learns long-term strategy.

### BotManager (Inference in Production)
- `BotManager` loads the trained `weights.pt` checkpoint at server startup.
- Bot actions run via `asyncio.to_thread()` to keep the async event loop unblocked during PyTorch inference.
- Fallback to random legal action if weights are missing or inference fails.

---

## 5b. READING THE TRAINING CHARTS

The training ran for **1.6 million episodes** of self-play using MAPPO.
Each "episode" = one complete hand (trump declaration + up to 8 tricks).

---

### Chart 1 — Win Rate over Training (top-left)

```
Team A (blue): ~40%   Team B (red): ~40%   Dashed line: 50%
```

**What it shows:** Both teams hover around 40%, not 50%.

**Why below 50%?** Omi allows tied hands (exactly 4 tricks each = no winner). Approximately **20% of hands end in a tie**, so:
- Team A wins ≈ 40%
- Team B wins ≈ 40%
- Tie ≈ 20%
- Total: 100% ✓

**Why are both teams equal?** In self-play, the same policy controls all 4 seats. Both teams are always playing against an identical opponent, so win rates are guaranteed to be symmetric. This is the expected Nash equilibrium outcome.

**Why doesn't win rate increase over time?** Because as Team A's policy improves, Team B's policy improves at exactly the same rate (they share weights). The win rate stays flat — this is correct. What improves is the *quality* of play, not the relative advantage.

---

### Chart 2 — Training Losses (top-right)

```
Policy loss (blue): converges to ~0 quickly
Value loss (orange): starts ~0.10, decreases to ~0.03 over 1.6M episodes
```

**Policy loss ≈ 0:** The PPO surrogate objective is near zero, meaning policy updates are small and stable. The clipping mechanism is working — no destructive large updates.

**Value loss still above 0:** The centralised critic (value function) is harder to train than the policy. It's estimating expected returns from a complex 4-player game state. A value loss of ~0.03 after 1.6M episodes is reasonable — it's converging, not stuck.

**Why value loss > policy loss?** Policy learning in PPO is constrained by clipping (small steps). Value learning uses MSE regression which can have larger residuals. This is normal.

---

### Chart 3 — Policy Entropy (middle-left)

```
Starts ~0.47 nats → rises to peak ~0.55 at ~500K episodes → drops to ~0.35 by 1.6M
```

**What entropy means:** Entropy measures how random/uniform the policy's action distribution is. High entropy = exploratory (tries many cards). Low entropy = deterministic (confident in one card).

**The rise then fall pattern:**
1. **0–500K:** Agent initially explores more (entropy rises) as it discovers the game structure — it's learning which states warrant varied strategies.
2. **500K–1.6M:** Agent gradually commits to better strategies (entropy falls). By 1.6M episodes, entropy is ~0.35 — the agent has a confident, near-deterministic policy.

**Why this is healthy:** A policy that starts deterministic would get stuck in local optima. The exploration hump allows the agent to discover diverse strategies before exploiting the best ones.

---

### Chart 4 — Illegal Actions per Episode (middle-right)

```
Stays at exactly 0 throughout all 1.6M episodes
```

**What it proves:** Action masking eliminates illegal moves completely from the very first episode. The agent never attempts to play a card it can't hold, play the wrong suit, or declare trump outside the trump phase.

**Why this matters for training:** No episodes are wasted learning that illegal moves are bad. Every step contributes useful gradient signal. This is why action masking is used instead of penalty-based approaches.

---

### Chart 5 — Reward-Shaping Events per Episode (bottom)

Tracks how often specific strategic events happen each episode, showing the agent developing real Omi strategy.

| Event | Trend | Interpretation |
|-------|-------|----------------|
| **Late tricks** (red) | 3.0 → 2.2 (↓ decreasing) | Fewer tricks played in the late game — the agent increasingly wins/loses hands in fewer than 8 tricks (5-trick early termination triggers more often as the agent plays more decisively) |
| **Trump cuts** (orange) | 1.6 → 2.2 (↑ increasing) | Agent uses trump more strategically over time — cutting (playing trump when void in lead suit) increases as it learns trump's value |
| **Partner saves** (blue) | ~0.5–0.6 (stable) | Teammate coordination events remain steady — consistent cooperative play |
| **Wasted trump** (green dashed) | Slight decrease | Agent learns to use trump more efficiently — fewer trumps thrown on unwinnable tricks |
| **Declarer team wins/losses** (purple/dark) | Near 0, stable | Consistent scoring by the trump-declaring team |

**Key insight from this chart:** The rising Trump cuts + falling Late tricks together mean the agent learned to **end games quickly by using trump aggressively early**, which reflects real expert Omi strategy.

---

### Likely Questions About the Training Charts

**Q: Why is win rate 40% and not improving toward 100%?**
Because it is self-play — both teams share the same policy. Any improvement one team makes is immediately mirrored by the other. 40% wins + 40% losses + 20% ties = 100%. The flat curve is the *correct* result.

**Q: What does decreasing entropy tell you?**
The agent is becoming more confident and deterministic — it has learned which card to play in most situations rather than exploring random alternatives. This is a sign of convergence, not overfitting.

**Q: The value loss hasn't reached zero — is training incomplete?**
Not necessarily. Value function estimation in multi-agent games is inherently noisy because the target (expected return) depends on other agents' evolving policies. A value loss of ~0.03 at 1.6M episodes shows convergence to a stable, non-zero floor — this is normal for MARL.

**Q: What does "Trump cuts increasing" tell you about what the agent learned?**
The agent discovered that using trump when void in the lead suit (cutting) is a powerful offensive move. Increasing trump cuts over training means the agent progressively learned to exploit this — a genuine strategic insight emerging from self-play.

**Q: Why did you use 1.6 million episodes specifically?**
Training was run until the key metrics (entropy, value loss, reward-shaping events) showed stable convergence. The entropy plateau around 0.35 and the stable reward-shaping trends indicate the policy had converged and further training would yield diminishing returns.

---

## 6. REAL-TIME COMMUNICATION (WebSocket Protocol)

**Connection flow:**
1. Client connects to `ws://server/ws/{room_id}`.
2. Client immediately sends `{type: "auth", token: "<room_token>"}` (5-second timeout).
3. Server validates token → registers connection.
4. Server sends initial `{type: "snapshot", payload: <RoomStateSnapshot>}`.
5. Both sides exchange messages until `WebSocketDisconnect`.

**Client → Server messages:**
- `{type: "action", action: <int>}` — play a card or declare trump
- `{type: "audio_status", muted: bool, deafened: bool}` — voice chat state (WebRTC signalling)
- `{type: "webrtc_offer/answer/ice_candidate", target_peer_id: "..."}` — WebRTC signalling

**Server → Client messages:**
- `{type: "snapshot", payload: {...}}` — full state broadcast (on every change)
- `{type: "error", message: "..."}` — invalid action, etc.

**State isolation:** Each client receives a personalised snapshot — only they see their own hand cards. Other players' hands are hidden (sent as empty arrays).

**Disconnect handling:**
- Lobby phase: if last human disconnects → room deleted immediately.
- Playing phase: seat marked `is_disconnected=True`. After 10 seconds a bot takes over. If player reconnects within 10 seconds: bot takeover cancelled, human restored.

---

## 7. AUTHENTICATION FLOW

**Sign Up (custom, no email required):**
1. Frontend POSTs `{email, password}` to `/api/auth/register`.
2. Backend calls Supabase Admin API (`POST /auth/v1/admin/users` with `email_confirm: true`) using the service role key.
3. User is created and immediately confirmed — no email sent.
4. Frontend then calls `supabase.auth.signInWithPassword()` to get a session.
5. User is redirected to home.

**Sign In:**
- `supabase.auth.signInWithPassword()` → Supabase returns a JWT access token.
- Token stored in browser's local storage by the Supabase JS client.

**Google OAuth:**
- `supabase.auth.signInWithOAuth({provider: 'google'})` → redirects to Google.
- Google redirects back to `/auth/callback` → `AuthCallback.tsx` exchanges the code for a session.

**Token usage in game:**
- When creating/joining a room, the frontend gets the Supabase JWT from `supabase.auth.getUser()` (always fetches from server, never stale cache).
- Backend calls `verify_supabase_token(jwt)` which hits `GET /auth/v1/user` on Supabase to get the user UUID. This UUID links game history to the user.
- The room token (different from the Supabase JWT) is a custom UUID generated per seat. Stored in `localStorage` as `token_<room_id>`. Used for WebSocket auth and all room API calls.

**Two separate tokens:**
- **Supabase JWT** — proves who the user is (authentication). Used for history API.
- **Room token** — proves seat ownership in a room (authorisation). Generated by the game server.

**Password reset:** Uses Supabase's built-in `resetPasswordForEmail()` which sends a reset link via email.

---

## 8. ROOM LIFECYCLE

```
create-room → [LOBBY] → start → [PLAYING] → hand ends → ... → score=10 → [FINISHED]
                  │                                                            │
                  └── last human leaves → room deleted                        └── save to DB
```

**Room ID:** Random 8-character uppercase hex (e.g., `20970000`). Generated via `uuid4()[:8].upper()`.

**Room token:** Full UUID, unique per seat. Created on `create_room` (host) or `join_room` (joiner).

**Room TTL:** 5 minutes of inactivity. A background task runs every 60 seconds and purges expired rooms.

**Host privileges:** Only the player with the `host_token` can configure seats, swap seats, and start the game.

**Seat types:** `"open"` (nobody), `"human"` (player connected), `"bot"` (AI). On game start, all remaining `open` seats become bots.

---

## 9. DATABASE SCHEMA

**Table: `game_history`**
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| user_id | VARCHAR | Supabase user UUID (nullable for guests) |
| room_id | VARCHAR | Room ID (added via ALTER TABLE migration at startup) |
| date | DATETIME | Auto timestamp of last update |
| score_us | INTEGER | Team score for this player's team |
| score_them | INTEGER | Opposing team score |
| status | VARCHAR | `in_progress`, `win`, `loss`, `tie` |
| game_log | TEXT | JSON blob with full game state |

**game_log JSON structure:**
```json
{
  "room_id": "...",
  "status": "finished",
  "players": [
    {"seat_id": 0, "display_name": "Wathsara", "type": "human", "team": 0},
    ...
  ],
  "hands": [...],
  "match_scores": [7, 10],
  "phase": "finished",
  "hand_number": 5
}
```

**One row per human player per game:** If 2 humans play, 2 rows are inserted (one per user_id), each showing results from their perspective (score_us/score_them are flipped accordingly).

**Schema migration:** `_ensure_schema_columns()` in `main.py` checks if `room_id` column exists and adds it if not. This handles database upgrades without dropping data.

---

## 10. FRONTEND PAGES AND ROUTING

| Route | Component | Purpose |
|-------|-----------|---------|
| `/` | Home | Landing page, Continue Game button, Play/Rules/History nav |
| `/login` | Auth (mode=login) | Email+password or Google login |
| `/signup` | Auth (mode=signup) | Registration |
| `/auth/callback` | AuthCallback | Handles OAuth redirect from Supabase/Google |
| `/profile` | Profile | Change display name and avatar |
| `/play` | Lobby | Create or join a room |
| `/room/:id` | Room | Pre-game lobby: configure seats, start game |
| `/game/:id` | Game | Live gameplay, card play, scoring |
| `/history` | History | Match history with team breakdown |
| `/how-to-play` | Rules | Static game rules page |

**State management:** Local React `useState`/`useEffect` — no Redux or Zustand needed. Global state (user session) comes from Supabase's client library.

**WebSocket in Game.tsx:** `useRef` for the WebSocket object (doesn't trigger re-renders). Incoming snapshots are stored in `useState(state)` which re-renders the game UI.

**Continue Game button logic:**
- Created: `localStorage.setItem('token_<room_id>', token)` and `localStorage.setItem('last_room_id', room_id)`.
- On Home mount: reads `last_room_id`, calls `getRoom()` API to verify the room still exists.
- If 404: clears localStorage, button not shown.
- Cleared when: game finishes, room expires (404 on check), user leaves deliberately.

---

## 11. AVATAR SYSTEM

- 12 predefined avatars, each with an emoji and color (defined in `src/lib/avatars.ts`).
- Avatar selected on the Profile page and saved to Supabase user metadata via `updateUser({ data: { avatar_id: 'frog' } })`.
- `getUser()` (not `getSession()`) is used when the display name and avatar are needed — `getUser()` always fetches fresh data from Supabase's server, avoiding stale cache.
- When creating/joining a room, `avatar_id` is sent to the backend and stored on the seat.
- `get_public_state()` includes `avatar_id` in each `SeatModel` in the WebSocket snapshot.
- The Game page reads `seat.avatar_id` from the snapshot to display the avatar.

---

## 12. KEY DESIGN DECISIONS AND TRADE-OFFS

**Why in-memory room state (not in the database)?**
Room state changes with every card play — writing to SQLite on every step would be a bottleneck. Keeping state in memory (Python dict) gives microsecond access. The trade-off is that a server restart loses all active rooms. For a production system you'd use Redis.

**Why not use a message broker (Redis Pub/Sub) for WebSockets?**
For a single-server deployment, direct broadcast is simpler. Redis would be needed for horizontal scaling (multiple server instances). This is a known limitation.

**Why custom room tokens instead of using the Supabase JWT for everything?**
The Supabase JWT expires and is tied to user identity. Room tokens are permanent for the room's lifetime, unique per seat, and can be held by anonymous players (guests without an account). This separation of concerns is cleaner.

**Why MAPPO and not DQN or AlphaZero?**
- DQN is for single-agent settings. Multi-agent DQN is unstable.
- AlphaZero needs MCTS which is expensive for a 4-player game.
- MAPPO handles cooperative multi-agent settings natively and is computationally tractable.

**Why action masking instead of penalty for illegal moves?**
Penalty-based approaches slow training (the agent wastes episodes exploring illegal moves). Masking guarantees legal play from step 1, making training more sample-efficient.

**Why PettingZoo AEC and not Gym?**
Standard Gym is for single-agent environments. PettingZoo provides the multi-agent API. AEC (sequential turns) is the natural representation for card games where one player acts at a time.

---

## 13. SECURITY CONSIDERATIONS

- **CORS:** Backend restricts allowed origins to the frontend URLs listed in `.env`. No wildcard `*`.
- **JWT verification:** Every history API call verifies the Supabase JWT by calling Supabase's `/auth/v1/user` endpoint (not just decoding locally). This ensures revoked tokens are rejected.
- **Room token authorisation:** All room actions (`start`, `configure`, `swap`) require the `X-Room-Token` header to match the stored token. Host-only actions additionally check `token == host_token`.
- **WebSocket auth:** The first message must be the auth handshake within 5 seconds, or the connection is closed.
- **Service role key:** Never sent to the browser. Used only on the backend to call the Supabase Admin API.
- **SQL injection:** SQLAlchemy ORM uses parameterised queries by default.

---

## 14. LIKELY VIVA QUESTIONS AND ANSWERS

**Q: Why did you choose FastAPI over Flask?**
FastAPI is async-native, supports WebSockets out of the box, and includes automatic validation via Pydantic. Flask is synchronous and would require extensions for both async and WebSocket support.

**Q: Explain how the WebSocket state broadcast works.**
Every time the game state changes (a card is played, a trick is resolved, a player connects), `connection_manager.broadcast_state(room_id)` is called. It iterates over all WebSocket connections in that room, calls `room.get_public_state(viewer_token)` for each one to get a personalised snapshot (hiding other players' hands), and sends it as a JSON message.

**Q: How does the AI play a move?**
`BotManager.get_action(obs_dict, difficulty)` is called. If a trained `weights.pt` is present, it calls `OmiAgent.get_action()` which passes the observation and history tensors through the PolicyNet, masks illegal actions, and returns the argmax. This runs in a thread pool (`asyncio.to_thread`) to avoid blocking the event loop. If no weights are present, it picks a random legal action.

**Q: What is MAPPO and why is it suitable for Omi?**
MAPPO is Multi-Agent PPO. It trains agents with a centralised critic that sees the full joint state during training, while agents execute using only their own observations. This suits Omi because teammates need to coordinate (2v2 team game) but each player can only see their own hand. The centralised critic helps value estimation during training without violating the rule that agents can't see each other's cards during play.

**Q: What is the observation vector dimension and what does each part represent?**
195 dimensions. The main components: 32-dim hand (which cards you hold), 128-dim current trick (4 cards × 32 one-hot), 4-dim trump suit, 4-dim lead suit, 16-dim void matrix (which opponents can't follow which suits), 4-dim suit composition of hand, 1-dim hand strength, 2-dim scores, 4-dim player identity.

**Q: How do you handle a player disconnecting mid-game?**
The seat is marked `is_disconnected = True` and a 10-second timer starts. If the player reconnects within 10 seconds, the flag is cleared. If not, a bot takes over the seat (the human's saved state is stored in `_displaced_humans`). If the player later reconnects, their human seat is restored by swapping the bot back out.

**Q: What happens if the host creates a room and immediately leaves?**
The WebSocket disconnects, `on_player_disconnect` is called. Since the phase is `lobby` and no human players remain, `room_manager.rooms.pop(room_id)` deletes the room immediately. The "Continue Game" check on the Home page then gets a 404 and clears localStorage.

**Q: How is game history stored?**
One row in `game_history` per human player per game room. Each row stores the user's Supabase UUID, the room ID, the final scores from their perspective, the status (win/loss/tie/in_progress), and a JSON blob (`game_log`) containing full game metadata including all 4 players' names, types, and teams.

**Q: What is the difference between the Supabase JWT and the room token?**
The Supabase JWT authenticates the user's identity (who they are) and is issued by Supabase. The room token authorises seat ownership in a specific game room (what they're allowed to do in that room) and is generated by our FastAPI backend. They serve different purposes and have different lifetimes.

**Q: Why did you use `getUser()` instead of `getSession()` in some places?**
`getSession()` reads the session from browser localStorage, which can be stale if the user updated their profile. `getUser()` makes a live HTTP request to Supabase's server and always returns the latest user metadata. This is critical for avatar and display name to update immediately after saving the profile.

**Q: What is the action space?**
Discrete(36). Actions 0–31 represent playing one of the 32 cards (indexed by suit×8 + rank). Actions 32–35 represent declaring one of the 4 trump suits (C/D/H/S). Only one type is legal at any given time — trump actions during the trump phase, card actions during play.

**Q: How does must-follow-suit enforcement work in code?**
`rules.legal_card_mask(hand, lead_suit)` returns a binary list of length 32. If the player holds any card matching `lead_suit`, all non-matching cards are set to 0. If the player has no cards of the lead suit (void), all cards become legal. This mask is sent to the client as `action_mask` so the UI can grey out illegal cards, and is also enforced server-side in `step()`.

**Q: What database migrations strategy did you use?**
A lightweight inline migration: `_ensure_schema_columns()` in `main.py` uses SQLAlchemy's `inspect` to check if the `room_id` column exists in `game_history`. If not, it executes an `ALTER TABLE` statement to add it. This avoids using Alembic for what was a single additive migration.

**Q: How does the trump declaration rotation work?**
`start_player` increments by 1 (mod 4) after each hand's `reset()`. The AEC selector is initialised with `only_one=True` for the trump phase so only the current declarer can take an action. After trump is declared, the selector resets to all 4 players starting from the declarer.

**Q: What is early termination in the game and why was it added?**
`is_terminal = max(tricks_won) >= 5 or cards_remaining == 0`. If one team wins 5 out of 8 tricks, the other team cannot possibly win (they can win at most 3), so the hand ends immediately. This was added to: (1) match real Omi practice, (2) reduce training episode length for faster RL convergence, and (3) provide a cleaner reward signal sooner.

**Q: How does the signup work without sending an email?**
A `/api/auth/register` endpoint on the backend uses the Supabase **service role key** (admin privileges) to call Supabase's Admin API (`POST /auth/v1/admin/users`) with `email_confirm: true`. This creates the user as already confirmed. The frontend then calls `signInWithPassword()` immediately to log them in. Normal `signUp()` on the frontend would require email confirmation.

**Q: How does the scoring system work in Omi?**
After each hand, the team with more tricks scores 1 point. If there's a tie, a `pending_tie_bonus` flag is set — the next hand's winner scores 2 instead of 1. If the opposing team won the previous hand and earns points while a bonus is pending, they score 2. Match ends at 10 points.

---

## 15. PROJECT STATISTICS

| Item | Value |
|------|-------|
| Backend language | Python 3.11+ |
| Frontend language | TypeScript / React 18 |
| WebSocket protocol | FastAPI native |
| Observation vector size | 195 dimensions |
| History tensor size | 32 × 44 = 1,408 values |
| Action space | 36 (32 cards + 4 trump) |
| PolicyNet parameters | ~620,000 |
| CentralCritic parameters | ~280,000 |
| Training algorithm | MAPPO (self-play) |
| Card deck size | 32 cards |
| Players | 4 (2 teams of 2) |
| Match target score | 10 points |
| Room TTL | 5 minutes inactivity |
| DB table | 1 (game_history) |
| Frontend pages | 10 |
| Auth provider | Supabase |

---

*Prepared for PUSL3190 project viva — Omi Card Game Web Application*
