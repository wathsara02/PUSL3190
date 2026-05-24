# PUSL3190 — Omi Card Game AI with Multi-Agent Reinforcement Learning

A full-stack system for training and deploying an autonomous AI agent to play **Omi**, the traditional Sri Lankan trick-taking card game. The project combines multi-agent reinforcement learning (MARL) research with a live web application where humans can play against the trained AI.

---

## Overview

| Component | Description |
|-----------|-------------|
| `finalwm/` | MARL training environment (MAPPO/PPO) |
| `last/` | Full-stack web app (React + FastAPI) |
| `demo/` | 7 standalone viva demonstration scripts |
| `diagrams/` | Training progress charts |

**Key numbers:**
- Observation space: 195 dimensions
- Action space: 36 (32 cards + 4 trump suits)
- Model parameters: 474,020
- Training episodes: 2 million
- AI win rate: ~59% vs random baseline (31% baseline)
- Model size: 1.9 MB

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  TRAINING (finalwm/)                                        │
│  ┌─────────────┐   MAPPO    ┌──────────────┐               │
│  │ Omi Env     │◄──────────►│ PolicyNet    │               │
│  │ (Gymnasium) │  32 envs   │ (PyTorch)    │               │
│  └─────────────┘            └──────┬───────┘               │
│                                    │ weights.pt             │
└────────────────────────────────────┼────────────────────────┘
                                     │
┌────────────────────────────────────▼────────────────────────┐
│  WEB APP (last/)                                            │
│  ┌──────────────┐  WebSocket  ┌───────────────────────────┐ │
│  │ React 19 UI  │◄───────────►│ FastAPI Backend           │ │
│  │ TypeScript   │  REST API   │ + SQLAlchemy DB            │ │
│  │ TailwindCSS  │             │ + RL Inference (bot)       │ │
│  └──────────────┘             └───────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### Prerequisites

- Python 3.10+
- Node.js 18+
- Git

---

### 1. Run the Web Application

**Backend**

```bash
cd last/backend
python -m venv .venv
# Windows
.venv\Scripts\activate

pip install -r requirements.txt

# Create .env (copy from example or set manually)
# DB_URL=sqlite:///./omi_dev.db
# JWT_SECRET=your-secret-key
# CORS_ORIGINS=http://localhost:5173

uvicorn app.main:app --reload --port 8000
```

**Frontend**

```bash
cd last/frontend
npm install
npm run dev
```

The app will be available at `http://localhost:5173`.

---

### 2. Train the RL Agent

```bash
cd finalwm
pip install -r requirements.txt

# Verify setup
python scripts/check_setup.py

# Start training (5M episodes, 32 parallel envs)
python scripts/train.py --config configs/new.yaml

# Quick smoke test (20 episodes on CPU)
python scripts/train.py --config configs/small.yaml
```

Trained weights are saved to `runs/local_5600g/policy_last.pt`.

---

### 3. Evaluate the Agent

```bash
cd finalwm

# Evaluate against rule-based and random baselines
python scripts/eval.py

# Compare two trained policies
python scripts/eval_vs_policy.py

# Plot training curves
python scripts/plot_training.py
```

---

### 4. Run Viva Demo Scripts

Seven standalone scripts demonstrate all system layers (no inter-dependencies):

```bash
cd demo

# 1. Verify model loads and runs a forward pass (~3s)
python 01_weights_check.py

# 2. Full 4-AI Omi match simulation (~10s)
python 02_game_simulation.py

# 3. 200 hands: AI vs Random, win rate comparison (~30s)
python 03_ai_vs_random.py

# 4. Game rules: dealing, must-follow-suit, trick resolution (~1s)
python 04_rules_demo.py

# 5. 195D observation vector breakdown with real values (~2s)
python 05_observation_demo.py

# 6. REST + WebSocket API demo (requires backend running on :8000)
python 06_api_demo.py

# 7. 7 hand-crafted scenarios with AI logit scores (~3s)
python 07_ai_card_decision.py
```

---

## Project Structure

