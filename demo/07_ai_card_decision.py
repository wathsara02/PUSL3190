"""
DEMO 07 — AI Card Decision Showcase
Presents 4 hand-crafted scenarios and asks the AI what it would play.
Shows logit scores for every card so the decision is fully explainable.
Great for viva: "Given THIS exact situation, the AI picks THIS card because..."
"""

import os, sys
sys.stdout.reconfigure(encoding='utf-8')

BACKEND = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'last', 'backend'))
sys.path.insert(0, BACKEND)

import torch
import numpy as np
from app.game.omi_env import rules, encoding
from rl_model.omi_agent import OmiAgent

SEP  = "=" * 66
SEP2 = "-" * 66

SUIT_SYM  = {'C': '♣', 'D': '♦', 'H': '♥', 'S': '♠'}
SUIT_NAME = {'C': 'Clubs', 'D': 'Diamonds', 'H': 'Hearts', 'S': 'Spades'}
RANK_ORDER = {r: i for i, r in enumerate(rules.RANKS)}  # 7=0 … A=7

def ci(suit, rank):
    return rules.card_to_index(rules.Card(suit, rank))

def card_str(idx):
    c = rules.index_to_card(idx)
    return f"{SUIT_SYM[c.suit]}{c.rank}"

def display_decision(scenario_name, hand, trump_suit, lead_suit,
                     current_trick, tricks_won, history, agent_id, model):

    card_mask   = rules.legal_card_mask(hand, lead_suit)
    action_mask = card_mask + [0] * 4

    obs = encoding.encode_observation(
        agent_id, hand, trump_suit, lead_suit,
        current_trick, tricks_won, action_mask, history
    )

    obs_t  = torch.FloatTensor(obs['observation']).unsqueeze(0)
    hist_t = torch.FloatTensor(obs['history']).unsqueeze(0)
    mask_t = torch.FloatTensor(obs['action_mask'])

    with torch.no_grad():
        raw_logits    = model(obs_t, hist_t).squeeze(0)
        masked_logits = raw_logits + (mask_t - 1.0) * 1e9

    chosen = int(torch.argmax(masked_logits).item())

    # Sort cards in hand by masked logit (descending)
    scored = sorted(
        [(c, raw_logits[c].item(), masked_logits[c].item(), card_mask[c] == 1)
         for c in hand],
        key=lambda x: x[2], reverse=True
    )

    print(f"\n  {'─'*64}")
    print(f"  SCENARIO: {scenario_name}")
    print(f"  {'─'*64}")
    print(f"  Trump: {SUIT_SYM[trump_suit]} {SUIT_NAME[trump_suit]}   "
          f"Lead: {SUIT_SYM[lead_suit] if lead_suit else 'none (leading)'} {SUIT_NAME.get(lead_suit,'') if lead_suit else ''}")
    print(f"  Trick so far: "
          + ("(you lead)" if not current_trick else
             '  '.join(f"P{p}:{card_str(c)}" for p, c in current_trick)))
    print(f"  Score (tricks): Team A {tricks_won[0]}  Team B {tricks_won[1]}")
    print(f"\n  Your hand: {' '.join(card_str(c) for c in hand)}")
    print(f"\n  {'Card':<8} {'Logit':>8}  {'Legal':>6}  {'Preference'}")
    print(f"  {'-'*52}")

    for rank, (card_idx, raw, mskd, legal) in enumerate(scored, 1):
        bar_len = max(0, int((raw + 3) / 6 * 20))
        bar     = '▓' * bar_len
        legal_s = 'YES' if legal else 'NO '
        marker  = ' ◄ AI PLAYS' if card_idx == chosen else ''
        print(f"  {card_str(card_idx):<8} {raw:>8.3f}  {legal_s:>6}  {bar}{marker}")

    chosen_card = rules.index_to_card(chosen)
    print(f"\n  → AI plays: {card_str(chosen)}  "
          f"({SUIT_NAME[chosen_card.suit]}, rank={chosen_card.rank})")
    return chosen


print(SEP)
print("  DEMO 07 — AI Card Decision Showcase")
print(SEP)

print("\nLoading AI agent...")
agent = OmiAgent(use_gpu=False)
if not agent.has_weights or agent.model is None:
    print("  ✗ No trained weights found. Cannot run inference showcase.")
    print("    Place weights.pt in last/backend/rl_model/")
    sys.exit(1)
print(f"  ✓ Weights loaded successfully.\n")

model = agent.model

# ══ Scenario 1: Trump Declaration ══════════════════════════════
# Player has a hand rich in Hearts — should declare Hearts as trump
print(SEP)
print("  TRUMP DECLARATION SCENARIOS")
print(SEP)

# For trump declaration, action space is [0]*32 + [1,1,1,1]
# We bypass encode_observation slightly and set action_mask for trump
trump_hand_hearts = [ci('H','A'), ci('H','K'), ci('H','Q'), ci('H','J')]  # 4 hearts!
trump_hand_mixed  = [ci('S','A'), ci('D','K'), ci('H','7'), ci('C','9')]  # mixed

