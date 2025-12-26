import httpx
from typing import Optional, List
from config import get_settings

settings = get_settings()

# Use live or demo based on API key
BASE_URL = "https://live.trading212.com/api/v0"


class Trading212Service:
    def __init__(self):
        self.api_key = settings.trading212_api_key
    
    def _headers(self) -> dict:
        return {"Authorization": self.api_key}
    
    async def get_account_info(self) -> dict:
        """Get account cash balance and info"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{BASE_URL}/equity/account/cash",
                headers=self._headers()
            )
            response.raise_for_status()
            return response.json()
    
    async def get_portfolio(self) -> List[dict]:
        """Get all open positions"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{BASE_URL}/equity/portfolio",
                headers=self._headers()
            )
            response.raise_for_status()
            return response.json()
    
    async def get_position(self, ticker: str) -> dict:
        """Get specific position by ticker"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{BASE_URL}/equity/portfolio/{ticker}",
                headers=self._headers()
            )
            response.raise_for_status()
            return response.json()
    
    async def get_pies(self) -> List[dict]:
        """Get all pies"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{BASE_URL}/equity/pies",
                headers=self._headers()
            )
            response.raise_for_status()
            return response.json()
    
    async def get_dividends(self, cursor: Optional[str] = None, limit: int = 50) -> dict:
        """Get dividend history"""
        params = {"limit": limit}
        if cursor:
            params["cursor"] = cursor
        
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{BASE_URL}/history/dividends",
                params=params,
                headers=self._headers()
            )
            response.raise_for_status()
            return response.json()
    
    async def get_orders(self, cursor: Optional[str] = None, limit: int = 50) -> dict:
        """Get order history"""
        params = {"limit": limit}
        if cursor:
            params["cursor"] = cursor
        
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{BASE_URL}/equity/history/orders",
                params=params,
                headers=self._headers()
            )
            response.raise_for_status()
            return response.json()


# Singleton instance
trading212_service = Trading212Service()
