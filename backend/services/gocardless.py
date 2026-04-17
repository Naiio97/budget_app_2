import httpx
import logging
from datetime import datetime, timedelta
from typing import Optional
from config import get_settings
from schemas import (
    TransactionSchema, Integration, SpectacularRequisition,
    Requisition, AccountDetail, AccountBalance, BalanceSchema
)

settings = get_settings()
logger = logging.getLogger(__name__)

BASE_URL = "https://bankaccountdata.gocardless.com/api/v2"

# Keys used to persist token data in the settings table
_KEY_ACCESS_TOKEN = "gocardless_access_token"
_KEY_ACCESS_EXPIRES = "gocardless_access_expires"   # ISO-8601 UTC datetime string
_KEY_REFRESH_TOKEN = "gocardless_refresh_token"
_KEY_REFRESH_EXPIRES = "gocardless_refresh_expires"  # ISO-8601 UTC datetime string

# How many seconds before expiry we consider the token "expired" (safety buffer)
_EXPIRY_BUFFER_SECS = 60


async def get_gocardless_credentials():
    """Get GoCardless credentials from database or fallback to .env"""
    from routers.settings import get_api_key

    secret_id = await get_api_key("gocardless_secret_id")
    secret_key = await get_api_key("gocardless_secret_key")

    # Fallback to .env if not in DB
    if not secret_id:
        secret_id = settings.gocardless_secret_id
    if not secret_key:
        secret_key = settings.gocardless_secret_key

    return secret_id, secret_key


def _parse_dt(value: Optional[str]) -> Optional[datetime]:
    """Parse ISO datetime string from DB → datetime (UTC, naive)."""
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def _is_valid(expires_at: Optional[datetime]) -> bool:
    """Return True if the token is still usable (has time left minus buffer)."""
    if expires_at is None:
        return False
    return datetime.utcnow() < expires_at - timedelta(seconds=_EXPIRY_BUFFER_SECS)


