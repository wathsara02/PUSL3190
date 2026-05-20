import os
import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.db import models
from app.core.security import verify_supabase_token
from typing import Optional

router = APIRouter()
_bearer = HTTPBearer(auto_error=False)


class RegisterRequest(BaseModel):
    email: str
    password: str


@router.post("/register")
async def register_user(body: RegisterRequest):
    supabase_url = os.environ.get("SUPABASE_URL", "")
    service_key = os.environ.get("SUPABASE_SERVICE_KEY", "")

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{supabase_url}/auth/v1/admin/users",
            headers={
                "Authorization": f"Bearer {service_key}",
                "apikey": service_key,
                "Content-Type": "application/json",
            },
            json={"email": body.email, "password": body.password, "email_confirm": True},
            timeout=10,
        )

    if resp.status_code in (200, 201):
        return {"message": "Account created"}

    data = resp.json()
    msg = data.get("msg") or data.get("message") or data.get("error_description") or "Registration failed"
    if resp.status_code == 422 or "already" in msg.lower():
        raise HTTPException(status_code=409, detail="An account with this email already exists. Log in instead.")
    raise HTTPException(status_code=400, detail=msg)


async def get_current_user_id(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> Optional[str]:
    if not credentials:
        return None
    return await verify_supabase_token(credentials.credentials)


@router.get("/history")
async def get_user_history(
    db: Session = Depends(get_db),
    user_id: Optional[str] = Depends(get_current_user_id),
    limit: int = 50,
    offset: int = 0,
):
    if not user_id:
        raise HTTPException(status_code=401, detail="Not logged in")
    limit = max(1, min(limit, 200))
    offset = max(0, offset)
    history = (
        db.query(models.GameHistory)
        .filter(models.GameHistory.user_id == user_id)
        .order_by(models.GameHistory.date.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return history
