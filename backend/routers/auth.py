"""Auth endpoints — OAuth upsert and current-user lookup.

Designed for Auth.js (NextAuth v5) on the frontend driving Google / Apple
OIDC. The handshake happens client-side; this router only mints the backend
JWT and provisions the user row.
"""
from datetime import datetime, timezone
from typing import Annotated, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import create_access_token, get_current_user, limiter
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

    user.last_login_at = datetime.now(timezone.utc)
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
