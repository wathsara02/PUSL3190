import os
import sys
import asyncio
import logging
import random

logger = logging.getLogger(__name__)

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from rl_model.omi_agent import OmiAgent


class BotManager:
    def __init__(self):
        try:
            self.agent = OmiAgent(use_gpu=False)
            if self.agent.has_weights:
                logger.info("BotManager: model loaded.")
            else:
                logger.warning("BotManager: no weights — bots will play randomly.")
        except Exception as e:
            logger.error(f"BotManager: failed to initialise OmiAgent: {e}")
            self.agent = None

    async def get_action(self, obs_dict: dict, difficulty: str = "easy") -> int:
        if self.agent is not None:
            try:
                return await asyncio.to_thread(self.agent.get_action, obs_dict)
            except Exception as e:
                logger.error(f"BotManager: inference error ({e}), falling back to random.")

        legal_indices = [i for i, v in enumerate(obs_dict["action_mask"]) if v == 1]
        if not legal_indices:
            raise ValueError("No legal actions available for bot.")
        return random.choice(legal_indices)


bot_manager = BotManager()
