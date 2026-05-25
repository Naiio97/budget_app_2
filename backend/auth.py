"""HS256 JWT auth — shared signing secret with the frontend Auth.js layer.

The frontend handles the OAuth handshake (Google/Apple), POSTs the resulting
claims to /auth/oauth-upsert, gets back a JWT, and includes it as
`Authorization: Bearer <token>` on every API call. `get_current_user` is the
FastAPI dependency that every protected endpoint will declare.
"""
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from passlib.context import CryptContext
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from database import get_db
from models import UserModel

JWT_ALGORITHM = "HS256"

# tokenUrl="auth/oauth-upsert" so /docs renders an Authorize button against the
# real OAuth flow — the swagger client doesn't drive it, just labels it.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/oauth-upsert", auto_error=True)

# Shared password hasher — argon2id is the 2026 default; bcrypt kept as fallback
# verifier in case any legacy hashes ever appear.
pwd_context = CryptContext(schemes=["argon2", "bcrypt"], deprecated="auto")

# Single shared limiter — main.py wires it onto app.state, routers import it
# to decorate endpoints with @limiter.limit("X/minute").
limiter = Limiter(key_func=get_remote_address)


def _require_secret() -> str:
    secret = get_settings().auth_secret
    if not secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Auth is not configured on the server (AUTH_SECRET missing)",
        )
    return secret


def create_access_token(*, user_id: int, email: str) -> str:
    settings = get_settings()
    secret = _require_secret()
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "email": email,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=settings.auth_jwt_ttl_hours)).timestamp()),
    }
    return jwt.encode(payload, secret, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict[str, Any]:
    secret = _require_secret()
    return jwt.decode(token, secret, algorithms=[JWT_ALGORITHM])


async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserModel:
    creds_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(token)
    except jwt.PyJWTError:
        raise creds_exception
    sub = payload.get("sub")
    if sub is None:
        raise creds_exception
    user = await db.get(UserModel, int(sub))
    if user is None or not user.is_active:
        raise creds_exception
    return user


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)
