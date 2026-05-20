import os
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from dotenv import load_dotenv
load_dotenv()
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text
from app.api import routes as api_routes
from app.ws import sockets as ws_routes
from app.db.database import engine
from app.db import models
from app.api import auth
from app.game.room_manager import room_manager

models.Base.metadata.create_all(bind=engine)


def _ensure_schema_columns():
    inspector = inspect(engine)
    columns = {column["name"] for column in inspector.get_columns("game_history")}
    if "room_id" not in columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE game_history ADD COLUMN room_id VARCHAR"))


_ensure_schema_columns()


async def _periodic_room_cleanup():
    while True:
        await asyncio.sleep(60)  # every minute
        room_manager.cleanup_inactive_rooms()


@asynccontextmanager
async def lifespan(app: FastAPI):
    asyncio.create_task(_periodic_room_cleanup())
    yield

app = FastAPI(title="Omi Web Application API", lifespan=lifespan)

cors_origins = [
    origin.strip()
    for origin in os.environ.get("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_routes.router)
app.include_router(ws_routes.router)
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])

@app.get("/health")
def health_check():
    from sqlalchemy import text
    from app.db.database import SessionLocal
    try:
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
        db_status = "ok"
    except Exception:
        db_status = "error"
    status = "healthy" if db_status == "ok" else "degraded"
    return {"status": status, "db": db_status}
