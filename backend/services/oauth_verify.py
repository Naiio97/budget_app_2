"""Server-side verification of OAuth ID tokens.

The frontend's Auth.js layer already performs the OIDC handshake, but the
backend must NOT trust identity claims forwarded in a request body — the
/auth/oauth-upsert endpoint is reachable directly, so anyone could POST an
arbitrary email/sub and mint a backend JWT for someone else's account. Instead
we re-verify the provider's signed ID token here against the provider's
published JWKS and take the identity only from the verified payload.
"""
import asyncio
import logging

import jwt
from fastapi import HTTPException, status
from jwt import PyJWKClient

logger = logging.getLogger(__name__)

# Google may stamp either of these as the `iss` claim — both are valid.
GOOGLE_ISSUERS = {"https://accounts.google.com", "accounts.google.com"}
GOOGLE_JWKS_URI = "https://www.googleapis.com/oauth2/v3/certs"

# PyJWKClient caches fetched signing keys internally, so one module-level client
# is reused across requests and Google's certs aren't refetched on every login.
_google_jwks_client = PyJWKClient(GOOGLE_JWKS_URI)


def _verify_google_sync(id_token: str, audience: str) -> dict:
    """Blocking verification (JWKS fetch + RS256 verify). Run via to_thread."""
    signing_key = _google_jwks_client.get_signing_key_from_jwt(id_token)
    payload = jwt.decode(
        id_token,
        signing_key.key,
        algorithms=["RS256"],
        audience=audience,
        # require=... rejects tokens missing any of these claims outright.
        options={"require": ["exp", "iat", "aud", "iss", "sub"]},
    )
    # `issuer=` on jwt.decode only supports a single value across PyJWT versions,
    # so validate the set of accepted issuers explicitly here.
    if payload.get("iss") not in GOOGLE_ISSUERS:
        raise jwt.InvalidIssuerError("Untrusted issuer")
    return payload


async def verify_google_id_token(id_token: str, audience: str) -> dict:
    """Verify a Google OIDC ID token and return its claims.

    Raises 401 if the token is invalid/expired/wrong-audience, 503 if Google's
    JWKS can't be reached (so the caller never silently trusts an unverified
    token).
    """
    try:
        return await asyncio.to_thread(_verify_google_sync, id_token, audience)
    except jwt.PyJWTError as e:
        logger.warning("Google ID token rejected: %s", e)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Google ID token",
        )
    except Exception as e:  # JWKS fetch / network failure
        logger.error("Could not verify Google ID token (JWKS unreachable?): %s", e)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to verify Google identity right now",
        )
