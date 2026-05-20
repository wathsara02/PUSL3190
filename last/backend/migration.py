"""
One-off migration: adds missing columns to an existing game_history table.
Safe to run multiple times - skips columns that already exist.

Usage:
    python migration.py
"""

from sqlalchemy import inspect, text

from app.db.database import engine

MISSING_COLUMNS = {
    "game_log": "ALTER TABLE game_history ADD COLUMN game_log TEXT;",
    "room_id": "ALTER TABLE game_history ADD COLUMN room_id VARCHAR;",
}

with engine.connect() as conn:
    existing = {column["name"] for column in inspect(engine).get_columns("game_history")}
    for name, statement in MISSING_COLUMNS.items():
        if name in existing:
            print(f"Skipped: {name} already exists.")
            continue
        conn.execute(text(statement))
        print(f"Migration successful: added {name} column to game_history.")
    conn.commit()