```
PUSL3190/
├── finalwm/                    # MARL training project
│   ├── omi_env/
│   │   ├── env.py              # Gymnasium environment + action masking
│   │   ├── rules.py            # Omi game rules engine
│   │   └── encoding.py         # 195D observation encoder
│   ├── models/
│   │   ├── policy.py           # PolicyNet (actor)
│   │   └── critic.py           # ValueNet (critic)
│   ├── marl/
│   │   ├── r_mappo.py          # MAPPO trainer
│   │   └── vector_env.py       # Vectorized environment
│   ├── scripts/
│   │   ├── train.py            # Start/resume training
│   │   ├── eval.py             # Evaluate vs baselines
│   │   ├── export.py           # Export weights for deployment
│   │   └── plot_training.py    # Generate training charts
│   ├── baselines/
│   │   └── rule_based_agent.py # Deterministic rule-based opponent
│   ├── configs/
│   │   ├── default.yaml        # Base hyperparameters
│   │   ├── new.yaml            # Full training run (5M episodes)
│   │   └── small.yaml          # Smoke test (20 episodes, CPU)
│   ├── runs/                   # Training outputs (checkpoints, CSV logs)
│   └── requirements.txt
│
├── last/                       # Full-stack web application
│   ├── backend/
│   │   ├── app/
│   │   │   ├── main.py         # FastAPI app, CORS, health check
│   │   │   ├── api/
│   │   │   │   ├── routes.py   # REST endpoints (rooms, game state)
│   │   │   │   └── auth.py     # JWT authentication
│   │   │   ├── ws/
│   │   │   │   ├── sockets.py  # WebSocket handlers
│   │   │   │   └── connection.py # Connection manager
│   │   │   ├── game/
│   │   │   │   └── room_manager.py # Game session lifecycle
│   │   │   ├── ai/
│   │   │   │   └── bot_manager.py  # Bot player management
│   │   │   └── db/
│   │   │       ├── database.py # SQLAlchemy engine/session
│   │   │       └── models.py   # DB models (rooms, game history)
│   │   ├── rl_model/
│   │   │   ├── weights.pt      # Trained policy weights (1.9 MB)
│   │   │   └── omi_agent.py    # PolicyNet inference wrapper
│   │   └── requirements.txt
│   │
│   └── frontend/
│       ├── src/
│       │   ├── components/     # Reusable React components
│       │   ├── pages/          # Page-level components (Game, Lobby)
│       │   ├── hooks/          # Custom hooks (useVoiceChat, etc.)
│       │   ├── store/          # Zustand state stores
│       │   └── types/          # TypeScript type definitions
│       ├── package.json
│       └── vite.config.ts
│
├── demo/                       # Standalone viva demo scripts
├── diagrams/                   # Training progress PNG charts
└── README.md
```

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite, TailwindCSS v4, Zustand, Framer Motion |
| Backend | FastAPI, Uvicorn, SQLAlchemy, SQLite/PostgreSQL |
| Real-time | WebSockets (asyncio) |
| ML/RL | PyTorch, PettingZoo, Gymnasium, NumPy |
| Algorithm | MAPPO (Multi-Agent PPO) with action masking |
| Auth | JWT, Passlib/bcrypt |
| Dev tools | Pytest, ESLint, TypeScript strict mode |

---

## Game Rules: Omi

Omi is a 4-player trick-taking card game using a 32-card deck (7–Ace in 4 suits). One player declares trump at the start of each hand.

**Core rules implemented:**
- Players must follow the lead suit if able (must-follow-suit)
- Trump cards beat all non-trump cards
- Highest card of the lead suit wins unless trumped
- Early termination: the hand ends once one team reaches 5 tricks
- Trump declaration phase before play begins

---

## RL Training Details

| Setting | Value |
|---------|-------|
| Algorithm | MAPPO (Multi-Agent PPO) |
| Parallel environments | 32 |
| Total training episodes | 2M (fully completed) |
| Learning rate | 3e-4 → 1e-5 (annealed) |
| Entropy coefficient | Annealed (encourages exploration early) |
| Reward shaping | Illegal action penalty, trick reward, trump bonus |
| Observation dimensions | 195 |
| Action space | 36 (32 cards + 4 trump suits) |
| Device | CUDA (configurable) |

The trained policy is exported via `scripts/export.py` and loaded by the FastAPI backend for real-time inference.

---

## Training Outputs

After training, the following files are generated under `finalwm/runs/`:

- `policy_last.pt` — Latest policy network weights
- `checkpoint_latest.pt` — Full checkpoint for resuming training
- `training_summary.csv` — Per-episode metrics (loss, entropy, win rate)

Training progress charts are pre-generated in `diagrams/`.

---

## Environment Variables

**Backend** (`last/backend/.env`):

```
DB_URL=sqlite:///./omi_dev.db
JWT_SECRET=your-secret-key-here
CORS_ORIGINS=http://localhost:5173
```

**Frontend** (`last/frontend/.env`):

```
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000
```

---

## Running Tests

```bash
# RL environment unit tests
cd finalwm
pytest tests/ -v

# Backend API tests (if present)
cd last/backend
pytest -v
```

---

## License

This project was developed as part of PUSL3190 coursework. All rights reserved.
