"""Authentication routes — Google OAuth + Demo Login."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from jose import jwt
from pydantic import BaseModel
import httpx
import os
from datetime import datetime, timedelta, timezone

from database.connection import get_db
from models.user import User
from schemas.schemas import GoogleAuthRequest, AuthResponse, UserResponse

router = APIRouter(prefix="/auth", tags=["Authentication"])

JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24


def create_access_token(user_id: str) -> str:
    """Create a JWT access token."""
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def verify_access_token(token: str) -> str:
    """Verify JWT and return user_id."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload["sub"]
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


# ─── Demo Login (No Google OAuth needed) ──────────────────────
class DemoLoginRequest(BaseModel):
    name: str
    email: str


@router.post("/demo", response_model=AuthResponse)
async def demo_login(request: DemoLoginRequest, db: AsyncSession = Depends(get_db)):
    """Demo login — creates or finds a user without Google OAuth."""
    email = request.email.strip().lower()
    name = request.name.strip()

    if not email or not name:
        raise HTTPException(status_code=400, detail="Name and email are required")

    # Find or create user
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if not user:
        user = User(
            email=email,
            name=name,
            profile_picture=None,
        )
        db.add(user)
        await db.flush()

    access_token = create_access_token(user.id)

    return AuthResponse(
        access_token=access_token,
        user=UserResponse.model_validate(user),
    )


# ─── Google OAuth Login ───────────────────────────────────────
@router.post("/google", response_model=AuthResponse)
async def google_auth(request: GoogleAuthRequest, db: AsyncSession = Depends(get_db)):
    """Authenticate user with Google OAuth token."""
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://www.googleapis.com/oauth2/v3/userinfo",
                headers={"Authorization": f"Bearer {request.token}"}
            )
            if resp.status_code != 200:
                raise HTTPException(status_code=401, detail="Invalid Google token")
            google_user = resp.json()
    except httpx.RequestError:
        raise HTTPException(status_code=503, detail="Could not verify Google token")

    email = google_user.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="Email not provided by Google")

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if not user:
        user = User(
            email=email,
            name=google_user.get("name", email.split("@")[0]),
            profile_picture=google_user.get("picture"),
        )
        db.add(user)
        await db.flush()

    access_token = create_access_token(user.id)

    return AuthResponse(
        access_token=access_token,
        user=UserResponse.model_validate(user),
    )
