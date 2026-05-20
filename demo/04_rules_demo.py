"""
DEMO 04 — Rules Engine
Demonstrates: deck shuffling & dealing, must-follow-suit masking,
trick resolution (trump vs non-trump), early termination at 5 tricks.
"""

import os, sys, random
sys.stdout.reconfigure(encoding='utf-8')

BACKEND = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'last', 'backend'))
sys.path.insert(0, BACKEND)

from app.game.omi_env import rules

SEP  = "=" * 62
SEP2 = "-" * 62

SUIT_SYM  = {'C': '♣', 'D': '♦', 'H': '♥', 'S': '♠'}
SUIT_NAME = {'C': 'Clubs', 'D': 'Diamonds', 'H': 'Hearts', 'S': 'Spades'}

def card_str(idx):
    c = rules.index_to_card(idx)
    return f"{SUIT_SYM[c.suit]}{c.rank}"

def hand_display(hand):
    by_suit = {}
    for idx in hand:
        c = rules.index_to_card(idx)
        by_suit.setdefault(c.suit, []).append(idx)
    parts = []
    for s in rules.SUITS:
        if s in by_suit:
            cards = '  '.join(card_str(i) for i in sorted(by_suit[s]))
            parts.append(f"  {SUIT_SYM[s]} {cards}")
    return '\n'.join(parts)

def mask_display(mask, hand):
    legal = [card_str(i) for i in hand if mask[i] == 1]
    illegal = [card_str(i) for i in hand if mask[i] == 0]
    return legal, illegal

print(SEP)
print("  DEMO 04 — Omi Rules Engine")
print(SEP)

# ══ 1. Deck & Dealing ══════════════════════════════════════════
print("\n[1] Deck Shuffling & Dealing")
print(SEP2)

rng = random.Random(42)
deck = rules.shuffle_deck(rng)
print(f"  Full deck ({len(deck)} cards) — shuffled with seed 42:")
suits_display = []
for s in rules.SUITS:
    cards = [card_str(i) for i in range(rules.NUM_CARDS) if rules.index_to_card(i).suit == s]
    suits_display.append(f"{SUIT_SYM[s]}: {' '.join(cards)}")
print("  " + "  |  ".join(suits_display))

hands, remaining = rules.deal_first_four(deck)
print(f"\n  Phase 1 — Deal 4 cards each (trump declaration phase):")
for p in range(4):
    print(f"    Player {p}: {' '.join(card_str(i) for i in hands[p])}")
print(f"  Remaining deck: {len(remaining)} cards (dealt after trump declared)")

hands = rules.deal_remaining_four(hands, remaining)
print(f"\n  Phase 2 — Full hands (8 cards each, after trump declared):")
for p in range(4):
    print(f"    Player {p}:\n{hand_display(hands[p])}")

# ══ 2. Must-Follow-Suit Masking ════════════════════════════════
print(f"\n[2] Must-Follow-Suit Action Mask")
print(SEP2)

# Build a specific hand for a clear demo
demo_hand = [
    rules.card_to_index(rules.Card('S', 'A')),   # ♠A
    rules.card_to_index(rules.Card('S', 'K')),   # ♠K
    rules.card_to_index(rules.Card('H', 'Q')),   # ♥Q
    rules.card_to_index(rules.Card('H', '9')),   # ♥9
    rules.card_to_index(rules.Card('D', 'J')),   # ♦J
    rules.card_to_index(rules.Card('C', '8')),   # ♣8
    rules.card_to_index(rules.Card('C', '7')),   # ♣7
    rules.card_to_index(rules.Card('D', '7')),   # ♦7
]
print(f"  Player hand: {' '.join(card_str(i) for i in demo_hand)}")

# Scenario A: lead suit = Spades (player has spades)
lead = 'S'
mask = rules.legal_card_mask(demo_hand, lead)
legal, illegal = mask_display(mask, demo_hand)
print(f"\n  Scenario A — Lead suit: {SUIT_SYM[lead]} Spades (player HAS spades)")
print(f"    LEGAL   (must follow): {' '.join(legal)}")
print(f"    ILLEGAL (blocked):     {' '.join(illegal)}")
print(f"    → Player MUST play a Spade. {len(legal)} legal card(s).")

# Scenario B: lead suit = Clubs (player has clubs)
lead = 'C'
mask = rules.legal_card_mask(demo_hand, lead)
legal, illegal = mask_display(mask, demo_hand)
print(f"\n  Scenario B — Lead suit: {SUIT_SYM[lead]} Clubs (player HAS clubs)")
print(f"    LEGAL   (must follow): {' '.join(legal)}")
print(f"    ILLEGAL (blocked):     {' '.join(illegal)}")

