import httpx
import logging

logger = logging.getLogger(__name__)

# Reasonable fallback rates when API is unavailable
FALLBACK_RATES = {
    ("EUR", "CZK"): 25.5,
    ("USD", "CZK"): 23.5,
    ("GBP", "CZK"): 29.5,
}


async def get_exchange_rate(from_currency: str, to_currency: str) -> float:
    """
    Fetch the current exchange rate from a public API.
    Falls back to hardcoded approximate rates if the API is unavailable.
    """
    if from_currency == to_currency:
        return 1.0

    try:
        url = f"https://api.frankfurter.dev/v1/latest?from={from_currency}&to={to_currency}"
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

    except Exception as e:
        logger.error(f"Failed to fetch exchange rate: {e}")

    fallback = FALLBACK_RATES.get((from_currency, to_currency))
    if fallback:
        logger.warning(f"Using fallback rate {from_currency} -> {to_currency}: {fallback}")
        return fallback

    logger.error(f"No fallback rate for {from_currency} -> {to_currency}, returning 1.0")
    return 1.0
