"""Testy TTL cache kurzů — bez sítě, _fetch_rate se nahrazuje monkeypatchem."""
import pytest

from services import exchange_rates


@pytest.fixture(autouse=True)
def clean_cache():
    exchange_rates._cache.clear()
    yield
    exchange_rates._cache.clear()


def _fake_fetch(rate):
    calls = {"n": 0}

    async def fetch(frm, to):
        calls["n"] += 1
        return rate

    return fetch, calls


async def test_same_currency_short_circuits():
    assert await exchange_rates.get_exchange_rate("CZK", "CZK") == 1.0


async def test_cache_hit_skips_second_fetch(monkeypatch):
    fetch, calls = _fake_fetch(25.0)
    monkeypatch.setattr(exchange_rates, "_fetch_rate", fetch)

    assert await exchange_rates.get_exchange_rate("EUR", "CZK") == 25.0
    assert await exchange_rates.get_exchange_rate("EUR", "CZK") == 25.0
    assert calls["n"] == 1


async def test_expired_entry_refetches(monkeypatch):
    fetch, calls = _fake_fetch(25.0)
    monkeypatch.setattr(exchange_rates, "_fetch_rate", fetch)

    await exchange_rates.get_exchange_rate("EUR", "CZK")
    # uměle zestárnout záznam za TTL
    rate, cached_at, ttl = exchange_rates._cache[("EUR", "CZK")]
    exchange_rates._cache[("EUR", "CZK")] = (rate, cached_at - ttl - 1, ttl)

    await exchange_rates.get_exchange_rate("EUR", "CZK")
    assert calls["n"] == 2


async def test_api_failure_uses_fallback_with_short_ttl(monkeypatch):
    fetch, calls = _fake_fetch(None)
    monkeypatch.setattr(exchange_rates, "_fetch_rate", fetch)

    assert await exchange_rates.get_exchange_rate("EUR", "CZK") == exchange_rates.FALLBACK_RATES[("EUR", "CZK")]
    entry = exchange_rates._cache[("EUR", "CZK")]
    assert entry[2] == exchange_rates._TTL_FALLBACK
    # fallback je cachovaný — druhé volání nejde na API
    await exchange_rates.get_exchange_rate("EUR", "CZK")
    assert calls["n"] == 1


async def test_unknown_pair_falls_back_to_one(monkeypatch):
    fetch, _ = _fake_fetch(None)
    monkeypatch.setattr(exchange_rates, "_fetch_rate", fetch)
    assert await exchange_rates.get_exchange_rate("JPY", "CZK") == 1.0
