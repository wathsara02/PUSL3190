"""
DEMO 03 — AI vs Random Benchmark
Runs 200 independent hands: AI controls Team A (seats 0 & 2),
Random controls Team B (seats 1 & 3).
Prints a live progress bar and final statistics.
"""

import os, sys, random, time
sys.stdout.reconfigure(encoding='utf-8')

BACKEND = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'last', 'backend'))
sys.path.insert(0, BACKEND)

from app.game.omi_env.env import OmiEnv
from app.game.omi_env import rules
from rl_model.omi_agent import OmiAgent

SEP = "=" * 62

def progress_bar(done, total, width=40):
    filled = int(width * done / total)
    bar = '█' * filled + '░' * (width - filled)
    pct = done / total * 100
    return f"[{bar}] {pct:5.1f}%  ({done}/{total})"

def run_hand(env, ai_agent, seed):
    """Run one hand; return (ai_tricks, random_tricks)."""
    env.reset(seed=seed)

    while True:
        if all(env.terminations.get(a, False) for a in env.agents):
            break

        agent_name = env.agent_selection
        agent_id   = int(agent_name.split('_')[1])
        obs        = env.observe(agent_name)
        legal      = [i for i, v in enumerate(obs['action_mask']) if v == 1]

        # Seats 0 & 2 = AI (Team A);  Seats 1 & 3 = Random (Team B)
        if agent_id in (0, 2):
            action = ai_agent.get_action(obs)
        else:
            action = random.choice(legal)

        env.step(action)

    tw = env.tricks_won   # (team0_tricks, team1_tricks)
    return tw[0], tw[1]


# ── Setup ──────────────────────────────────────────────────────
print(SEP)
print("  DEMO 03 — AI vs Random Benchmark (200 hands)")
print(SEP)

print("\nLoading AI agent...")
ai_agent = OmiAgent(use_gpu=False)
status = "✓ Trained weights" if ai_agent.has_weights else "⚠ No weights (random fallback)"
print(f"  {status}")
print(f"\n  Team A (seats 0 & 2): AI agent")
print(f"  Team B (seats 1 & 3): Random agent")

N_HANDS = 200
env = OmiEnv()

ai_wins = 0
rand_wins = 0
ties = 0
ai_tricks_total = 0
rand_tricks_total = 0

base_seed = 42
start = time.time()

print(f"\nRunning {N_HANDS} hands...\n")

for i in range(N_HANDS):
    ai_t, rand_t = run_hand(env, ai_agent, seed=base_seed + i)
    ai_tricks_total   += ai_t
    rand_tricks_total += rand_t

    if ai_t > rand_t:
        ai_wins += 1
    elif rand_t > ai_t:
        rand_wins += 1
    else:
        ties += 1

    # Update progress every 10 hands
    if (i + 1) % 10 == 0 or i == N_HANDS - 1:
        bar = progress_bar(i + 1, N_HANDS)
        print(f"\r  {bar}", end='', flush=True)

elapsed = time.time() - start
print(f"\n\n  Completed in {elapsed:.1f}s  ({elapsed/N_HANDS*1000:.1f} ms/hand)\n")

# ── Results ────────────────────────────────────────────────────
ai_wr   = ai_wins   / N_HANDS * 100
rand_wr = rand_wins / N_HANDS * 100
tie_r   = ties      / N_HANDS * 100
avg_ai_t   = ai_tricks_total   / N_HANDS
avg_rand_t = rand_tricks_total / N_HANDS

print(SEP)
print("  RESULTS")
print(SEP)
print(f"  {'Metric':<28} {'AI (Team A)':>12}  {'Random (Team B)':>15}")
print(f"  {'-'*58}")
print(f"  {'Hands won':<28} {ai_wins:>12}  {rand_wins:>15}")
print(f"  {'Win rate':<28} {ai_wr:>11.1f}%  {rand_wr:>14.1f}%")
print(f"  {'Ties':<28} {ties:>12}  {'(shared)':>15}")
print(f"  {'Avg tricks per hand':<28} {avg_ai_t:>12.2f}  {avg_rand_t:>15.2f}")
print(f"  {'-'*58}")

# ASCII win-rate bar chart
bar_width = 40
ai_bar   = '█' * int(ai_wr   / 100 * bar_width)
rand_bar = '█' * int(rand_wr / 100 * bar_width)
print(f"\n  Win Rate Bar Chart:")
print(f"  AI     {ai_wr:5.1f}%  |{ai_bar:<{bar_width}}|")
print(f"  Random {rand_wr:5.1f}%  |{rand_bar:<{bar_width}}|")

# Interpretation
print(f"\n  Interpretation:")
if ai_wr > rand_wr + 10:
    print(f"  ✓ AI wins {ai_wr:.1f}% of hands — significantly better than random.")
elif ai_wr > rand_wr:
    print(f"  ✓ AI wins more hands than random ({ai_wr:.1f}% vs {rand_wr:.1f}%).")
elif ai_wr == rand_wr:
    print(f"  ~ AI and random perform equally — check if weights loaded.")
else:
    print(f"  ✗ Random outperforms AI — weights may not be fully trained.")

print(SEP)