def trump_decision(scenario_name, hand4, agent_id=0, model=model):
    action_mask = [0]*32 + [1,1,1,1]   # only trump actions legal
    obs = encoding.encode_observation(
        agent_id, hand4, None, None, [], (0,0), action_mask, []
    )
    obs_t  = torch.FloatTensor(obs['observation']).unsqueeze(0)
    hist_t = torch.FloatTensor(obs['history']).unsqueeze(0)
    mask_t = torch.FloatTensor(obs['action_mask'])

    with torch.no_grad():
        raw    = model(obs_t, hist_t).squeeze(0)
        masked = raw + (mask_t - 1.0) * 1e9

    chosen = int(torch.argmax(masked).item())
    suit_chosen = rules.SUITS[chosen - rules.ACTION_TRUMP_OFFSET]

    print(f"\n  Scenario: {scenario_name}")
    print(f"  Hand (first 4): {' '.join(card_str(c) for c in hand4)}")
    print(f"  Trump logits:  C={raw[32]:.3f}  D={raw[33]:.3f}  H={raw[34]:.3f}  S={raw[35]:.3f}")
    print(f"  → Declares: {SUIT_SYM[suit_chosen]} {SUIT_NAME[suit_chosen]}  (highest logit)")

trump_decision("Strong Hearts hand (A K Q J) — expect Hearts declared",
               [ci('H','A'), ci('H','K'), ci('H','Q'), ci('H','J')])

trump_decision("Strong Spades hand (A K Q J) — expect Spades declared",
               [ci('S','A'), ci('S','K'), ci('S','Q'), ci('S','J')])

trump_decision("Mixed hand — AI picks based on card strength",
               [ci('S','A'), ci('D','K'), ci('H','7'), ci('C','9')])

# ══ Scenario 2–5: Play phase decisions ═════════════════════════
print(f"\n{SEP}")
print("  PLAY PHASE SCENARIOS")
print(SEP)

# Scenario 2: Must follow suit — only one legal card
display_decision(
    "Must-follow-suit: only ♠Q is legal (lead=♠, hand has only one spade)",
    hand          = [ci('S','Q'), ci('H','A'), ci('H','K'), ci('D','J'), ci('C','8')],
    trump_suit    = 'H',
    lead_suit     = 'S',
    current_trick = [(1, ci('S','A')), (2, ci('S','K'))],
    tricks_won    = (1, 1),
    history       = [(1,ci('C','A'),'C','H'),(2,ci('C','K'),'C','H'),
                     (3,ci('C','Q'),'C','H'),(0,ci('C','J'),'C','H')],
    agent_id      = 0,
    model         = model,
)

# Scenario 3: Leading a trick — AI holds the Ace and King of trump
display_decision(
    "Leading a trick with strong trump hand — AI leads ♥A or ♥K to draw trumps",
    hand          = [ci('H','A'), ci('H','K'), ci('S','Q'), ci('D','9'), ci('C','8')],
    trump_suit    = 'H',
    lead_suit     = None,    # we are leading
    current_trick = [],
    tricks_won    = (2, 1),
    history       = [(0,ci('S','A'),'S','H'),(1,ci('S','K'),'S','H'),
                     (2,ci('S','Q'),'S','H'),(3,ci('S','J'),'S','H'),
                     (0,ci('D','A'),'D','H'),(1,ci('D','K'),'D','H'),
                     (2,ci('D','Q'),'D','H'),(3,ci('D','J'),'D','H')],
    agent_id      = 0,
    model         = model,
)

# Scenario 4: Void in lead suit — can trump or discard
display_decision(
    "Void in lead suit (no spades) — AI chooses: trump ♥7 or discard",
    hand          = [ci('H','7'), ci('H','10'), ci('D','J'), ci('C','8')],
    trump_suit    = 'H',
    lead_suit     = 'S',   # lead is spades, player has NO spades
    current_trick = [(1, ci('S','A')), (2, ci('S','K'))],
    tricks_won    = (0, 2),
    history       = [(1,ci('S','A'),'S','H'),(2,ci('S','K'),'S','H')],
    agent_id      = 0,
    model         = model,
)

# Scenario 5: Endgame — almost all cards played, tight score
display_decision(
    "Endgame: score is 4-4 tricks, this trick is decisive",
    hand          = [ci('S','A'), ci('H','9')],
    trump_suit    = 'H',
    lead_suit     = 'S',
    current_trick = [(1, ci('S','K'))],
    tricks_won    = (4, 4),
    history       = [
        (0,ci('C','A'),'C','H'),(1,ci('C','K'),'C','H'),
        (2,ci('C','Q'),'C','H'),(3,ci('C','J'),'C','H'),
        (1,ci('D','A'),'D','H'),(2,ci('D','K'),'D','H'),
        (3,ci('D','Q'),'D','H'),(0,ci('D','J'),'D','H'),
        (0,ci('H','A'),'H','H'),(1,ci('H','K'),'H','H'),
        (2,ci('H','Q'),'H','H'),(3,ci('H','J'),'H','H'),
        (2,ci('S','Q'),'S','H'),(3,ci('S','J'),'S','H'),
        (0,ci('S','10'),'S','H'),(1,ci('S','9'),'S','H'),
    ],
    agent_id      = 0,
    model         = model,
)

print(f"\n{SEP}")
print("  DEMO 07 complete — AI decisions explained for each scenario.")
print(SEP)