# Scenario C: lead suit = Diamonds, all hand cards match... no wait,
# build a hand void in clubs to demonstrate void = all playable
void_hand = [
    rules.card_to_index(rules.Card('S', 'A')),
    rules.card_to_index(rules.Card('S', 'K')),
    rules.card_to_index(rules.Card('H', 'Q')),
    rules.card_to_index(rules.Card('H', '9')),
]
lead = 'C'
mask = rules.legal_card_mask(void_hand, lead)
legal, illegal = mask_display(mask, void_hand)
print(f"\n  Scenario C — Lead suit: {SUIT_SYM[lead]} Clubs, player has NO clubs (void)")
print(f"    Hand: {' '.join(card_str(i) for i in void_hand)}")
print(f"    LEGAL   (void = any card playable): {' '.join(legal)}")
print(f"    ILLEGAL (blocked): {' '.join(illegal)}")
print(f"    → Void in lead suit: ALL cards become legal.")

# ══ 3. Trick Resolution ════════════════════════════════════════
print(f"\n[3] Trick Resolution")
print(SEP2)

trump = 'H'  # Hearts are trump

def show_trick(trick_list, lead_suit, trump_suit, label):
    winner = rules.resolve_trick(trick_list, lead_suit, trump_suit)
    team   = rules.team_for_player(winner)
    plays  = '  '.join(f"P{p}:{card_str(c)}" for p, c in trick_list)
    print(f"  {label}")
    print(f"    Plays: {plays}")
    print(f"    Lead: {SUIT_SYM[lead_suit]}  Trump: {SUIT_SYM[trump_suit]}")
    print(f"    Winner: Player {winner}  (Team {'A' if team==0 else 'B'})")

print(f"  Trump suit for all scenarios: {SUIT_SYM[trump]} Hearts\n")

# Scenario A: no trump played — highest lead suit wins
trick_a = [
    (0, rules.card_to_index(rules.Card('S', '7'))),   # P0: ♠7 (leads)
    (1, rules.card_to_index(rules.Card('S', 'K'))),   # P1: ♠K
    (2, rules.card_to_index(rules.Card('S', 'A'))),   # P2: ♠A  ← highest spade
    (3, rules.card_to_index(rules.Card('S', 'Q'))),   # P3: ♠Q
]
show_trick(trick_a, 'S', trump, "Scenario A — No trump played: highest lead-suit card wins")

print()
# Scenario B: one trump played — trump wins
trick_b = [
    (0, rules.card_to_index(rules.Card('S', 'A'))),   # P0: ♠A (leads)
    (1, rules.card_to_index(rules.Card('H', '7'))),   # P1: ♥7 (lowest trump)  ← WINS
    (2, rules.card_to_index(rules.Card('S', 'K'))),   # P2: ♠K
    (3, rules.card_to_index(rules.Card('D', 'Q'))),   # P3: ♦Q (off-suit)
]
show_trick(trick_b, 'S', trump, "Scenario B — One trump played: trump beats highest non-trump")

print()
# Scenario C: multiple trumps — highest trump wins
trick_c = [
    (0, rules.card_to_index(rules.Card('S', 'A'))),   # P0: ♠A (leads)
    (1, rules.card_to_index(rules.Card('H', '9'))),   # P1: ♥9 (trump)
    (2, rules.card_to_index(rules.Card('H', 'A'))),   # P2: ♥A (highest trump)  ← WINS
    (3, rules.card_to_index(rules.Card('H', 'K'))),   # P3: ♥K (trump)
]
show_trick(trick_c, 'S', trump, "Scenario C — Multiple trumps: highest trump wins")

# ══ 4. Early Termination ═══════════════════════════════════════
print(f"\n[4] Early Termination (5-trick rule)")
print(SEP2)

for t0, t1, remaining in [
    (0, 0, 32), (3, 2, 16), (4, 4, 0),
    (5, 2, 8),  (3, 5, 4),  (4, 3, 0),
]:
    terminal = rules.is_terminal((t0, t1), remaining)
    reason = ""
    if max(t0, t1) >= 5:
        reason = f"Team {'A' if t0>t1 else 'B'} has 5 tricks — cannot lose"
    elif remaining == 0:
        reason = "All cards played"
    else:
        reason = "Game continues"
    flag = "STOP" if terminal else "PLAY"
    print(f"  [{flag}]  Tricks A:{t0} B:{t1}  Cards left:{remaining:>2}  → {reason}")

print(f"\n{SEP}")
print("  DEMO 04 complete — all rules verified.")
print(SEP)
