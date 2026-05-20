from pydantic import BaseModel, field_validator
from typing import List, Optional, Tuple

_MAX_DISPLAY_NAME = 30

class SeatModel(BaseModel):
    seat_id: int
    type: str = "open" # "open", "human", "bot"
    display_name: Optional[str] = None
    token: Optional[str] = None
    peer_id: Optional[str] = None
    is_viewer: bool = False
    user_id: Optional[str] = None
    avatar_id: Optional[str] = None
    bot_difficulty: Optional[str] = None  # "easy", "medium", "hard"
    is_muted: bool = False
    is_deafened: bool = False
    is_disconnected: bool = False

class HandResultModel(BaseModel):
    hand_number: int
    winner_team: Optional[int] = None
    scoring_team: Optional[int] = None
    points_awarded: int = 0
    tricks_won: Tuple[int, int] = (0, 0)
    was_tie: bool = False

class RoomStateSnapshot(BaseModel):
    room_id: str
    is_host: bool = False
    seats: List[SeatModel]
    phase: str # "lobby", "deal4", "declare_trump", "deal_rest", "playing", "finished"
    
    # Viewer specific
    viewer_seat_id: Optional[int] = None
    viewer_hand: Optional[List[int]] = None
    action_mask: Optional[List[int]] = None

    # Public game state
    hand_counts: List[int] # [count_0, count_1, count_2, count_3]
    trump_suit: Optional[str] = None
    lead_suit: Optional[str] = None
    current_trick: List[Tuple[int, int]] # [(player_id, card_index)]
    completed_trick: Optional[List[Tuple[int, int]]] = None
    trick_winner_display: Optional[int] = None
    current_turn_player: Optional[int] = None
    hand_number: int = 0
    trick_number: int = 1
    tricks_won: Tuple[int, int] = (0, 0)
    scores: Tuple[int, int] = (0, 0)
    winner_team: Optional[int] = None  # 0 or 1
    last_hand_result: Optional[HandResultModel] = None

def _validate_display_name(v: str) -> str:
    v = v.strip()
    if len(v) < 1 or len(v) > _MAX_DISPLAY_NAME:
        raise ValueError(f"Display name must be 1–{_MAX_DISPLAY_NAME} characters")
    return v

class CreateRoomRequest(BaseModel):
    display_name: str
    auth_token: Optional[str] = None
    avatar_id: Optional[str] = None

    @field_validator("display_name")
    @classmethod
    def check_display_name(cls, v: str) -> str:
        return _validate_display_name(v)

class JoinRoomRequest(BaseModel):
    display_name: str
    room_id: str
    auth_token: Optional[str] = None
    avatar_id: Optional[str] = None

    @field_validator("display_name")
    @classmethod
    def check_display_name(cls, v: str) -> str:
        return _validate_display_name(v)

class ConfigureRoomRequest(BaseModel):
    seats: List[SeatModel]

class SwapSeatsRequest(BaseModel):
    seat1: int
    seat2: int

class AuthResponse(BaseModel):
    token: str
    room_id: str
    seat_id: Optional[int] = None

