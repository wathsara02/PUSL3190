"""
DEMO 05 — Observation Vector Breakdown
Takes a concrete mid-game state and shows what each of the 195
input dimensions means, then runs it through the PolicyNet and
explains which card the AI chooses and why (logit scores).
"""

import os, sys
sys.stdout.reconfigure(encoding='utf-8')

BACKEND = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'last', 'backend'))
sys.path.insert(0, BACKEND)

import numpy as np
from app.game.omi_env import rules, encoding
from rl_model.omi_agent import OmiAgent

SEP  = "=" * 62
SEP2 = "-" * 62

SUIT_SYM  = {'C': '♣', 'D': '♦', 'H': '♥', 'S': '♠'}

def card_str(idx):
    c = rules.index_to_card(idx)
    return f"{SUIT_SYM[c.suit]}{c.rank}"

def ci(suit, rank):
    return rules.card_to_index(rules.Card(suit, rank))

print(SEP)
print("  DEMO 05 — Observation Vector & AI Decision Breakdown")
print(SEP)

# ── Construct a realistic mid-game state ───────────────────────
#
# Scenario: Hand is mid-way, 2 tricks already played.
# Player 0's turn.  Trump = Hearts.  Lead suit = Spades.
# Trick so far: P1 played ♠A (lead), P2 played ♠K
# Player 0 has: ♠Q ♠8 ♥J ♥8 ♦K ♦9  (has spades → MUST follow suit)

hand = [
    ci('S', 'Q'), ci('S', '8'),
    ci('H', 'J'), ci('H', '8'),
    ci('D', 'K'), ci('D', '9'),
]
trump_suit = 'H'
lead_suit  = 'S'
current_trick = [
    (1, ci('S', 'A')),   # P1 led ♠A
    (2, ci('S', 'K')),   # P2 played ♠K
]
tricks_won = (1, 1)  # 1 trick each so far
agent_id   = 0

# Past plays history (2 tricks, 4 plays + partial current trick)
history = [
    (0, ci('C', 'A'), 'C', trump_suit),
    (1, ci('C', 'K'), 'C', trump_suit),
    (2, ci('C', 'Q'), 'C', trump_suit),
    (3, ci('C', '9'), 'C', trump_suit),
    (1, ci('H', '7'), 'H', trump_suit),
    (2, ci('D', 'J'), 'H', trump_suit),
    (3, ci('H', '9'), 'H', trump_suit),
    (0, ci('H', 'A'), 'H', trump_suit),
]

# Compute action mask
card_mask = rules.legal_card_mask(hand, lead_suit)
action_mask = card_mask + [0] * 4  # no trump declaration during play

# Encode observation
obs = encoding.encode_observation(
    agent_id, hand, trump_suit, lead_suit,
    current_trick, tricks_won, action_mask, history
)

obs_vec  = obs['observation']   # shape (195,)
hist_mat = obs['history']       # shape (32, 44)
mask_arr = obs['action_mask']   # shape (36,)

# ── Print the scenario ─────────────────────────────────────────
print("\n  SCENARIO:")
print(f"  Player 0's hand : {' '.join(card_str(i) for i in hand)}")
print(f"  Trump suit      : {SUIT_SYM[trump_suit]} Hearts")
print(f"  Lead suit       : {SUIT_SYM[lead_suit]} Spades")
print(f"  Trick so far    : P1:{card_str(ci('S','A'))}  P2:{card_str(ci('S','K'))}")
print(f"  Score (tricks)  : Team A {tricks_won[0]}  Team B {tricks_won[1]}")
print(f"  History depth   : {len(history)} previous plays")

# ── Observation breakdown ──────────────────────────────────────
print(f"\n{SEP}")
print("  OBSERVATION VECTOR BREAKDOWN  (195 dimensions total)")
print(SEP)

sections = [
    ("hand_vec",       0,   32, "One-hot: cards currently in Player 0's hand"),
    ("trump_vec",     32,   36, "One-hot: trump suit  (C=0 D=1 H=2 S=3)"),
    ("lead_vec",      36,   40, "One-hot: lead suit of current trick"),
    ("trick_slot_0",  40,   72, "One-hot: card played by slot 0 in current trick"),
    ("trick_slot_1",  72,  104, "One-hot: card played by slot 1 in current trick"),
    ("trick_slot_2", 104,  136, "One-hot: card played by slot 2 (empty)"),
    ("trick_slot_3", 136,  168, "One-hot: card played by slot 3 (empty)"),
    ("score_vec",    168,  170, "Normalised trick counts [team0/8, team1/8]"),
    ("player_vec",   170,  174, "One-hot: which player we are (0–3)"),
    ("suit_counts",  174,  178, "Fraction of hand per suit (C D H S)"),
    ("void_flat",    178,  194, "4×4 void matrix (who is void in which suit)"),
    ("hand_strength",194,  195, "Normalised average card value in hand"),
]

