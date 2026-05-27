"""Auth endpoints — OAuth upsert and current-user lookup.

Designed for Auth.js (NextAuth v5) on the frontend driving Google / Apple
OIDC. The handshake happens client-side; this router only mints the backend
JWT and provisions the user row.
"""
from datetime import datetime
from typing import Annotated, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import create_access_token, get_current_user, hash_password, limiter, verify_password
from config import get_settings
from database import get_db
from models import UserModel

router = APIRouter()


class OAuthUpsertRequest(BaseModel):
    provider: Literal["google", "apple"]
    provider_id: str  # OAuth subject claim ("sub")
    email: EmailStr
    name: Optional[str] = None
    image_url: Optional[str] = None


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


MIN_PASSWORD_LEN = 8
# Same generic message for both wrong email AND wrong password so we don't
# leak which accounts exist via timing or response text.
INVALID_CREDENTIALS_MESSAGE = "Invalid email or password"


class UserPublic(BaseModel):
    id: int
    email: str
    name: Optional[str]
    image_url: Optional[str]
    provider: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    user: UserPublic


@router.post("/oauth-upsert", response_model=TokenResponse)
@limiter.limit("10/minute")
async def oauth_upsert(
    request: Request,
    body: OAuthUpsertRequest,
    db: AsyncSession = Depends(get_db),
):
    """Called by the frontend after a successful OAuth handshake.

    Lookup order:
      1. (provider, provider_id) — repeat logins
      2. email — adopts the bootstrap user / cross-provider account linking
      3. create new

    Trust model: this endpoint trusts the FE that it actually verified the
    OAuth handshake. The hardened variant (next iteration) forwards the OAuth
    ID token and the backend verifies against Google/Apple JWKS directly.
    """
    settings = get_settings()
    if body.provider not in settings.auth_allowed_oauth_providers:
        raise HTTPException(status_code=403, detail=f"Provider '{body.provider}' is not enabled")

    result = await db.execute(
        select(UserModel).where(
            UserModel.provider == body.provider,
            UserModel.provider_id == body.provider_id,
        )
    )
    user = result.scalar_one_or_none()

    if user is None:
        result = await db.execute(select(UserModel).where(UserModel.email == body.email))
        user = result.scalar_one_or_none()
        if user is not None:
            user.provider = body.provider
            user.provider_id = body.provider_id
            if body.name and not user.name:
                user.name = body.name
            if body.image_url:
                user.image_url = body.image_url

    if user is None:
        user = UserModel(
            email=body.email,
            name=body.name,
            image_url=body.image_url,
            provider=body.provider,
            provider_id=body.provider_id,
            is_active=True,
        )
        db.add(user)
        await db.flush()

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled")

    user.last_login_at = datetime.utcnow()
    await db.commit()
    await db.refresh(user)

    token = create_access_token(user_id=user.id, email=user.email)
    return TokenResponse(
        access_token=token,
        user=UserPublic(
            id=user.id,
            email=user.email,
            name=user.name,
            image_url=user.image_url,
            provider=user.provider,
        ),
    )


@router.post("/register", response_model=TokenResponse)
@limiter.limit("20/hour")
async def register(
    request: Request,
    body: RegisterRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create a new account with email + password. Returns a JWT so the user
    is immediately logged in without a second round-trip.

    Adopts the bootstrap user if its email matches (so the bootstrap row
    becomes the real account on first registration). Otherwise rejects
    duplicate emails to prevent silent overwrites.
    """
    if len(body.password) < MIN_PASSWORD_LEN:
        raise HTTPException(
            status_code=400,
            detail=f"Password must be at least {MIN_PASSWORD_LEN} characters",
        )

    result = await db.execute(select(UserModel).where(UserModel.email == body.email))
    existing = result.scalar_one_or_none()

    if existing is not None:
        # Adopt the bootstrap user (provider='email', no password_hash) on its
        # first real registration. Any other case = email taken.
        if existing.password_hash is None and existing.provider == "email":
            user = existing
            user.password_hash = hash_password(body.password)
            if body.name and not user.name:
                user.name = body.name
        else:
            raise HTTPException(status_code=409, detail="Email already registered")
    else:
        user = UserModel(
            email=body.email,
            name=body.name,
            provider="email",
            password_hash=hash_password(body.password),
            is_active=True,
        )
        db.add(user)
        await db.flush()

    user.last_login_at = datetime.utcnow()
    await db.commit()
    await db.refresh(user)

    token = create_access_token(user_id=user.id, email=user.email)
    return TokenResponse(
        access_token=token,
        user=UserPublic(
            id=user.id,
            email=user.email,
            name=user.name,
            image_url=user.image_url,
            provider=user.provider,
        ),
    )


@router.post("/login", response_model=TokenResponse)
@limiter.limit("30/minute")
async def login(
    request: Request,
    body: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """Email + password login. Returns a JWT (same shape as /oauth-upsert)."""
    result = await db.execute(select(UserModel).where(UserModel.email == body.email))
    user = result.scalar_one_or_none()

    if user is None or not user.password_hash:
        raise HTTPException(status_code=401, detail=INVALID_CREDENTIALS_MESSAGE)
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail=INVALID_CREDENTIALS_MESSAGE)
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled")

    user.last_login_at = datetime.utcnow()
    await db.commit()
    await db.refresh(user)

    token = create_access_token(user_id=user.id, email=user.email)
    return TokenResponse(
        access_token=token,
        user=UserPublic(
            id=user.id,
            email=user.email,
            name=user.name,
            image_url=user.image_url,
            provider=user.provider,
        ),
    )


@router.get("/me", response_model=UserPublic)
async def me(current_user: Annotated[UserModel, Depends(get_current_user)]):
    return UserPublic(
        id=current_user.id,
        email=current_user.email,
        name=current_user.name,
        image_url=current_user.image_url,
        provider=current_user.provider,
    )
