import asyncio
import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.ws.connection import connection_manager
from app.game.room_manager import room_manager

logger = logging.getLogger(__name__)
router = APIRouter()

@router.websocket("/ws/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str):
    room = room_manager.get_room(room_id)
    if not room:
        await websocket.close(code=4004)
        return

    # Accept first so we can exchange messages for the auth handshake
    await websocket.accept()

    # First message must be {type: "auth", token: "..."} — 5 s timeout
    try:
        raw = await asyncio.wait_for(websocket.receive_text(), timeout=5.0)
        auth_msg = json.loads(raw)
    except (asyncio.TimeoutError, json.JSONDecodeError):
        await websocket.close(code=4001)
        return

    if auth_msg.get("type") != "auth":
        await websocket.close(code=4001)
        return

    token: str | None = auth_msg.get("token") or None

    if token is not None:
        has_seat = room.get_seat_for_token(token) is not None
        is_displaced = any(d["token"] == token for d in room._displaced_humans.values())
        if not has_seat and not is_displaced:
            await websocket.close(code=4001)
            return

    connection_manager.register(websocket, room_id, token or "")

    # Notify room: handles "reconnect within 10 s" and "restore after bot takeover"
    if token is not None:
        await room.on_player_reconnect(token)

    try:
        # Send initial state snapshot on connect
        state = room.get_public_state(viewer_token=token)
        await connection_manager.send_personal_message(
            json.dumps({"type": "snapshot", "payload": state.model_dump()}),
            websocket
        )

        # Listen for actions
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)

                if msg.get("type") == "action":
                    action = msg.get("action")
                    if not isinstance(action, int) or isinstance(action, bool):
                        await connection_manager.send_personal_message(
                            json.dumps({"type": "error", "message": "Invalid action"}),
                            websocket
                        )
                    elif token is not None:
                        try:
                            await room.process_action(token, action)
                            await connection_manager.broadcast_state(room_id)
                        except ValueError as ve:
                            await connection_manager.send_personal_message(
                                json.dumps({"type": "error", "message": str(ve)}),
                                websocket
                            )
                        except Exception:
                            logger.exception("Unexpected error processing action in room %s", room_id)
                            await connection_manager.send_personal_message(
                                json.dumps({"type": "error", "message": "Internal server error"}),
                                websocket
                            )
                elif msg.get("type") == "audio_status" and token is not None:
                    raw_muted = msg.get("muted")
                    raw_deafened = msg.get("deafened")
                    if (raw_muted is not None and not isinstance(raw_muted, bool)) or \
                       (raw_deafened is not None and not isinstance(raw_deafened, bool)):
                        await connection_manager.send_personal_message(
                            json.dumps({"type": "error", "message": "Invalid audio status"}),
                            websocket
                        )
                    else:
                        try:
                            room.update_audio_status(token, muted=raw_muted, deafened=raw_deafened)
                            await connection_manager.broadcast_state(room_id)
                        except ValueError as ve:
                            await connection_manager.send_personal_message(
                                json.dumps({"type": "error", "message": str(ve)}),
                                websocket
                            )
                elif msg.get("type") in ["webrtc_offer", "webrtc_answer", "webrtc_ice_candidate"]:
                    target_peer_id = msg.get("target_peer_id")
                    sender_peer_id = room_manager.get_peer_id(room_id, token or "")
                    if sender_peer_id and target_peer_id:
                        msg["sender_peer_id"] = sender_peer_id
                        await connection_manager.send_to_peer(
                            room_id,
                            target_peer_id,
                            json.dumps(msg),
                        )
            except json.JSONDecodeError:
                pass

    except WebSocketDisconnect:
        connection_manager.disconnect(websocket, room_id)
        if token is not None:
            await room.on_player_disconnect(token)
