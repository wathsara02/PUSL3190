from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts._bootstrap import require_packages

require_packages("torch", "yaml", "numpy", "gymnasium", "pettingzoo")

import torch

from omi_env.env import OmiEnv


def main() -> None:
    env = OmiEnv(seed=123)
    first_obs = env.reset(seed=123)
    print(f"Python executable: {sys.executable}")
    print(f"PyTorch version: {torch.__version__}")
    print(f"Initial agent: {env.agent_selection}")
    print(f"Observation keys: {sorted(first_obs.keys())}")
    print("Setup check passed.")


if __name__ == "__main__":
    main()
