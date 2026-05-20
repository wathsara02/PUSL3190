"""
OmiAgent: loads the trained PolicyNet for the Omi card game.

Place the training checkpoint at:
    backend/rl_model/weights.pt

The checkpoint must be a dict with key 'policy_state_dict' (as produced by
the finalwm training script), or a bare state_dict with the same keys.
"""

import os
import random
import logging

logger = logging.getLogger(__name__)

WEIGHTS_PATH = os.path.join(os.path.dirname(__file__), "weights.pt")

# Must match finalwm/models/policy.py exactly.
_OBS_DIM      = 195
_HISTORY_DIM  = 32 * 44   # HISTORY_LEN × HISTORY_FEAT_DIM
_ACTION_DIM   = 36
_HIDDEN       = 128


def _build_policy():
    """Reconstruct the feed-forward PolicyNet architecture."""
    import torch.nn as nn

    class _PolicyNet(nn.Module):
        def __init__(self):
            super().__init__()
            self.obs_encoder = nn.Linear(_OBS_DIM, _HIDDEN)
            self.hist_encoder = nn.Sequential(
                nn.Linear(_HISTORY_DIM, _HIDDEN * 2),
                nn.LayerNorm(_HIDDEN * 2),
                nn.ReLU(),
                nn.Linear(_HIDDEN * 2, _HIDDEN),
                nn.LayerNorm(_HIDDEN),
            )
            self.core = nn.Sequential(
                nn.Linear(_HIDDEN * 2, _HIDDEN),
                nn.LayerNorm(_HIDDEN),
                nn.Tanh(),
                nn.Linear(_HIDDEN, _HIDDEN),
                nn.LayerNorm(_HIDDEN),
                nn.Tanh(),
            )
            self.actor = nn.Linear(_HIDDEN, _ACTION_DIM)

        def forward(self, obs, history):
            import torch
            B = obs.shape[0]
            obs_emb  = torch.tanh(self.obs_encoder(obs))
            hist_emb = self.hist_encoder(history.reshape(B, -1))
            x = self.core(torch.cat([obs_emb, hist_emb], dim=-1))
            return self.actor(x)

    return _PolicyNet()


class OmiAgent:
    """Wraps the trained PolicyNet with difficulty-aware epsilon-greedy selection."""

    def __init__(self, use_gpu: bool = False):
        self.model  = None
        self.has_weights = False
        self.device = "cpu"

        try:
            import torch
            if not os.path.exists(WEIGHTS_PATH):
                logger.warning(f"No weights at {WEIGHTS_PATH} — bots will play randomly.")
                return

            self.device = "cuda" if use_gpu and torch.cuda.is_available() else "cpu"
            ckpt = torch.load(WEIGHTS_PATH, map_location=self.device, weights_only=False)

            # Accept both a raw checkpoint dict and a bare state_dict.
            if isinstance(ckpt, dict) and "policy_state_dict" in ckpt:
                state_dict = ckpt["policy_state_dict"]
            elif isinstance(ckpt, dict):
                state_dict = ckpt
            else:
                # Full serialised module (torch.save(model, ...))
                self.model = ckpt
                self.model.eval()
                self.has_weights = True
                logger.info(f"OmiAgent: loaded full model from {WEIGHTS_PATH}.")
                return

            net = _build_policy()
            net.load_state_dict(state_dict)
            net.eval()
            self.model = net.to(self.device)
            self.has_weights = True
            logger.info(f"OmiAgent: loaded policy from checkpoint at {WEIGHTS_PATH} on {self.device}.")

        except ImportError:
            logger.warning("PyTorch not installed — bots will play randomly.")
        except Exception as e:
            logger.error(f"OmiAgent failed to load: {e}. Falling back to random.")

    def get_action(self, obs_dict: dict) -> int:
        legal = [i for i, v in enumerate(obs_dict["action_mask"]) if v == 1]
        if not legal:
            raise ValueError("No legal actions available for OmiAgent.")

        if self.model is None:
            return random.choice(legal)

        try:
            return self._model_action(obs_dict, legal)
        except Exception as e:
            logger.error(f"Inference error: {e}. Using random fallback.")
            return random.choice(legal)

    def _model_action(self, obs_dict: dict, legal: list) -> int:
        import torch

        obs     = torch.FloatTensor(obs_dict["observation"]).unsqueeze(0).to(self.device)
        history = torch.FloatTensor(obs_dict["history"]).unsqueeze(0).to(self.device)
        mask    = torch.FloatTensor(obs_dict["action_mask"]).to(self.device)

        with torch.no_grad():
            logits = self.model(obs, history).squeeze(0)

        logits = logits + (mask - 1.0) * 1e9
        action = int(torch.argmax(logits).item())
        return action if action in legal else random.choice(legal)
