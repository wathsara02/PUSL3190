"""
PettingZoo AEC environment for the Omi trick-taking game.

Key features:
- Must-follow-suit enforcement with action masks.
- Trump declaration phase (player 0 chooses a suit by default).
- Observation includes private hand, public info, and history for recurrent agents.
- CTDE-friendly info dict exposes winner and final score at terminal.
"""

from __future__ import annotations

import random
from typing import Dict, List, Optional, Sequence, Tuple

import numpy as np
from gymnasium import spaces
from pettingzoo import AECEnv
from pettingzoo.utils import agent_selector

from . import encoding, rules


class OmiEnv(AECEnv):
    metadata = {"render.modes": ["human"], "name": "omi_v0"}

    def __init__(self, seed: int = 0):
        super().__init__()
        self._seed = seed
        self.rng = random.Random(seed)
        self.agents = [f"player_{i}" for i in range(4)]
        self.possible_agents = self.agents[:]
        # Trump declarer rotates each hand.
        # Per your rule: the player to the right-hand side of the previous declarer
        # declares trumps next hand (we interpret this as clockwise rotation: +1).
        self.start_player = 0
        self.reinit()

        obs_len = encoding.observation_length()
        self.observation_spaces: Dict[str, spaces.Space] = {
            agent: spaces.Dict(
                {
                    "observation": spaces.Box(low=0.0, high=1.0, shape=(obs_len,), dtype=np.float32),
                    "action_mask": spaces.Box(low=0.0, high=1.0, shape=(rules.ACTION_DIM,), dtype=np.float32),
                    "history": spaces.Box(low=0.0, high=1.0, shape=(encoding.HISTORY_LEN, encoding.HISTORY_FEAT_DIM), dtype=np.float32),
                }
            )
            for agent in self.possible_agents
        }
        self.action_spaces: Dict[str, spaces.Space] = {
            agent: spaces.Discrete(rules.ACTION_DIM) for agent in self.possible_agents
        }

    def seed(self, seed: Optional[int] = None):
        if seed is not None:
            self._seed = seed
        self.rng = random.Random(self._seed)

    def reinit(self):
        self.trump_suit: Optional[str] = None
        self.lead_suit: Optional[str] = None
        self.hands: List[List[int]] = [[], [], [], []]
        self._remaining_deck: List[int] = []
        self.current_trick: List[Tuple[int, int]] = []
        self.last_completed_trick: List[Tuple[int, int]] = []
        self.last_trick_winner: Optional[int] = None
        self.tricks_won: Tuple[int, int] = (0, 0)
        self.trump_declarer = self.start_player
        self.history: List[Tuple[int, int, Optional[str], Optional[str]]] = []
        # Stages: "trump" (after initial 4-card deal) -> "play" (after remaining deal)
        self.stage: str = "trump"
        self._terminated = False
        self._illegal_actions = 0
        self.episode_length = 0
        self._init_selector(start=self.start_player)
        self.rewards = {agent: 0.0 for agent in self.agents}
        self._cumulative_rewards = {agent: 0.0 for agent in self.agents}
        self.terminations = {agent: False for agent in self.agents}
        self.truncations = {agent: False for agent in self.agents}
        self.infos = {agent: {} for agent in self.agents}
        self.has_reset = False

    def _init_selector(self, start: int, *, only_one: bool = False):
        if only_one:
            order = [f"player_{start % 4}"]
        else:
            order = [f"player_{(start + i) % 4}" for i in range(4)]
        self.agent_selector = agent_selector(order)
        self.agent_selection = self.agent_selector.reset()

    def reset(self, seed: Optional[int] = None, options=None):
        self.seed(seed if seed is not None else self._seed)
        # Restore active agents list back to all possible 4 players
        self.agents = self.possible_agents[:]
        self.reinit()
        deck = rules.shuffle_deck(self.rng)
        self.hands, self._remaining_deck = rules.deal_first_four(deck)
        # Trump declaration: only the current declarer takes an action
        self._init_selector(start=self.start_player, only_one=True)
        self.has_reset = True
        # Rotate clockwise for the next hand (right-hand side of previous declarer)
        self.start_player = (self.start_player + 1) % 4
        return self.observe(self.agent_selection)

    # PettingZoo requirement
    def observe(self, agent: str):
        agent_id = self.agents.index(agent)
        mask = self._action_mask(agent_id)
        return encoding.encode_observation(
            agent_id,
            self.hands[agent_id],
            self.trump_suit,
            self.lead_suit,
            self.current_trick,
            self.tricks_won,
            mask,
            self.history,
        )

    def _action_mask(self, agent_id: int) -> List[int]:
        if self.stage == "trump":
            return rules.legal_trump_mask()

        card_mask = rules.legal_card_mask(self.hands[agent_id], self.lead_suit)
        return card_mask + [0] * 4

    def step(self, action: int):
        if self._terminated:
            return self._was_dead_step(action)

        agent = self.agent_selection
        agent_id = self.agents.index(agent)
        mask = self._action_mask(agent_id)
        advance_turn = True
        if mask[action] == 0:
            self._illegal_actions += 1
            # For strictness, ignore the action by selecting a legal fallback
            legal_indices = [i for i, v in enumerate(mask) if v == 1]
            action = legal_indices[0]

        if self.stage == "trump":
            # Only the current declarer acts in this stage.
            if not rules.is_trump_action(action):
                raise ValueError("During trump declaration only trump actions are legal")
            suit_idx = action - rules.ACTION_TRUMP_OFFSET
            self.trump_suit = rules.SUITS[suit_idx]
            # Deal remaining 16 cards (4 to each) after trump is declared
            self.hands = rules.deal_remaining_four(self.hands, self._remaining_deck)
            self._remaining_deck = []
            self.stage = "play"
            # Switch turn order back to all 4 players; declarer leads first trick
            self._init_selector(start=agent_id)
            advance_turn = False
        else:
            is_trump, card_idx = encoding.decode_action(action)
            if is_trump:
                raise ValueError("Trump action after trump selection is illegal")
            if self.current_trick == []:
                self.last_completed_trick = []
                self.last_trick_winner = None
            # Remove card from hand
            try:
                self.hands[agent_id].remove(card_idx)
            except ValueError as exc:
                raise ValueError(f"Card {card_idx} not in hand for player {agent_id}") from exc

            if self.lead_suit is None:
                self.lead_suit = rules.index_to_card(card_idx).suit
            self.current_trick.append((agent_id, card_idx))
            self.history.append((agent_id, card_idx, self.lead_suit, self.trump_suit))
            self.episode_length += 1

            # Resolve trick if complete
            if len(self.current_trick) == 4:
                winner = rules.resolve_trick(self.current_trick, self.lead_suit, self.trump_suit)
                self.last_completed_trick = list(self.current_trick)
                self.last_trick_winner = winner
                team = rules.team_for_player(winner)
                if team == 0:
                    self.tricks_won = (self.tricks_won[0] + 1, self.tricks_won[1])
                else:
                    self.tricks_won = (self.tricks_won[0], self.tricks_won[1] + 1)

                self.current_trick = []
                self.lead_suit = None
                # Next trick led by winner
                self._init_selector(start=winner)
                advance_turn = False

        # Advance to next agent
        if advance_turn:
            self.agent_selection = self.agent_selector.next()
            
        # Terminal check
        cards_remaining = sum(len(h) for h in self.hands)
        self._terminated = rules.is_terminal(self.tricks_won, cards_remaining)

        if self._terminated:
            winner_team = rules.compute_winner(self.tricks_won)
            for ag in self.agents:
                ag_team = rules.team_for_player(self.agents.index(ag))
                if winner_team == -1:
                    reward = 0.0
                elif ag_team == winner_team:
                    reward = 1.0
                else:
                    reward = -1.0
                self.rewards[ag] = reward
                self.terminations[ag] = True
                self.infos[ag] = {
                    "winner_team": winner_team,
                    "final_score": self.tricks_won,
                    "episode_length": self.episode_length,
                    "illegal_actions": self._illegal_actions,
                }
        self._cumulative_rewards[agent] = 0.0
        
        # Don't return self.observe() from step() in AEC Envs
        return None

    def _was_dead_step(self, action):
        # Called by step() when the environment is already terminated.
        # action is ignored — this is a no-op that advances the agent selector.
        agent = self.agent_selection
        self._cumulative_rewards[agent] = 0.0
        self.rewards[agent] = 0.0
        self.terminations[agent] = True
        self.truncations[agent] = True

        if agent in self.agents:
            self.agents.remove(agent)

        if self.agents:
            self.agent_selection = self.agent_selector.next()
        return None

    def render(self):
        print(f"Stage: {self.stage}, Trump: {self.trump_suit}, Lead: {self.lead_suit}")
        print(f"Current trick: {[(p, rules.index_to_card(c)) for p, c in self.current_trick]}")
        print(f"Scores: {self.tricks_won}")

    def close(self):
        pass

    def state(self) -> Dict[str, object]:
        """
        Return a centralized state representation for training the critic.
        Includes public info plus all hands (for CTDE).
        """
        return {
            "hands": [list(h) for h in self.hands],
            "trump_suit": self.trump_suit,
            "lead_suit": self.lead_suit,
            "current_trick": list(self.current_trick),
            "completed_trick": list(self.last_completed_trick),
            "trick_winner_display": self.last_trick_winner,
            "tricks_won": self.tricks_won,
            "trump_declarer": self.trump_declarer,
            "history": list(self.history),
        }
