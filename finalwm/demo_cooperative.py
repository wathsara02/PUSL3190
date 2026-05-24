"""
Cooperative Behaviour Demo

Game state
  Trump suit : Hearts (H)
  Lead suit  : Clubs  (C)

  Trick so far (agent is 4th / last to play):
    player_0  (Team 0) : 7C  -- low club
    player_1  (Team 1) : KC  -- King of Clubs  *** PARTNER WINNING ***
    player_2  (Team 0) : 9C  -- mid club

  Agent (player_3, Team 1) hand:
    8C  -- low club    (legal -- cooperative discard)
    AC  -- Ace of Clubs (legal -- would OVERTAKE partner KC!)
    7H  -- low trump   (illegal -- must follow clubs)
    AH  -- top trump   (illegal -- must follow clubs)
"""

from __future__ import annotations

import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

import numpy as np
import torch
from omi_env import encoding, rules

# Load OmiAgent from the deployed backend model (last/backend/rl_model).
_BACKEND = os.path.join(os.path.dirname(__file__), "..", "last", "backend")
sys.path.insert(0, _BACKEND)


def ci(suit: str, rank: str) -> int:
    return rules.SUITS.index(suit) * len(rules.RANKS) + rules.RANKS.index(rank)


def card_name(idx: int) -> str:
    c = rules.index_to_card(idx)
    return f"{c.rank}{c.suit}"


# Scenario
AGENT_ID   = 3   # player_3 -- Team 1  (teams: 0&2 vs 1&3)
PARTNER_ID = 1   # player_1 -- Team 1

trump_suit = "H"
lead_suit  = "C"

current_trick = [
    (0, ci("C", "7")),   # player_0 -- 7C (lowest club)
    (1, ci("C", "K")),   # player_1 -- KC (partner, winning)
    (2, ci("C", "9")),   # player_2 -- 9C
]

agent_hand = [
    ci("C", "8"),   # 8C -- low club (cooperative discard)
    ci("C", "A"),   # AC -- would OVERTAKE partner KC!
    ci("H", "7"),   # 7H -- low trump (must follow suit -- illegal)
    ci("H", "A"),   # AH -- top trump (must follow suit -- illegal)
]

tricks_won = (2, 2)

history = [
    (0, ci("S", "A"), "S", trump_suit),
    (1, ci("S", "7"), "S", trump_suit),
    (2, ci("S", "8"), "S", trump_suit),
    (3, ci("S", "9"), "S", trump_suit),
    (0, ci("C", "7"), lead_suit, trump_suit),
    (1, ci("C", "K"), lead_suit, trump_suit),
    (2, ci("C", "9"), lead_suit, trump_suit),
]

# Observation
action_mask: list = rules.legal_card_mask(agent_hand, lead_suit) + [0] * 4

obs_dict = encoding.encode_observation(
    AGENT_ID,
    agent_hand,
    trump_suit,
    lead_suit,
    current_trick,
    tricks_won,
    action_mask,
    history,
)

obs_t  = torch.tensor(obs_dict["observation"]).unsqueeze(0)
hist_t = torch.tensor(obs_dict["history"]).unsqueeze(0)

# Load policy
from rl_model.omi_agent import OmiAgent

agent = OmiAgent()
assert agent.has_weights, "weights.pt failed to load"

# Inference
with torch.no_grad():
    raw_logits = agent.model(obs_t, hist_t).squeeze(0)

mask_1d = torch.tensor(obs_dict["action_mask"])
masked_logits = raw_logits + (mask_1d - 1.0) * 1e9
probs = torch.softmax(masked_logits, dim=-1).numpy()

legal_card_indices = [i for i, v in enumerate(action_mask) if v == 1 and i < rules.NUM_CARDS]
chosen_idx = int(np.argmax(probs))

# Output
SEP = "=" * 62
DIV = "-" * 62

print("  COOPERATIVE BEHAVIOUR DEMO  --  Synthetic Match")

# Trump / lead / score
print(f"\n  TRUMP : {trump_suit} (Hearts)   "
      f"LEAD : {lead_suit} (Clubs)   "
      f"Score -- Team 0: {tricks_won[0]}  Team 1: {tricks_won[1]}")

# Current trick table
current_winner = rules.resolve_trick(current_trick, lead_suit, trump_suit)
winning_card   = next(c for p, c in current_trick if p == current_winner)

print(f"  CURRENT TRICK  (lead: {lead_suit} Clubs -- trump: {trump_suit} Hearts)")
for pid, cidx in current_trick:
    team   = rules.team_for_player(pid)
    role   = "PARTNER " if pid == PARTNER_ID else "opponent"
    marker = "  <-- winning" if pid == current_winner else ""
    print(f"  player_{pid}  Team {team}  ({role})  [ {card_name(cidx):>3} ]{marker}")
print(f"  Current winner : player_{current_winner}"
      f" (Team {rules.team_for_player(current_winner)})"
      f"  with  {card_name(winning_card)}")

# Agent hand grouped by suit

print(f"  AGENT HAND  (player_{AGENT_ID} / Team 1)")
print(f"  {DIV}")
suit_meta = [
    ("C", f"Clubs  [{lead_suit}]  lead -- must follow"),
    ("D", "Diamonds"),
    ("H", f"Hearts [{trump_suit}]  TRUMP"),
    ("S", "Spades"),
]
for suit_code, label in suit_meta:
    cards_in_suit = sorted(c for c in agent_hand if rules.index_to_card(c).suit == suit_code)
    if not cards_in_suit:
        continue
    legal   = action_mask[cards_in_suit[0]] == 1
    status  = "LEGAL  " if legal else "illegal"
    cards_s = "  ".join(f"[ {card_name(c):>3} ]" for c in cards_in_suit)
    print(f"  {label:<36}  [{status}]  {cards_s}")
print(f"  {DIV}")

# Policy probabilities
print(f"  AGENT DECISION  -- policy probabilities")
print(f"  {DIV}")
for cidx in sorted(legal_card_indices, key=lambda x: -probs[x]):
    pct    = probs[cidx] * 100
    bar    = "#" * int(pct / 2.5)
    marker = "  <-- CHOSEN" if cidx == chosen_idx else ""
    print(f"  {card_name(cidx):>3}   {pct:5.1f}%  {bar:<40}{marker}")
print(f"  {DIV}")

print(f"\n  Agent chose  : {card_name(chosen_idx)}")

print(f"\n{SEP}\n")
