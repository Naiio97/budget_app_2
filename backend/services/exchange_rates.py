import httpx
import logging

logger = logging.getLogger(__name__)


async def get_exchange_rate(from_currency: str, to_currency: str) -> float:
    """
    Fetch the current exchange rate from a public API.
    Returns 1.0 if currencies are the same or if fetching fails (fallback).
    """
    if from_currency == to_currency:
        return 1.0
        
    try:
        url = f"https://api.frankfurter.app/latest?from={from_currency}&to={to_currency}"
        logger.debug(f"Fetching exchange rate: {url}")
        async with httpx.AsyncClient() as client:
            response = await client.get(url, timeout=10.0)
            response.raise_for_status()
            data = response.json()
            rate = data.get("rates", {}).get(to_currency)
            
            if rate:
                logger.info(f"Exchange rate {from_currency} -> {to_currency}: {rate}")
                return float(rate)
            else:
                logger.warning(f"Rate not found in response: {data}")
                return 1.0
                
    except Exception as e:
        logger.error(f"Failed to fetch exchange rate: {e}")
        return 1.0
