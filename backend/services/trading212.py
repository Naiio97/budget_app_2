import httpx
from typing import Optional, List
from config import get_settings

settings = get_settings()

# Use live or demo based on API key
BASE_URL = "https://live.trading212.com/api/v0"


async def get_trading212_api_key():
    """Get Trading 212 API key from database or fallback to .env"""
    from routers.settings import get_api_key
    
    api_key = await get_api_key("trading212_api_key")
    
    # Fallback to .env if not in DB
    if not api_key:
        api_key = settings.trading212_api_key
    
    return api_key


class Trading212Service:
    async def _get_headers(self) -> dict:
        api_key = await get_trading212_api_key()
        if not api_key:
            raise Exception("Trading 212 API key not configured")
        return {"Authorization": api_key}
    
    async def get_account_info(self) -> dict:
        """Get account cash balance and info"""
        headers = await self._get_headers()
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{BASE_URL}/equity/account/cash",
                headers=headers
            )
            response.raise_for_status()
            return response.json()
    
    async def get_portfolio(self) -> List[dict]:
        """Get all open positions"""
        headers = await self._get_headers()
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{BASE_URL}/equity/portfolio",
                headers=headers
            )
            response.raise_for_status()
            return response.json()
    
    async def get_position(self, ticker: str) -> dict:
        """Get specific position by ticker"""
        headers = await self._get_headers()
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{BASE_URL}/equity/portfolio/{ticker}",
                headers=headers
            )
            response.raise_for_status()
            return response.json()
    
    async def get_pies(self) -> List[dict]:
        """Get all pies"""
        headers = await self._get_headers()
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{BASE_URL}/equity/pies",
                headers=headers
            )
            response.raise_for_status()
            return response.json()
    
    async def get_dividends(self, cursor: Optional[str] = None, limit: int = 50) -> dict:
        """Get dividend history"""
        headers = await self._get_headers()
        params = {"limit": limit}
        if cursor:
            params["cursor"] = cursor
        
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{BASE_URL}/history/dividends",
                params=params,
                headers=headers
            )
            response.raise_for_status()
            return response.json()
    
    async def get_orders(self, cursor: Optional[str] = None, limit: int = 50) -> dict:
        """Get order history"""
        headers = await self._get_headers()
        params = {"limit": limit}
        if cursor:
            params["cursor"] = cursor
        
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{BASE_URL}/equity/history/orders",
                params=params,
                headers=headers
            )
            response.raise_for_status()
            return response.json()


# Singleton instance
trading212_service = Trading212Service()
