import httpx
from typing import Optional
from config import get_settings

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
    
    async def get_access_token(self) -> str:
        """Get or refresh access token"""
        if self.access_token:
            return self.access_token
        
        secret_id, secret_key = await get_gocardless_credentials()
        
        if not secret_id or not secret_key:
            raise Exception("GoCardless credentials not configured")
        
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
    
    async def get_institutions(self, country: str = "CZ") -> list:
        """Get available banks for a country"""
        token = await self.get_access_token()
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{BASE_URL}/institutions/",
                params={"country": country},
                headers={"Authorization": f"Bearer {token}"}
            )
            response.raise_for_status()
            return response.json()
    
    async def create_requisition(self, institution_id: str, redirect_url: str) -> dict:
        """Create a requisition (link to connect bank)"""
        token = await self.get_access_token()
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{BASE_URL}/requisitions/",
                json={
                    "redirect": redirect_url,
                    "institution_id": institution_id,
                    "user_language": "CS"
                },
                headers={"Authorization": f"Bearer {token}"}
            )
            response.raise_for_status()
            return response.json()
    
    async def get_requisition(self, requisition_id: str) -> dict:
        """Get requisition status and linked accounts"""
        token = await self.get_access_token()
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{BASE_URL}/requisitions/{requisition_id}/",
                headers={"Authorization": f"Bearer {token}"}
            )
            response.raise_for_status()
            return response.json()
    
    async def get_account_details(self, account_id: str) -> dict:
        """Get account details"""
        token = await self.get_access_token()
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{BASE_URL}/accounts/{account_id}/details/",
                headers={"Authorization": f"Bearer {token}"}
            )
            response.raise_for_status()
            return response.json()
    
    async def get_account_balances(self, account_id: str) -> dict:
        """Get account balances"""
        token = await self.get_access_token()
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{BASE_URL}/accounts/{account_id}/balances/",
                headers={"Authorization": f"Bearer {token}"}
            )
            response.raise_for_status()
            return response.json()
    
    async def get_account_transactions(self, account_id: str, date_from: Optional[str] = None, date_to: Optional[str] = None) -> dict:
        """Get account transactions"""
        token = await self.get_access_token()
        params = {}
        if date_from:
            params["date_from"] = date_from
        if date_to:
            params["date_to"] = date_to
        
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{BASE_URL}/accounts/{account_id}/transactions/",
                params=params,
                headers={"Authorization": f"Bearer {token}"}
            )
            response.raise_for_status()
            return response.json()


# Singleton instance
gocardless_service = GoCardlessService()
