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
    async def _request(self, method: str, path: str, **kwargs) -> dict | list:
        """Centrální metoda pro všechny HTTP požadavky na Trading 212 API.
        Zajistí API klíč, vytvoří jedno spojení, provede request a vrátí surový JSON."""
        api_key = await get_trading212_api_key()
        if not api_key:
            raise Exception("Trading 212 API key not configured")
        
        async with httpx.AsyncClient() as client:
            response = await client.request(
                method,
                f"{BASE_URL}{path}",
                headers={"Authorization": api_key},
                **kwargs
            )
            response.raise_for_status()
            return response.json()
    
    async def get_account_info(self) -> dict:
        """Get account cash balance and info"""
        return await self._request("GET", "/equity/account/cash")
    
    async def get_portfolio(self) -> List[dict]:
        """Get all open positions"""
        return await self._request("GET", "/equity/portfolio")
    
    async def get_position(self, ticker: str) -> dict:
        """Get specific position by ticker"""
        return await self._request("GET", f"/equity/portfolio/{ticker}")
    
    async def get_pies(self) -> List[dict]:
        """Get all pies"""
        return await self._request("GET", "/equity/pies")
    
    async def get_dividends(self, cursor: Optional[str] = None, limit: int = 50) -> dict:
        """Get dividend history"""
        params = {"limit": limit}
        if cursor:
            params["cursor"] = cursor
        return await self._request("GET", "/history/dividends", params=params)
    
    async def get_orders(self, cursor: Optional[str] = None, limit: int = 50) -> dict:
        """Get order history"""
        params = {"limit": limit}
        if cursor:
            params["cursor"] = cursor
        return await self._request("GET", "/equity/history/orders", params=params)


# Singleton instance
trading212_service = Trading212Service()
