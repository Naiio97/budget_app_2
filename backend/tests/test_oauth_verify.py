"""Tests for server-side Google ID token verification.

These never touch the network: we generate our own RSA keypair, mint tokens
with it, and monkeypatch the module's JWKS client to hand back our public key.
That exercises the REAL jwt.decode path (signature, audience, issuer, expiry,
required-claims) — only the key source is faked.
"""
import time

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException

from services import oauth_verify

AUDIENCE = "test-client-id.apps.googleusercontent.com"
ISSUER = "https://accounts.google.com"

# Sentinel meaning "drop this claim entirely" when passed as an override.
_DROP = object()


@pytest.fixture
def rsa_key():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


@pytest.fixture(autouse=True)
def patch_jwks(monkeypatch, rsa_key):
    """Verify against our test public key instead of fetching Google's JWKS."""

    class _FakeSigningKey:
        key = rsa_key.public_key()

    monkeypatch.setattr(
        oauth_verify._google_jwks_client,
        "get_signing_key_from_jwt",
        lambda token: _FakeSigningKey(),
    )


def _mint(signing_key, **overrides) -> str:
    now = int(time.time())
    payload = {
        "iss": ISSUER,
        "aud": AUDIENCE,
        "sub": "1234567890",
        "email": "user@gmail.com",
        "email_verified": True,
        "name": "Test User",
        "iat": now,
        "exp": now + 3600,
    }
    payload.update(overrides)
    payload = {k: v for k, v in payload.items() if v is not _DROP}
    return jwt.encode(payload, signing_key, algorithm="RS256")


async def test_valid_token_returns_claims(rsa_key):
    token = _mint(rsa_key)
    claims = await oauth_verify.verify_google_id_token(token, AUDIENCE)
    assert claims["sub"] == "1234567890"
    assert claims["email"] == "user@gmail.com"
    assert claims["email_verified"] is True


async def test_wrong_audience_rejected(rsa_key):
    token = _mint(rsa_key, aud="someone-elses-client-id")
    with pytest.raises(HTTPException) as exc:
        await oauth_verify.verify_google_id_token(token, AUDIENCE)
    assert exc.value.status_code == 401


async def test_expired_token_rejected(rsa_key):
    token = _mint(rsa_key, exp=int(time.time()) - 10)
    with pytest.raises(HTTPException) as exc:
        await oauth_verify.verify_google_id_token(token, AUDIENCE)
    assert exc.value.status_code == 401


async def test_untrusted_issuer_rejected(rsa_key):
    token = _mint(rsa_key, iss="https://evil.example.com")
    with pytest.raises(HTTPException) as exc:
        await oauth_verify.verify_google_id_token(token, AUDIENCE)
    assert exc.value.status_code == 401


async def test_missing_sub_rejected(rsa_key):
    token = _mint(rsa_key, sub=_DROP)
    with pytest.raises(HTTPException) as exc:
        await oauth_verify.verify_google_id_token(token, AUDIENCE)
    assert exc.value.status_code == 401


async def test_signature_from_wrong_key_rejected(rsa_key):
    # Token signed by a key the (patched) JWKS doesn't know → signature fails.
    attacker_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    token = _mint(attacker_key)
    with pytest.raises(HTTPException) as exc:
        await oauth_verify.verify_google_id_token(token, AUDIENCE)
    assert exc.value.status_code == 401
