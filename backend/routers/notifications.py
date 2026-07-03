"""Web Push odběry a testovací notifikace."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from config import get_settings
from database import get_db
from models import PushSubscriptionModel, UserModel
from services.push import is_configured, send_push_to_user

router = APIRouter()
settings = get_settings()


class SubscriptionKeys(BaseModel):
    p256dh: str
    auth: str


class SubscriptionRequest(BaseModel):
    endpoint: str
    keys: SubscriptionKeys


class UnsubscribeRequest(BaseModel):
    endpoint: str


@router.get("/vapid-public-key")
async def get_vapid_public_key(
    current_user: UserModel = Depends(get_current_user),
):
    if not is_configured():
        raise HTTPException(status_code=503, detail="Push notifications are not configured")
    return {"key": settings.vapid_public_key}


@router.post("/subscribe")
async def subscribe(
    request: SubscriptionRequest,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not is_configured():
        raise HTTPException(status_code=503, detail="Push notifications are not configured")

    existing = await db.execute(
        select(PushSubscriptionModel).where(PushSubscriptionModel.endpoint == request.endpoint)
    )
    sub = existing.scalar_one_or_none()
    if sub:
        sub.user_id = current_user.id
        sub.p256dh = request.keys.p256dh
        sub.auth = request.keys.auth
    else:
        db.add(PushSubscriptionModel(
            user_id=current_user.id,
            endpoint=request.endpoint,
            p256dh=request.keys.p256dh,
            auth=request.keys.auth,
        ))
    await db.commit()
    return {"status": "subscribed"}


@router.post("/unsubscribe")
async def unsubscribe(
    request: UnsubscribeRequest,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        delete(PushSubscriptionModel).where(
            PushSubscriptionModel.endpoint == request.endpoint,
            PushSubscriptionModel.user_id == current_user.id,
        )
    )
    await db.commit()
    return {"status": "unsubscribed"}


@router.post("/test")
async def send_test(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not is_configured():
        raise HTTPException(status_code=503, detail="Push notifications are not configured")
    sent = await send_push_to_user(
        db, current_user.id,
        title="Koruna",
        body="Testovací notifikace funguje 🎉",
        url="/settings",
    )
    if sent == 0:
        raise HTTPException(status_code=404, detail="No push subscriptions for this user")
    return {"sent": sent}
