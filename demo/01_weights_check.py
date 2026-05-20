"""
DEMO 01 — Weights Verification
Shows that weights.pt loads correctly, prints the PolicyNet architecture,
parameter count, and runs a forward pass to confirm valid output shape.
"""

import os, sys
sys.stdout.reconfigure(encoding='utf-8')

BACKEND = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'last', 'backend'))
sys.path.insert(0, BACKEND)

import torch
import numpy as np

WEIGHTS_PATH = os.path.join(BACKEND, 'rl_model', 'weights.pt')

SEP  = "=" * 60
SEP2 = "-" * 60

print(SEP)
print("  DEMO 01 — PolicyNet Weights Verification")
print(SEP)

# ── 1. File check ──────────────────────────────────────────────
print("\n[1] Locating weights file...")
if not os.path.exists(WEIGHTS_PATH):
    print(f"  ERROR: weights.pt not found at:\n  {WEIGHTS_PATH}")
    sys.exit(1)

size_mb = os.path.getsize(WEIGHTS_PATH) / 1024 / 1024
print(f"  Path  : {WEIGHTS_PATH}")
print(f"  Size  : {size_mb:.2f} MB")

# ── 2. Load checkpoint ─────────────────────────────────────────
print("\n[2] Loading checkpoint...")
ckpt = torch.load(WEIGHTS_PATH, map_location='cpu', weights_only=False)

if isinstance(ckpt, dict):
    keys = list(ckpt.keys())[:8]
    print(f"  Checkpoint keys: {keys}")
    state_dict = ckpt.get('policy_state_dict', ckpt)
else:
    state_dict = ckpt.state_dict() if hasattr(ckpt, 'state_dict') else {}

print(f"  State dict layers: {len(state_dict)}")

# ── 3. Rebuild PolicyNet ───────────────────────────────────────
print("\n[3] Rebuilding PolicyNet architecture...")

OBS_DIM     = 195
HISTORY_DIM = 32 * 44   # 1408
ACTION_DIM  = 36
HIDDEN      = 128

import torch.nn as nn

class PolicyNet(nn.Module):
    def __init__(self):
        super().__init__()
        self.obs_encoder  = nn.Linear(OBS_DIM, HIDDEN)
        self.hist_encoder = nn.Sequential(
            nn.Linear(HISTORY_DIM, HIDDEN * 2),
            nn.LayerNorm(HIDDEN * 2),
            nn.ReLU(),
            nn.Linear(HIDDEN * 2, HIDDEN),
            nn.LayerNorm(HIDDEN),
        )
        self.core = nn.Sequential(
            nn.Linear(HIDDEN * 2, HIDDEN),
            nn.LayerNorm(HIDDEN),
            nn.Tanh(),
            nn.Linear(HIDDEN, HIDDEN),
            nn.LayerNorm(HIDDEN),
            nn.Tanh(),
        )
        self.actor = nn.Linear(HIDDEN, ACTION_DIM)

    def forward(self, obs, history):
        B = obs.shape[0]
        obs_emb  = torch.tanh(self.obs_encoder(obs))
        hist_emb = self.hist_encoder(history.reshape(B, -1))
        x = self.core(torch.cat([obs_emb, hist_emb], dim=-1))
        return self.actor(x)

net = PolicyNet()
net.load_state_dict(state_dict)
net.eval()
print("  Loaded successfully.")

# ── 4. Architecture & parameter count ─────────────────────────
print("\n[4] Layer-by-layer architecture:")
print(f"  {'Layer':<35} {'Shape':<25} Params")
print(f"  {SEP2}")

total = 0
for name, param in net.named_parameters():
    n = param.numel()
    total += n
    print(f"  {name:<35} {str(tuple(param.shape)):<25} {n:,}")

print(f"  {SEP2}")
print(f"  Total trainable parameters: {total:,}")

# ── 5. Forward pass ────────────────────────────────────────────
print("\n[5] Forward pass with dummy input...")

dummy_obs     = torch.zeros(1, OBS_DIM)
dummy_history = torch.zeros(1, 32, 44)

with torch.no_grad():
    logits = net(dummy_obs, dummy_history)

print(f"  Input  obs shape    : {tuple(dummy_obs.shape)}")
print(f"  Input  history shape: {tuple(dummy_history.shape)}")
print(f"  Output logits shape : {tuple(logits.shape)}  (expected: (1, 36))")
assert logits.shape == (1, ACTION_DIM), "Shape mismatch!"
print("  Shape assertion PASSED.")

# ── 6. Sanity: non-constant outputs ───────────────────────────
print("\n[6] Checking output variation with different inputs...")
obs_a = torch.randn(1, OBS_DIM)
obs_b = torch.randn(1, OBS_DIM)
hist  = torch.randn(1, 32, 44)

with torch.no_grad():
    out_a = net(obs_a, hist)
    out_b = net(obs_b, hist)

diff = (out_a - out_b).abs().mean().item()
print(f"  Mean absolute diff between two random inputs: {diff:.4f}")
print(f"  (Should be > 0 — weights are NOT trivially zero)")
assert diff > 0, "Model outputs identical values for different inputs!"
print("  Variation check PASSED.")

print(f"\n{SEP}")
print("  RESULT: weights.pt is valid and PolicyNet operates correctly.")
print(SEP)
