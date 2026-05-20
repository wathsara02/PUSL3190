import uuid
import asyncio
import logging
import secrets
from typing import Dict, Optional, Tuple
from datetime import datetime, timedelta, timezone
import json

from app.models.schemas import HandResultModel, SeatModel, RoomStateSnapshot
from app.game.omi_env.env import OmiEnv
from app.game.omi_env import rules
from app.ai.bot_manager import bot_manager

logger = logging.getLogger(__name__)

class RoomState:
    MATCH_TARGET = 10
    TRICK_ANIMATION_DELAY_SECONDS = 2.7
    ROUND_START_ANIMATION_DELAY_SECONDS = 2.2
    BOT_MOVE_DELAY_SECONDS = 0.85
    DISCONNECT_BOT_TAKEOVER_SECONDS = 10

    def __init__(self, room_id: str, host_token: str):
        self.room_id = room_id
        self.host_token = host_token
        self.created_at = datetime.now(timezone.utc)
        self.last_active = datetime.now(timezone.utc)
        
        # 4 seats initialized as open
        self.seats = [
            SeatModel(seat_id=0, type="open"),
            SeatModel(seat_id=1, type="open"),
            SeatModel(seat_id=2, type="open"),
            SeatModel(seat_id=3, type="open"),
        ]
        
        self.env = OmiEnv()
        self.phase = "lobby" # lobby, playing, finished
        self.match_scores = (0, 0)
        self.match_winner_team: Optional[int] = None
        self.pending_tie_bonus = False
        self.hand_history = []
        self.hand_number = 0
        self.completed_trick_for_display = None
        self.trick_winner_for_display = None
        self.last_hand_result_for_display: Optional[HandResultModel] = None
        
        self._lock = asyncio.Lock()
        self.turn_task: Optional[asyncio.Task] = None
        self._disconnect_tasks: Dict[int, asyncio.Task] = {}
        self._displaced_humans: Dict[int, dict] = {}

    def update_activity(self):
        self.last_active = datetime.now(timezone.utc)

    def get_seat_for_token(self, token: str) -> Optional[int]:
        for seat in self.seats:
            if seat.type == "human" and seat.token == token:
                return seat.seat_id
        return None

    def join_human(self, token: str, display_name: str, user_id: Optional[str] = None, avatar_id: Optional[str] = None) -> bool:
        """Assign human to first open seat."""
        self.update_activity()
        for seat in self.seats:
            if seat.type == "open":
                seat.type = "human"
                seat.token = token
                seat.peer_id = str(uuid.uuid4())
                seat.display_name = display_name
                seat.user_id = user_id
                seat.avatar_id = avatar_id
                seat.is_muted = False
                seat.is_deafened = False
                return True
        return False

    def update_audio_status(self, token: str, *, muted: Optional[bool] = None, deafened: Optional[bool] = None):
        self.update_activity()
        seat_id = self.get_seat_for_token(token)
        if seat_id is None:
            raise ValueError("Unauthorized")

        seat = self.seats[seat_id]
        if seat.type != "human":
            raise ValueError("Only human players can update audio status")

        if muted is not None:
            seat.is_muted = muted
        if deafened is not None:
            seat.is_deafened = deafened

    def swap_seats(self, idx1: int, idx2: int):
        self.update_activity()
        if self.phase != "lobby" and self.phase != "finished":
            raise ValueError("Cannot swap during active game")
        if not (0 <= idx1 < 4 and 0 <= idx2 < 4):
            raise ValueError("Invalid seat index")
        
        self.seats[idx1], self.seats[idx2] = self.seats[idx2], self.seats[idx1]
        self.seats[idx1].seat_id = idx1
        self.seats[idx2].seat_id = idx2

    async def on_player_disconnect(self, token: str):
        seat_id = self.get_seat_for_token(token)
        if seat_id is None:
            return
        seat = self.seats[seat_id]
        if seat.is_disconnected:
            return
        seat.is_disconnected = True

        from app.ws.connection import connection_manager
        await connection_manager.broadcast_state(self.room_id)

        if self.phase == "lobby":
            active_humans = [s for s in self.seats if s.type == "human" and not s.is_disconnected]
            if not active_humans:
                room_manager.rooms.pop(self.room_id, None)
                logger.info("Empty lobby %s closed.", self.room_id)
            return

        if self.phase != "playing":
            return

        async def _takeover():
            try:
                await asyncio.sleep(self.DISCONNECT_BOT_TAKEOVER_SECONDS)
            except asyncio.CancelledError:
                return

            async with self._lock:
                if self.get_seat_for_token(token) != seat_id:
                    return
                if not self.seats[seat_id].is_disconnected:
                    return
                if self.phase != "playing":
                    return
                s = self.seats[seat_id]
                self._displaced_humans[seat_id] = {
                    "token": token,
                    "display_name": s.display_name,
                    "user_id": s.user_id,
                    "avatar_id": s.avatar_id,
                    "peer_id": s.peer_id,
                }
                s.type = "bot"
                s.token = None
                s.bot_difficulty = "easy"
                s.display_name = f"Bot {seat_id + 1}"
                s.is_disconnected = False
                s.peer_id = None

            from app.ws.connection import connection_manager
            await connection_manager.broadcast_state(self.room_id)
            self.check_bot_turn()

        task = asyncio.create_task(_takeover())
        self._disconnect_tasks[seat_id] = task

    async def on_player_reconnect(self, token: str):
        # Case 1: still in seat but marked disconnected (reconnected within 10 s)
        seat_id = self.get_seat_for_token(token)
        if seat_id is not None:
            if self.seats[seat_id].is_disconnected:
                task = self._disconnect_tasks.pop(seat_id, None)
                if task:
                    task.cancel()
                self.seats[seat_id].is_disconnected = False
                from app.ws.connection import connection_manager
                await connection_manager.broadcast_state(self.room_id)
            return

        # Case 2: bot already replaced them — restore human seat
        displaced_seat_id = next(
            (sid for sid, data in self._displaced_humans.items() if data["token"] == token),
            None,
        )
        if displaced_seat_id is None:
            return

        saved = self._displaced_humans.pop(displaced_seat_id)
        async with self._lock:
            s = self.seats[displaced_seat_id]
            # Cancel the bot turn task if it is for the restored seat
            if self.turn_task is not None and not self.turn_task.done():
                current_player = self.env.agents.index(self.env.agent_selection)
                if current_player == displaced_seat_id:
                    self.turn_task.cancel()
                    self.turn_task = None
            s.type = "human"
            s.token = saved["token"]
            s.display_name = saved["display_name"]
            s.user_id = saved.get("user_id")
            s.avatar_id = saved.get("avatar_id")
            s.peer_id = str(uuid.uuid4())
            s.bot_difficulty = None
            s.is_disconnected = False

        from app.ws.connection import connection_manager
        await connection_manager.broadcast_state(self.room_id)

    def get_public_state(self, viewer_token: Optional[str] = None) -> RoomStateSnapshot:
        """Serialize state for the specific viewer."""
        viewer_seat_id = self.get_seat_for_token(viewer_token) if viewer_token else None
        is_host = bool(viewer_token and viewer_token == self.host_token)
        
        env_state = self.env.state()
        history = env_state["history"]
        
        current_trick = env_state["current_trick"]
        completed_trick = self.completed_trick_for_display or env_state["completed_trick"]
        trick_winner_display = (
            self.trick_winner_for_display
            if self.trick_winner_for_display is not None
            else env_state["trick_winner_display"]
        )
        trick_number = min(8, len(history) // 4)
        
        hand_counts = []
        for i in range(4):
            hand_counts.append(len(self.env.hands[i]) if self.env.hands else 0)

        # Viewer specifics
        viewer_hand = None
        action_mask = None
        
        current_turn_player = None
        if self.phase == "playing" and not self.env._terminated:
            current_turn_agent = self.env.agent_selection
            current_turn_player = self.env.agents.index(current_turn_agent)
            
            if viewer_seat_id == current_turn_player:
                action_mask = self.env._action_mask(viewer_seat_id)

        if viewer_seat_id is not None and self.env.hands:
            viewer_hand = list(self.env.hands[viewer_seat_id])

        # Figure out internal sub-phases to map to UI
        display_phase = self.phase
        if self.phase == "playing":
            if self.env.stage == "trump":
                display_phase = "declare_trump"

        winner_team = self.match_winner_team if self.phase == "finished" else None

        public_seats = []
        for seat in self.seats:
            public_seats.append(
                SeatModel(
                    seat_id=seat.seat_id,
                    type=seat.type,
                    display_name=seat.display_name,
                    avatar_id=seat.avatar_id,
                    peer_id=seat.peer_id,
                    is_viewer=seat.seat_id == viewer_seat_id,
                    bot_difficulty=seat.bot_difficulty,
                    is_muted=seat.is_muted,
                    is_deafened=seat.is_deafened,
                    is_disconnected=seat.is_disconnected,
                )
            )

        return RoomStateSnapshot(
            room_id=self.room_id,
            is_host=is_host,
            seats=public_seats,
            phase=display_phase,
            viewer_seat_id=viewer_seat_id,
            viewer_hand=viewer_hand,
            action_mask=action_mask,
            hand_counts=hand_counts,
            trump_suit=self.env.trump_suit,
            lead_suit=self.env.lead_suit,
            current_trick=current_trick,
            completed_trick=completed_trick if completed_trick else None,
            trick_winner_display=trick_winner_display,
            current_turn_player=current_turn_player,
            hand_number=self.hand_number,
            trick_number=trick_number,
            tricks_won=self.env.tricks_won,
            scores=self.match_scores,
            winner_team=winner_team,
            last_hand_result=self.last_hand_result_for_display
        )

    def _clear_completed_trick_display(self):
        self.completed_trick_for_display = None
        self.trick_winner_for_display = None

    def _capture_completed_trick_display(self):
        if self.env.last_completed_trick:
            self.completed_trick_for_display = list(self.env.last_completed_trick)
            self.trick_winner_for_display = self.env.last_trick_winner

    def _score_completed_hand(self) -> Tuple[Optional[int], int, bool]:
        trump_team = rules.team_for_player(self.env.trump_declarer)
        other_team = 1 - trump_team
        trump_tricks = self.env.tricks_won[trump_team]
        other_tricks = self.env.tricks_won[other_team]

        if trump_tricks == other_tricks:
            self.pending_tie_bonus = True
            return None, 0, True

        if trump_tricks > other_tricks:
            scoring_team = trump_team
        else:
            scoring_team = other_team

        points = 2 if self.pending_tie_bonus or scoring_team == other_team else 1

        scores = list(self.match_scores)
        scores[scoring_team] += points
        self.match_scores = (scores[0], scores[1])
        self.pending_tie_bonus = False
        return scoring_team, points, False

    def _handle_completed_hand(self):
        if not self.env._terminated:
            return

        completed_hand_number = self.hand_number
        completed_tricks_won = self.env.tricks_won
        winner_team = rules.compute_winner(completed_tricks_won)
        self.hand_history.append({
            "trump_declarer": self.env.trump_declarer,
            "trump_suit": self.env.trump_suit,
            "tricks_won": completed_tricks_won,
            "history": list(self.env.history),
        })
        scoring_team, points_awarded, was_tie = self._score_completed_hand()
        self.last_hand_result_for_display = HandResultModel(
            hand_number=completed_hand_number,
            winner_team=None if winner_team == -1 else winner_team,
            scoring_team=scoring_team,
            points_awarded=points_awarded,
            tricks_won=completed_tricks_won,
            was_tie=was_tie,
        )

        if max(self.match_scores) >= self.MATCH_TARGET:
            self.phase = "finished"
            self.match_winner_team = 0 if self.match_scores[0] > self.match_scores[1] else 1
            self.save_game_history(status="finished")
            return

        self.save_game_history(status="in_progress")
        self.hand_number += 1
        self.env.reset(seed=secrets.randbits(32))

    def save_game_history(self, status: str = "in_progress"):
        from app.db.database import SessionLocal
        from app.db import models
        winner_team = self.match_winner_team
        
        env_state = self.env.state()
        game_log_data = {
            "room_id": self.room_id,
            "status": status,
            "seed": getattr(self.env, "_seed", None),
            "players": [
                {
                    "seat_id": seat.seat_id,
                    "display_name": seat.display_name,
                    "type": seat.type,
                    "team": seat.seat_id % 2,
                }
                for seat in self.seats
            ],
            "hands": self.hand_history,
            "current_hand": env_state.get("history", []),
            "match_scores": self.match_scores,
            "pending_tie_bonus": self.pending_tie_bonus,
            "phase": self.phase,
            "hand_number": self.hand_number,
        }
        game_log = json.dumps(game_log_data)
        
        db = SessionLocal()
        try:
            for seat in self.seats:
                if seat.type == "human" and getattr(seat, "user_id", None) is not None:
                    team = seat.seat_id % 2
                    us = self.match_scores[team]
                    them = self.match_scores[1 - team]
                    if status != "finished":
                        player_status = "in_progress"
                    elif winner_team is None:
                        player_status = "tie"
                    elif winner_team == team:
                        player_status = "win"
                    else:
                        player_status = "loss"

                    history = (
                        db.query(models.GameHistory)
                        .filter(
                            models.GameHistory.user_id == seat.user_id,
                            models.GameHistory.room_id == self.room_id,
                        )
                        .one_or_none()
                    )
                    if history is None:
                        history = models.GameHistory(
                            user_id=seat.user_id,
                            room_id=self.room_id,
                            score_us=us,
                            score_them=them,
                            status=player_status,
                            game_log=game_log
                        )
                        db.add(history)
                    else:
                        history.score_us = us
                        history.score_them = them
                        history.status = player_status
                        history.game_log = game_log
            db.commit()
        except Exception as e:
            logger.error(f"Failed to save history: {e}")
        finally:
            db.close()

    def start_game(self):
        """Host initiated start."""
        if self.phase != "lobby" and self.phase != "finished":
            raise ValueError("Game already in progress")
        
        # Ensure all seats are human or bot
        for seat in self.seats:
            if seat.type == "open":
                seat.type = "bot"
                seat.bot_difficulty = "easy"
                seat.display_name = f"Bot {seat.seat_id+1}"
                seat.is_muted = False
                seat.is_deafened = False
                
        self.phase = "playing"
        self.match_scores = (0, 0)
        self.match_winner_team = None
        self.pending_tie_bonus = False
        self.hand_history = []
        self.hand_number = 1
        self._clear_completed_trick_display()
        self.last_hand_result_for_display = None
        self.env.start_player = 0
        self.env.reset(seed=secrets.randbits(32))
        self.save_game_history(status="in_progress")
        self.check_bot_turn()

    async def process_action(self, token: str, action: int):
        """Process manual human action."""
        async with self._lock:
            self.update_activity()
            if self.phase != "playing" or self.env._terminated:
                raise ValueError("Game is not active")

            seat_id = self.get_seat_for_token(token)
            if seat_id is None:
                raise ValueError("Unauthorized")

            current_agent = self.env.agent_selection
            current_player = self.env.agents.index(current_agent)

            if seat_id != current_player:
                raise ValueError("Not your turn")

            mask = self.env._action_mask(seat_id)
            if action < 0 or action >= len(mask) or mask[action] == 0:
                raise ValueError("Illegal action")

            if self.env.stage == "trump" or self.env.current_trick == []:
                self._clear_completed_trick_display()

            was_trump_declaration = self.env.stage == "trump"
            self.env.step(action)
            if was_trump_declaration:
                self.last_hand_result_for_display = None
            self._capture_completed_trick_display()
            if self.env._terminated:
                self._handle_completed_hand()
            else:
                self.save_game_history(status="in_progress")
            if self.phase == "playing":
                if was_trump_declaration:
                    delay = self.ROUND_START_ANIMATION_DELAY_SECONDS
                elif self.completed_trick_for_display:
                    delay = self.TRICK_ANIMATION_DELAY_SECONDS
                else:
                    delay = self.BOT_MOVE_DELAY_SECONDS
                self.check_bot_turn(delay_seconds=delay)

    def check_bot_turn(self, delay_seconds: float = 0.0):
        """If it's a bot's turn, schedule a background task to play it."""
        if self.phase != "playing" or self.env._terminated:
            return
            
        current_agent = self.env.agent_selection
        current_player = self.env.agents.index(current_agent)
        
        seat = self.seats[current_player]
        if seat.type == "bot":
            if self.turn_task is not None and not self.turn_task.done():
                return # Already processing
                
            async def play_bot():
                completed_trick = False
                was_trump_declaration = False
                try:
                    if delay_seconds > 0:
                        await asyncio.sleep(delay_seconds)

                    if self.phase != "playing" or self.env._terminated:
                        return

                    # Compute action outside lock (read-only observation + inference)
                    obs_dict = self.env.observe(current_agent)
                    action = await bot_manager.get_action(obs_dict, seat.bot_difficulty or "easy")

                    async with self._lock:
                        # Re-check under lock: state may have changed during inference
                        if self.phase != "playing" or self.env._terminated:
                            return
                        if self.env.agent_selection != current_agent:
                            return

                        if self.env.stage == "trump" or self.env.current_trick == []:
                            self._clear_completed_trick_display()
                        was_trump_declaration = self.env.stage == "trump"
                        self.env.step(action)
                        if was_trump_declaration:
                            self.last_hand_result_for_display = None
                        self._capture_completed_trick_display()
                        completed_trick = self.completed_trick_for_display is not None
                        if self.env._terminated:
                            self._handle_completed_hand()
                        else:
                            self.save_game_history(status="in_progress")

                    from app.ws.connection import connection_manager
                    # Broadcast before scheduling the next bot so clients see completed tricks.
                    await connection_manager.broadcast_state(self.room_id)
                except Exception as e:
                    logger.error(f"Bot failed to play turn: {e}")
                finally:
                    # Clear task so next bot can proceed and then check again
                    self.turn_task = None
                    if self.phase == "playing" and not self.env._terminated:
                        if was_trump_declaration:
                            delay = self.ROUND_START_ANIMATION_DELAY_SECONDS
                        elif completed_trick:
                            delay = self.TRICK_ANIMATION_DELAY_SECONDS
                        else:
                            delay = self.BOT_MOVE_DELAY_SECONDS
                        self.check_bot_turn(delay_seconds=delay)
            
            self.turn_task = asyncio.create_task(play_bot())

class RoomManager:
    def __init__(self):
        self.rooms: Dict[str, RoomState] = {}
        self.room_ttl = timedelta(minutes=5)
        
    def create_room(self, host_name: str, user_id: Optional[str] = None, avatar_id: Optional[str] = None) -> Tuple[RoomState, str]:
        self.cleanup_inactive_rooms()
        room_id = str(uuid.uuid4())[:8].upper()
        host_token = str(uuid.uuid4())

        room = RoomState(room_id, host_token)
        room.join_human(host_token, host_name, user_id=user_id, avatar_id=avatar_id)
        
        self.rooms[room_id] = room
        return room, host_token

    def get_room(self, room_id: str) -> Optional[RoomState]:
        return self.rooms.get(room_id.upper())

    def get_peer_id(self, room_id: str, token: str) -> Optional[str]:
        room = self.get_room(room_id)
        if not room:
            return None
        seat_id = room.get_seat_for_token(token)
        if seat_id is None:
            return None
        return room.seats[seat_id].peer_id

    def cleanup_inactive_rooms(self):
        now = datetime.now(timezone.utc)
        expired = [
            room_id for room_id, room in self.rooms.items()
            if now - room.last_active > self.room_ttl
        ]
        for room_id in expired:
            room = self.rooms.pop(room_id, None)
            if room and room.turn_task and not room.turn_task.done():
                room.turn_task.cancel()

room_manager = RoomManager()