class GoCardlessService:
    def __init__(self):
        self.access_token: Optional[str] = None
        self.access_expires: Optional[datetime] = None
        self.refresh_token: Optional[str] = None
        self.refresh_expires: Optional[datetime] = None
        self._loaded_from_db: bool = False  # lazy flag — load once

    # ------------------------------------------------------------------ #
    #  DB persistence helpers                                              #
    # ------------------------------------------------------------------ #

    async def _load_from_db(self):
        """Populate in-memory token cache from the settings table."""
        from routers.settings import get_api_key
        self.access_token = await get_api_key(_KEY_ACCESS_TOKEN)
        self.access_expires = _parse_dt(await get_api_key(_KEY_ACCESS_EXPIRES))
        self.refresh_token = await get_api_key(_KEY_REFRESH_TOKEN)
        self.refresh_expires = _parse_dt(await get_api_key(_KEY_REFRESH_EXPIRES))
        self._loaded_from_db = True
        logger.debug(
            "Loaded GC tokens from DB — access valid: %s, refresh valid: %s",
            _is_valid(self.access_expires),
            _is_valid(self.refresh_expires),
        )

    async def _save_to_db(self):
        """Persist current in-memory token state to the settings table."""
        from database import get_db_context
        from routers.settings import set_setting
        async with get_db_context() as db:
            await set_setting(db, _KEY_ACCESS_TOKEN, self.access_token or "")
            await set_setting(db, _KEY_ACCESS_EXPIRES,
                              self.access_expires.isoformat() if self.access_expires else "")
            await set_setting(db, _KEY_REFRESH_TOKEN, self.refresh_token or "")
            await set_setting(db, _KEY_REFRESH_EXPIRES,
                              self.refresh_expires.isoformat() if self.refresh_expires else "")
        logger.debug("GC tokens saved to DB (access expires: %s)", self.access_expires)

    def _store_token_response(self, data: dict):
        """Parse a /token/new/ or /token/refresh/ response into memory."""
        self.access_token = data["access"]
        access_secs = int(data.get("access_expires", 86400))
        self.access_expires = datetime.utcnow() + timedelta(seconds=access_secs)

        if "refresh" in data:
            self.refresh_token = data["refresh"]
            refresh_secs = int(data.get("refresh_expires", 2592000))
            self.refresh_expires = datetime.utcnow() + timedelta(seconds=refresh_secs)

        logger.info(
            "New GC token acquired — access expires ~%ds from now, refresh expires ~%ds from now",
            access_secs, int(data.get("refresh_expires", 2592000))
        )

    # ------------------------------------------------------------------ #
    #  Token acquisition (new / refresh)                                  #
    # ------------------------------------------------------------------ #

    async def _fetch_new_token(self):
        """Call /token/new/ using credentials. Raises if credentials missing."""
        secret_id, secret_key = await get_gocardless_credentials()
        if not secret_id or not secret_key:
            raise Exception("GoCardless credentials not configured")

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{BASE_URL}/token/new/",
                json={"secret_id": secret_id, "secret_key": secret_key},
            )
            response.raise_for_status()
            self._store_token_response(response.json())

    async def _refresh_access_token(self):
        """Call /token/refresh/ using the stored refresh token."""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{BASE_URL}/token/refresh/",
                json={"refresh": self.refresh_token},
            )
            response.raise_for_status()
            data = response.json()
            # Refresh endpoint only returns a new access token (no new refresh)
            self.access_token = data["access"]
            access_secs = int(data.get("access_expires", 86400))
            self.access_expires = datetime.utcnow() + timedelta(seconds=access_secs)
            logger.info("GC access token refreshed — expires in ~%ds", access_secs)

    # ------------------------------------------------------------------ #
    #  Public API                                                          #
    # ------------------------------------------------------------------ #

    async def get_access_token(self) -> str:
        """Return a valid access token, refreshing or fetching new one as needed."""
        # 1. Lazy-load from DB on first call after process start
        if not self._loaded_from_db:
            await self._load_from_db()

        # 2. Access token still valid → nothing to do
        if _is_valid(self.access_expires) and self.access_token:
            return self.access_token

        # 3. Access expired but refresh token valid → use refresh endpoint
        if _is_valid(self.refresh_expires) and self.refresh_token:
            logger.info("GC access token expired — refreshing via refresh token")
            try:
                await self._refresh_access_token()
                await self._save_to_db()
                return self.access_token  # type: ignore[return-value]
            except Exception as e:
                logger.warning("Refresh failed (%s) — falling back to new token", e)

        # 4. Both expired (or no refresh token at all) → fetch brand-new token
        logger.info("GC tokens missing/expired — fetching new token from credentials")
        await self._fetch_new_token()
        await self._save_to_db()
        return self.access_token  # type: ignore[return-value]

    async def _request(self, method: str, path: str, **kwargs) -> dict:
        """Central HTTP method for all GoCardless API calls."""
        token = await self.get_access_token()
        async with httpx.AsyncClient() as client:
            response = await client.request(
                method,
                f"{BASE_URL}{path}",
                headers={"Authorization": f"Bearer {token}"},
                **kwargs,
            )
            response.raise_for_status()
            return response.json()

    def clear_token(self):
        """Clear cached token (call when credentials change)."""
        self.access_token = None
        self.access_expires = None
        self.refresh_token = None
        self.refresh_expires = None
        self._loaded_from_db = False

    # ------------------------------------------------------------------ #
    #  GoCardless API endpoints                                            #
    # ------------------------------------------------------------------ #

    async def get_institutions(self, country: str = "CZ") -> list[Integration]:
        raw_list = await self._request("GET", "/institutions/", params={"country": country})
        return [Integration(**item) for item in raw_list]

    async def create_requisition(self, institution_id: str, redirect_url: str) -> SpectacularRequisition:
        raw_data = await self._request(
            "POST",
            "/requisitions/",
            json={
                "redirect": redirect_url,
                "institution_id": institution_id,
                "user_language": "CS",
            },
        )
        return SpectacularRequisition(**raw_data)

    async def get_requisition(self, requisition_id: str) -> Requisition:
        raw_data = await self._request("GET", f"/requisitions/{requisition_id}/")
        return Requisition(**raw_data)

    async def get_account_details(self, account_id: str) -> AccountDetail:
        raw_data = await self._request("GET", f"/accounts/{account_id}/details/")
        return AccountDetail(**raw_data)

    async def get_account_balances(self, account_id: str) -> AccountBalance:
        raw_data = await self._request("GET", f"/accounts/{account_id}/balances/")
        return AccountBalance(**raw_data)

    async def get_account_transactions(
        self, account_id: str, date_from: Optional[str] = None, date_to: Optional[str] = None
    ) -> list[TransactionSchema]:
        params = {}
        if date_from:
            params["date_from"] = date_from
        if date_to:
            params["date_to"] = date_to

        raw_data = await self._request(
            "GET",
            f"/accounts/{account_id}/transactions/",
            params=params,
        )

        transactions_dict = raw_data.get("transactions", {})
        booked_raw = transactions_dict.get("booked", [])
        return [TransactionSchema(**tx) for tx in booked_raw]


# Singleton instance
gocardless_service = GoCardlessService()
