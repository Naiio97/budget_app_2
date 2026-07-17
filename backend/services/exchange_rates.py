import time
import httpx
import logging

logger = logging.getLogger(__name__)

# Reasonable fallback rates when API is unavailable
FALLBACK_RATES = {
    ("EUR", "CZK"): 25.5,
    ("USD", "CZK"): 23.5,
    ("GBP", "CZK"): 29.5,
}

# In-process TTL cache. Dashboard i investice volají kurz ve smyčce přes
# pozice/účty — bez cache to znamenalo HTTP request na Frankfurter za každou
# položku. Kurzy se mění ~1× denně, hodina je bezpečná. Fallback se cachuje
# jen krátce, ať se po výpadku API brzy zkusí znovu, ale smyčky ho nemlátí.
_TTL_OK = 3600.0
_TTL_FALLBACK = 300.0
_cache: dict[tuple[str, str], tuple[float, float, float]] = {}  # pair -> (rate, cached_at, ttl)


async def _fetch_rate(from_currency: str, to_currency: str) -> float | None:
    """Fetch the current rate from the Frankfurter API; None on any failure."""
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
            logger.warning(f"Rate not found in response: {data}")
    except Exception as e:
        logger.error(f"Failed to fetch exchange rate: {e}")
    return None


async def get_exchange_rate(from_currency: str, to_currency: str) -> float:
    """
    Exchange rate with an in-process TTL cache.
    Falls back to hardcoded approximate rates if the API is unavailable.
    """
    if from_currency == to_currency:
        return 1.0

    pair = (from_currency, to_currency)
    cached = _cache.get(pair)
    now = time.monotonic()
    if cached and now - cached[1] < cached[2]:
        return cached[0]

    rate = await _fetch_rate(from_currency, to_currency)
    if rate is not None:
        _cache[pair] = (rate, now, _TTL_OK)
        return rate

    fallback = FALLBACK_RATES.get(pair)
    if fallback:
        logger.warning(f"Using fallback rate {from_currency} -> {to_currency}: {fallback}")
    else:
        logger.error(f"No fallback rate for {from_currency} -> {to_currency}, returning 1.0")
        fallback = 1.0
    _cache[pair] = (fallback, now, _TTL_FALLBACK)
    return fallback
