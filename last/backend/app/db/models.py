from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func
from .database import Base


class GameHistory(Base):
    __tablename__ = "game_history"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, nullable=True, index=True)  # Supabase UUID
    room_id = Column(String, nullable=True, index=True)
    date = Column(DateTime(timezone=True), server_default=func.now())
    score_us = Column(Integer, nullable=False)
    score_them = Column(Integer, nullable=False)
    status = Column(String, nullable=False)  # "in_progress", "win", "loss", "tie"
    game_log = Column(String, nullable=True)
