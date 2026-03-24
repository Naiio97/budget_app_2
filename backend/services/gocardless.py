import httpx
from typing import Optional
from config import get_settings
from schemas import (
    TransactionSchema, Integration, SpectacularRequisition, 
    Requisition, AccountDetail, AccountBalance, BalanceSchema
)

settings = get_settings()

BASE_URL = "https://bankaccountdata.gocardless.com/api/v2"


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


class GoCardlessService:
    def __init__(self):
        self.access_token: Optional[str] = None
        self.refresh_token: Optional[str] = None
    
    async def _request(self, method: str, path: str, **kwargs) -> dict:
        """Centrální metoda pro všechny HTTP požadavky na GoCardless API.
        Zajistí token, vytvoří jedno spojení, provede request a vrátí surový JSON."""
        token = await self.get_access_token()
        async with httpx.AsyncClient() as client:
            response = await client.request(
                method,
                f"{BASE_URL}{path}",
                headers={"Authorization": f"Bearer {token}"},
                **kwargs
            )
            response.raise_for_status()
            return response.json()
    
    async def get_access_token(self) -> str:
        """Get or refresh access token"""
        if self.access_token:
            return self.access_token
        
        secret_id, secret_key = await get_gocardless_credentials()
        
        if not secret_id or not secret_key:
            raise Exception("GoCardless credentials not configured")
        
        # Token request nemůže použít _request() — nemáme ještě token
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{BASE_URL}/token/new/",
                json={
                    "secret_id": secret_id,
                    "secret_key": secret_key
                }
            )
            response.raise_for_status()
            data = response.json()
            self.access_token = data["access"]
            self.refresh_token = data.get("refresh")
            return self.access_token
    
    def clear_token(self):
        """Clear cached token (for when credentials change)"""
        self.access_token = None
        self.refresh_token = None
    
    async def get_institutions(self, country: str = "CZ") -> list[Integration]:
        """Get available banks for a country — validated Pydantic models."""
        raw_list = await self._request("GET", "/institutions/", params={"country": country})
        return [Integration(**item) for item in raw_list]
    
    async def create_requisition(self, institution_id: str, redirect_url: str) -> SpectacularRequisition:
        """Create a requisition (link to connect bank) — validated Pydantic model."""
        raw_data = await self._request(
            "POST",
            "/requisitions/",
            json={
                "redirect": redirect_url,
                "institution_id": institution_id,
                "user_language": "CS"
            }
        )
        return SpectacularRequisition(**raw_data)
    
    async def get_requisition(self, requisition_id: str) -> Requisition:
        """Get requisition status and linked accounts — validated Pydantic model."""
        raw_data = await self._request("GET", f"/requisitions/{requisition_id}/")
        return Requisition(**raw_data)
    
    async def get_account_details(self, account_id: str) -> AccountDetail:
        """Get account details — validated Pydantic model."""
        raw_data = await self._request("GET", f"/accounts/{account_id}/details/")
        return AccountDetail(**raw_data)
    
    async def get_account_balances(self, account_id: str) -> AccountBalance:
        """Get account balances — validated Pydantic model."""
        raw_data = await self._request("GET", f"/accounts/{account_id}/balances/")
        return AccountBalance(**raw_data)
    
    async def get_account_transactions(self, account_id: str, date_from: Optional[str] = None, date_to: Optional[str] = None) -> list[TransactionSchema]:
        """Get account transactions and return strictly validated Pydantic models."""
        params = {}
        if date_from: params["date_from"] = date_from
        if date_to: params["date_to"] = date_to
        
        # Voláme tvou novou, čistou _request metodu s jedním spojením (co jsme řešili minule)
        raw_data = await self._request(
            "GET", 
            f"/accounts/{account_id}/transactions/",
            params=params
        )
        
        # Ošetření struktury, kterou GoCardless vrací
        transactions_dict = raw_data.get("transactions", {})
        booked_raw = transactions_dict.get("booked", [])
        
        # TADY JE TA CELNICE. 
        # Z pole surových slovníků vyrábíme pole validovaných objektů.
        # Všechny datumy se zde samy převedou ze stringů.
        clean_transactions = [TransactionSchema(**tx) for tx in booked_raw]
        
        return clean_transactions


# Singleton instance
gocardless_service = GoCardlessService()
