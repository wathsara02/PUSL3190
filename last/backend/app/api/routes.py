from fastapi import APIRouter, HTTPException, Header
from typing import Optional

_VALID_DIFFICULTIES = {"easy", "medium", "hard"}

from app.models.schemas import (
    CreateRoomRequest,
    JoinRoomRequest,
    ConfigureRoomRequest,
    SwapSeatsRequest,
    AuthResponse,
    RoomStateSnapshot,
)
from app.game.room_manager import room_manager
from app.ws.connection import connection_manager
from app.core.security import verify_supabase_token

router = APIRouter()


@router.post("/api/lobby/create-room", response_model=AuthResponse)
async def create_room(req: CreateRoomRequest):
    user_id = await verify_supabase_token(req.auth_token) if req.auth_token else None
    room, host_token = room_manager.create_room(req.display_name, user_id=user_id, avatar_id=req.avatar_id)
    return AuthResponse(token=host_token, room_id=room.room_id, seat_id=0)


@router.post("/api/lobby/join-room", response_model=AuthResponse)
async def join_room(req: JoinRoomRequest):
    import uuid
    room = room_manager.get_room(req.room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    token = str(uuid.uuid4())
    user_id = await verify_supabase_token(req.auth_token) if req.auth_token else None
    success = room.join_human(token, req.display_name, user_id=user_id, avatar_id=req.avatar_id)

    if not success:
        raise HTTPException(status_code=400, detail="Room is full")

    seat_id = room.get_seat_for_token(token)
    await connection_manager.broadcast_state(room.room_id)
    return AuthResponse(token=token, room_id=room.room_id, seat_id=seat_id)


@router.get("/api/room/{room_id}", response_model=RoomStateSnapshot)
async def get_room(
    room_id: str,
    x_room_token: Optional[str] = Header(default=None),
):
    room = room_manager.get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    return room.get_public_state(viewer_token=x_room_token)


@router.post("/api/room/{room_id}/configure")
async def configure_room(
    room_id: str,
    req: ConfigureRoomRequest,
    x_room_token: str = Header(...),
):
    room = room_manager.get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    if room.host_token != x_room_token:
        raise HTTPException(status_code=403, detail="Only host can configure room")
    if room.phase not in ("lobby", "finished"):
        raise HTTPException(status_code=400, detail="Cannot configure during active game")
    if len(req.seats) != 4:
        raise HTTPException(status_code=400, detail="Must provide exactly 4 seats")

    for i, req_seat in enumerate(req.seats):
        if req_seat.seat_id != i:
            continue
        if room.seats[i].type == "human" and req_seat.type != "human":
            continue
        if room.seats[i].type != "human":
            room.seats[i].type = req_seat.type
            if req_seat.type == "bot":
                difficulty = req_seat.bot_difficulty or "easy"
                if difficulty not in _VALID_DIFFICULTIES:
                    raise HTTPException(status_code=400, detail=f"Invalid bot difficulty '{difficulty}'")
                room.seats[i].bot_difficulty = difficulty
                room.seats[i].display_name = req_seat.display_name or f"Bot {i + 1}"
            elif req_seat.type == "open":
                room.seats[i].bot_difficulty = None
                room.seats[i].display_name = None

    await connection_manager.broadcast_state(room.room_id)
    return {"status": "ok"}


@router.post("/api/room/{room_id}/swap-seats")
async def swap_seats(
    room_id: str,
    req: SwapSeatsRequest,
    x_room_token: str = Header(...),
):
    room = room_manager.get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    if room.host_token != x_room_token:
        raise HTTPException(status_code=403, detail="Only host can swap seats")
    try:
        room.swap_seats(req.seat1, req.seat2)
        await connection_manager.broadcast_state(room.room_id)
        return {"status": "ok"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/api/room/{room_id}/start")
async def start_game(
    room_id: str,
    x_room_token: str = Header(...),
):
    room = room_manager.get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    if room.host_token != x_room_token:
        raise HTTPException(status_code=403, detail="Only host can start game")
    try:
        room.start_game()
        await connection_manager.broadcast_state(room.room_id)
        return {"status": "ok"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