for name, lo, hi, desc in sections:
    vals = obs_vec[lo:hi]
    non_zero = [(i, v) for i, v in enumerate(vals) if abs(v) > 1e-6]
    if non_zero:
        nz_str = ', '.join(f"[{i}]={v:.3f}" for i, v in non_zero[:6])
        extra  = f"  +{len(non_zero)-6} more" if len(non_zero) > 6 else ""
    else:
        nz_str = "(all zeros)"
        extra  = ""
    print(f"\n  [{lo:>3}:{hi:>3}]  {name:<14}  {hi-lo:>3}d  {desc}")
    print(f"           Non-zero: {nz_str}{extra}")

print(f"\n  Vector shape : {obs_vec.shape}  ✓")
print(f"  History shape: {hist_mat.shape}  (32 plays × 44 features)")
print(f"  Total obs dims: {obs_vec.shape[0]}")

# ── Action mask ────────────────────────────────────────────────
print(f"\n{SEP}")
print("  ACTION MASK  (must-follow-suit enforcement)")
print(SEP)

legal_cards   = [i for i in hand if mask_arr[i] == 1]
illegal_cards = [i for i in hand if mask_arr[i] == 0]

print(f"\n  Lead suit is {SUIT_SYM[lead_suit]} Spades — Player 0 has spades")
print(f"  LEGAL   (masked=1): {' '.join(card_str(i) for i in legal_cards)}")
print(f"  ILLEGAL (masked=0): {' '.join(card_str(i) for i in illegal_cards)}")
print(f"  → Player MUST play a Spade. Trump actions (32–35): all blocked (= 0).")

# ── AI inference ───────────────────────────────────────────────
print(f"\n{SEP}")
print("  AI DECISION")
print(SEP)

ai_agent = OmiAgent(use_gpu=False)
if not ai_agent.has_weights:
    print("\n  ⚠ No weights loaded — showing random legal selection.")

import torch

if ai_agent.model is not None:
    obs_t  = torch.FloatTensor(obs_vec).unsqueeze(0)
    hist_t = torch.FloatTensor(hist_mat).unsqueeze(0)
    mask_t = torch.FloatTensor(mask_arr)

    with torch.no_grad():
        raw_logits = ai_agent.model(obs_t, hist_t).squeeze(0)

    # Mask illegal actions
    masked_logits = raw_logits + (mask_t - 1.0) * 1e9

    print(f"\n  Logit scores for each card in hand:")
    print(f"  {'Card':<8} {'Raw logit':>12}  {'Masked logit':>13}  {'Legal':>6}  {'Rank':>5}")
    print(f"  {SEP2}")

    scored = []
    for card_idx in hand:
        raw  = raw_logits[card_idx].item()
        mskd = masked_logits[card_idx].item()
        legal = mask_arr[card_idx] == 1
        scored.append((card_idx, raw, mskd, legal))

    scored.sort(key=lambda x: x[2], reverse=True)
    for rank, (card_idx, raw, mskd, legal) in enumerate(scored, 1):
        marker = "◄ AI PICKS" if rank == 1 else ""
        legal_str = "YES" if legal else "NO"
        print(f"  {card_str(card_idx):<8} {raw:>12.4f}  {mskd:>13.4f}  {legal_str:>6}  {rank:>5}  {marker}")

    chosen = int(torch.argmax(masked_logits).item())
    print(f"\n  AI plays: {card_str(chosen)}")
    c = rules.index_to_card(chosen)
    print(f"  Reason: highest logit among legal spades — "
          f"{'strong card' if c.rank in ('A','K','Q') else 'tactically chosen'}.")
else:
    import random
    chosen = random.choice(legal_cards)
    print(f"\n  Random selection (no weights): {card_str(chosen)}")

print(f"\n{SEP}")
print("  DEMO 05 complete.")
print(SEP)
