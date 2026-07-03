"""Web Push notifikace (PWA) přes pywebpush + VAPID.

Odběry žijí v tabulce push_subscriptions (jeden řádek na prohlížeč).
Mrtvé odběry (404/410 z push služby) se mažou automaticky.
Bez nastavených VAPID klíčů je služba neaktivní (is_configured() == False).
"""
import asyncio
import json
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from models import PushSubscriptionModel

logger = logging.getLogger(__name__)
settings = get_settings()


def is_configured() -> bool:
    return bool(settings.vapid_private_key and settings.vapid_public_key)


def _send_one(subscription: PushSubscriptionModel, payload: dict) -> bool:
    """Blocking send (runs in a thread). Returns False for dead subscriptions."""
    from pywebpush import webpush, WebPushException

    try:
        webpush(
            subscription_info={
                "endpoint": subscription.endpoint,
                "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth},
            },
            data=json.dumps(payload, ensure_ascii=False),
            vapid_private_key=settings.vapid_private_key,
            vapid_claims={"sub": settings.vapid_subject},
        )
        return True
    except WebPushException as e:
        status = getattr(e.response, "status_code", None)
        if status in (404, 410):
            return False  # odběr už neexistuje → smazat
        logger.warning(f"Web push failed ({status}): {e}")
        return True  # transientní chyba — odběr nechat
    except Exception as e:
        # Poškozený odběr (nevalidní klíče apod.) je trvale k ničemu → smazat
        logger.warning(f"Invalid push subscription {subscription.id}: {e}")
        return False


async def send_push_to_user(
    db: AsyncSession, user_id: int, title: str, body: str, url: str = "/"
) -> int:
    """Pošle notifikaci na všechna zařízení uživatele. Vrací počet doručení."""
    if not is_configured():
        return 0

    result = await db.execute(
        select(PushSubscriptionModel).where(PushSubscriptionModel.user_id == user_id)
    )
    subscriptions = list(result.scalars())
    if not subscriptions:
        return 0

    payload = {"title": title, "body": body, "url": url}
    sent = 0
    for sub in subscriptions:
        alive = await asyncio.to_thread(_send_one, sub, payload)
        if alive:
            sent += 1
        else:
            logger.info(f"Removing dead push subscription {sub.id}")
            await db.delete(sub)
    await db.commit()
    return sent
