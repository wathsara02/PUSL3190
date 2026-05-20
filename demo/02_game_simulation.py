"""
DEMO 02 — Full Game Simulation (AI vs AI)
Runs one complete Omi match with 4 AI agents and prints every
trick, score update, and the final result in a readable format.
"""

import os, sys, random, secrets
sys.stdout.reconfigure(encoding='utf-8')

BACKEND = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'last', 'backend'))
sys.path.insert(0, BACKEND)

from app.game.omi_env.env import OmiEnv
from app.game.omi_env import rules
from rl_model.omi_agent import OmiAgent

SEP  = "=" * 62
SEP2 = "-" * 62

SUIT_SYM  = {'C': '♣', 'D': '♦', 'H': '♥', 'S': '♠'}
SUIT_NAME = {'C': 'Clubs', 'D': 'Diamonds', 'H': 'Hearts', 'S': 'Spades'}
TEAM_NAME = {0: 'Team A (seats 0 & 2)', 1: 'Team B (seats 1 & 3)'}

def card_str(idx):
    c = rules.index_to_card(idx)
    return f"{SUIT_SYM[c.suit]}{c.rank:>2}"

def hand_str(hand):
    by_suit = {}
    for idx in hand:
        c = rules.index_to_card(idx)
        by_suit.setdefault(c.suit, []).append(c.rank)
    parts = []
    for s in rules.SUITS:
        if s in by_suit:
            parts.append(f"{SUIT_SYM[s]}:{','.join(by_suit[s])}")
    return '  '.join(parts)

print(SEP)
print("  DEMO 02 — Full Omi Match Simulation (AI vs AI)")
print(SEP)

print("\nLoading trained AI agent...")
agent = OmiAgent(use_gpu=False)
status = "✓ Trained weights loaded" if agent.has_weights else "⚠ No weights — using random play"
print(f"  {status}")

MATCH_TARGET = 10
match_scores = [0, 0]
hand_num = 0
env = OmiEnv()
seed = secrets.randbits(32)

print(f"\nMatch target: {MATCH_TARGET} points  |  Seed: {seed}")
print(SEP)

while max(match_scores) < MATCH_TARGET:
    hand_num += 1
    env.reset(seed=seed + hand_num)

    print(f"\n{'━'*62}")
    print(f"  HAND {hand_num}  |  Score: Team A {match_scores[0]} – {match_scores[1]} Team B")
    print(f"{'━'*62}")

    # Show initial hands after trump declaration phase ends
    trump_declared = False
    trump_suit = None
    trick_num = 0
    trick_cards = []

    while True:
        if all(env.terminations.get(a, False) for a in env.agents):
            break

        current_agent = env.agent_selection
        agent_id = int(current_agent.split('_')[1])
        obs = env.observe(current_agent)

        # Show hands on first play action (after trump is declared)
        if env.stage == 'trump' and not trump_declared:
            action = agent.get_action(obs)
            suit_idx = action - rules.ACTION_TRUMP_OFFSET
            trump_suit = rules.SUITS[suit_idx]
            print(f"\n  Trump declarer: Player {agent_id}")

            # Print everyone's initial hand
            print("  Initial hands (4 cards each before trump deal):")
            for p in range(4):
                team_tag = "A" if p % 2 == 0 else "B"
                print(f"    Player {p} (Team {team_tag}): {hand_str(env.hands[p])}")

            env.step(action)
            trump_declared = True

            # After step, remaining cards are dealt
            print(f"\n  Trump declared: {SUIT_SYM[trump_suit]} {SUIT_NAME[trump_suit].upper()}")
            print("  Full hands after deal:")
            for p in range(4):
                team_tag = "A" if p % 2 == 0 else "B"
                print(f"    Player {p} (Team {team_tag}): {hand_str(env.hands[p])}")
            continue

        # Play phase
        if env.stage == 'play':
            if len(env.current_trick) == 0 and trick_cards:
                # Print completed trick
                trick_num += 1
                winner = env.last_trick_winner
                team   = rules.team_for_player(winner)
                tw     = env.tricks_won
                plays  = "  ".join(f"P{pid}:{card_str(cid)}" for pid, cid in trick_cards)
                print(f"\n  Trick {trick_num:>2}: {plays}")
                print(f"           → Winner: Player {winner}  "
                      f"(Team {'A' if team==0 else 'B'})  "
                      f"| Tricks A:{tw[0]}  B:{tw[1]}")
                trick_cards = []

            # Record card being played
            action = agent.get_action(obs)
            card_played = action  # card index for play actions
            trick_cards.append((agent_id, card_played))
            env.step(action)
        else:
            action = agent.get_action(obs)
            env.step(action)

    # Print last trick
    if trick_cards:
        trick_num += 1
        winner = env.last_trick_winner if env.last_trick_winner is not None else 0
        team   = rules.team_for_player(winner)
        tw     = env.tricks_won
        plays  = "  ".join(f"P{pid}:{card_str(cid)}" for pid, cid in trick_cards)
        print(f"\n  Trick {trick_num:>2}: {plays}")
        print(f"           → Winner: Player {winner}  "
              f"(Team {'A' if team==0 else 'B'})  "
              f"| Tricks A:{tw[0]}  B:{tw[1]}")

    # Score hand
    tw = env.tricks_won
    hand_winner = rules.compute_winner(tw)
    print(f"\n  Hand {hand_num} result: Tricks → Team A: {tw[0]}  Team B: {tw[1]}")
    if hand_winner == -1:
        print("  Tied hand — bonus point carries to next hand.")
    else:
        pts = 1
        match_scores[hand_winner] += pts
        print(f"  {'Team A' if hand_winner==0 else 'Team B'} wins the hand (+{pts} point)")

    print(f"  Match score: Team A {match_scores[0]} – {match_scores[1]} Team B")

print(f"\n{SEP}")
winner = 0 if match_scores[0] > match_scores[1] else 1
print(f"  MATCH OVER after {hand_num} hands")
print(f"  WINNER: {TEAM_NAME[winner]}")
print(f"  Final score: Team A {match_scores[0]} – {match_scores[1]} Team B")
print(SEP)
