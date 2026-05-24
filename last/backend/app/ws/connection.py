import json
from typing import Dict, List, Optional
from fastapi import WebSocket
import logging

logger = logging.getLogger(__name__)

class ConnectionManager:
    def __init__(self):
        # room_id  list of active connections
        self.active_connections: Dict[str, List[WebSocket]] = {}
        # we can also store tokens per connection if needed
        self.connection_tokens: Dict[WebSocket, str] = {}

    def register(self, websocket: WebSocket, room_id: str, token: str):
        #register an already accepted WebSocket
        if room_id not in self.active_connections:
            self.active_connections[room_id] = []
        self.active_connections[room_id].append(websocket)
        self.connection_tokens[websocket] = token

    async def connect(self, websocket: WebSocket, room_id: str, token: str):
        await websocket.accept()
        self.register(websocket, room_id, token)
        
    def disconnect(self, websocket: WebSocket, room_id: str):
        if room_id in self.active_connections:
            try:
                self.active_connections[room_id].remove(websocket)
            except ValueError:
                pass
            if not self.active_connections[room_id]:
                del self.active_connections[room_id]
        if websocket in self.connection_tokens:
            del self.connection_tokens[websocket]

    async def send_personal_message(self, message: str, websocket: WebSocket):
        await websocket.send_text(message)

    async def broadcast_state(self, room_id: str):
        #Broadcasts the current RoomState to all connected clients in a room.
        from app.game.room_manager import room_manager
        
        room = room_manager.get_room(room_id)
        if not room:
            return
            
        if room_id not in self.active_connections:
            return
            
        for connection in list(self.active_connections[room_id]):
            raw_token = self.connection_tokens.get(connection)
            viewer_token = raw_token if raw_token else None

            try:
                state_snapshot = room.get_public_state(viewer_token=viewer_token)
                message = {
                    "type": "snapshot",
                    "payload": state_snapshot.model_dump()
                }
                await connection.send_text(json.dumps(message))
            except Exception as e:
                logger.error(f"Error broadcasting to client: {e}")

    async def broadcast_message(self, message: str, room_id: str, exclude_websocket: Optional[WebSocket] = None):
        if room_id in self.active_connections:
            for connection in list(self.active_connections[room_id]):
                if connection != exclude_websocket:
                    try:
                        await connection.send_text(message)
                    except Exception as e:
                        logger.error(f"Error broadcasting raw message: {e}")

    async def send_to_peer(self, room_id: str, target_peer_id: str, message: str) -> bool:
        from app.game.room_manager import room_manager

        if room_id not in self.active_connections:
            return False

        for connection in list(self.active_connections[room_id]):
            token = self.connection_tokens.get(connection)
            if not token:
                continue

            peer_id = room_manager.get_peer_id(room_id, token)
            if peer_id != target_peer_id:
                continue

            try:
                await connection.send_text(message)
                return True
            except Exception as e:
                logger.error(f"Error sending targeted message to peer {target_peer_id}: {e}")
                return False

        return False

connection_manager = ConnectionManager()
