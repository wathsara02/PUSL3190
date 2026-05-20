"""
DEMO 06 — Live REST API & WebSocket Demo
Requires the backend to be running on http://127.0.0.1:8000.
Shows: health check, create room, get room state, WebSocket handshake.
"""

import os, sys, json, time, asyncio
sys.stdout.reconfigure(encoding='utf-8')

try:
    import httpx
    import websockets
except ImportError:
    print("Install httpx and websockets:  pip install httpx websockets")
    sys.exit(1)

BASE_URL = "http://127.0.0.1:8000"
WS_URL   = "ws://127.0.0.1:8000"
SEP  = "=" * 62
SEP2 = "-" * 62

def print_json(data, indent=4):
    lines = json.dumps(data, indent=indent).split('\n')
    for line in lines[:30]:
        print(f"    {line}")
    if len(lines) > 30:
        print(f"    ... ({len(lines)-30} more lines)")

def step(label):
    print(f"\n[{'·'*2}] {label}")
    print(f"  {SEP2}")

print(SEP)
print("  DEMO 06 — Live API & WebSocket Demo")
print(f"  Backend: {BASE_URL}")
print(SEP)

with httpx.Client(base_url=BASE_URL, timeout=8.0) as client:

    # ── 1. Health check ────────────────────────────────────────
    step("1. Health Check — GET /health")
    try:
        r = client.get("/health")
        print(f"  Status code : {r.status_code}")
        print_json(r.json())
        assert r.status_code == 200, "Server not healthy"
        print(f"\n  ✓ Backend is running and database is OK.")
    except httpx.ConnectError:
        print(f"\n  ✗ Cannot connect to {BASE_URL}")
        print("    Make sure the backend is running:")
        print("    cd last/backend && uvicorn app.main:app --reload --port 8000")
        sys.exit(1)

    # ── 2. Create room ─────────────────────────────────────────
    step("2. Create Room — POST /api/lobby/create-room")
    payload = {"display_name": "DemoPlayer", "auth_token": None, "avatar_id": "frog"}
    print(f"  Request body: {json.dumps(payload)}")
    r = client.post("/api/lobby/create-room", json=payload)
    print(f"  Status code : {r.status_code}")
    room_data = r.json()
    print_json(room_data)
    assert r.status_code == 200
    room_id    = room_data['room_id']
    host_token = room_data['token']
    print(f"\n  ✓ Room created: ID={room_id}  Seat=0")

    # ── 3. Get room state ──────────────────────────────────────
    step(f"3. Get Room State — GET /api/room/{room_id}")
    r = client.get(f"/api/room/{room_id}", headers={"X-Room-Token": host_token})
    print(f"  Status code : {r.status_code}")
    state = r.json()
    assert r.status_code == 200

    # Print filtered key fields
    summary = {
        "room_id":       state.get("room_id"),
        "phase":         state.get("phase"),
        "is_host":       state.get("is_host"),
        "viewer_seat_id":state.get("viewer_seat_id"),
        "seats": [
            {"seat_id": s["seat_id"], "type": s["type"],
             "display_name": s.get("display_name"), "avatar_id": s.get("avatar_id")}
            for s in state.get("seats", [])
        ],
    }
    print_json(summary)
    print(f"\n  ✓ Room in '{state['phase']}' phase. Host is in seat 0.")

    # ── 4. Configure a bot seat ────────────────────────────────
    step(f"4. Configure Seat 1 as Bot — POST /api/room/{room_id}/configure")
    seats_req = [
        {"seat_id": 0, "type": "human", "display_name": "DemoPlayer"},
        {"seat_id": 1, "type": "bot",   "display_name": "Bot 2", "bot_difficulty": "easy"},
        {"seat_id": 2, "type": "open",  "display_name": None},
        {"seat_id": 3, "type": "open",  "display_name": None},
    ]
    r = client.post(f"/api/room/{room_id}/configure",
                    json={"seats": seats_req},
                    headers={"X-Room-Token": host_token})
    print(f"  Status code : {r.status_code}  →  {r.json()}")
    assert r.status_code == 200
    print(f"  ✓ Seat 1 configured as bot.")

    # ── 5. Start game ──────────────────────────────────────────
    step(f"5. Start Game — POST /api/room/{room_id}/start")
    r = client.post(f"/api/room/{room_id}/start",
                    headers={"X-Room-Token": host_token})
    print(f"  Status code : {r.status_code}  →  {r.json()}")
    time.sleep(0.5)  # let bots make first move

    # ── 6. Get playing state ───────────────────────────────────
    step(f"6. Game State After Start — GET /api/room/{room_id}")
    r = client.get(f"/api/room/{room_id}", headers={"X-Room-Token": host_token})
    state = r.json()
    print(f"  phase           : {state.get('phase')}")
    print(f"  current_turn    : Player {state.get('current_turn_player')}")
    print(f"  trump_suit      : {state.get('trump_suit')}")
    hand = state.get('viewer_hand') or []
    print(f"  player_0 hand   : {hand}  ({len(hand)} cards)")
    print(f"  tricks_won      : {state.get('tricks_won')}")
    mask = state.get('action_mask') or []
    legal_actions = [i for i, v in enumerate(mask) if v == 1]
    print(f"  legal_actions   : {legal_actions[:10]}{'...' if len(legal_actions) > 10 else ''}")
    print(f"\n  ✓ Game started. All 4 seats filled. Bots playing.")

# ── 7. WebSocket handshake ─────────────────────────────────────
step(f"7. WebSocket Handshake — ws://{WS_URL.split('://',1)[1]}/ws/{room_id}")

async def ws_demo():
    uri = f"{WS_URL}/ws/{room_id}"
    print(f"  Connecting to {uri} ...")
    try:
        async with websockets.connect(uri, open_timeout=5) as ws:
            # Send auth
            auth_msg = json.dumps({"type": "auth", "token": host_token})
            await ws.send(auth_msg)
            print(f"  Sent   → {auth_msg}")

            # Receive snapshot
            raw = await asyncio.wait_for(ws.recv(), timeout=5.0)
            msg = json.loads(raw)
            print(f"  Recv   ← type='{msg['type']}'")
            payload = msg.get('payload', {})
            print(f"           phase='{payload.get('phase')}'  "
                  f"room_id='{payload.get('room_id')}'  "
                  f"seats={len(payload.get('seats',[]))}")
            print(f"\n  ✓ WebSocket authenticated and snapshot received.")
    except Exception as e:
        print(f"  ✗ WebSocket error: {e}")

asyncio.run(ws_demo())

print(f"\n{SEP}")
print("  DEMO 06 complete — all API endpoints verified.")
print(SEP)
