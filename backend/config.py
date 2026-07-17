from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import AliasChoices, Field
from functools import lru_cache

class Settings(BaseSettings):
    """Centrální konfigurace aplikace."""
    # Database
    database_url: str = Field(..., description="Async PostgreSQL connection string")
    
    # Pojistky pro .env (aby Pydantic neřval)
    postgres_user: str = ""
    postgres_password: str = ""
    postgres_db: str = ""
    
    # Ostatní
    gocardless_secret_id: str = ""
    gocardless_secret_key: str = ""
    trading212_api_key: str = ""
    frontend_url: str = "http://localhost:3000"

    # CORS — čárkami oddělený seznam povolených originů. Default pokrývá
    # produkční frontend i lokální vývoj; na Azure jde přepsat env proměnnou
    # CORS_ORIGINS bez nové image (stejně jako LOG_LEVEL).
    cors_origins_raw: str = Field(
        default="https://budget-frontend.redfield-d4fd3af1.westeurope.azurecontainerapps.io,http://localhost:3000",
        alias="cors_origins",
    )

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins_raw.split(",") if o.strip()]

    # Úroveň logování (DEBUG/INFO/WARNING…) — na Azure jde přepnout env
    # proměnnou LOG_LEVEL bez nové image, jen novou revizí Container App.
    log_level: str = "INFO"
    # "json" = strukturované logy (produkce — Log Analytics / budoucí ELK filtruje
    # podle polí), "text" = čitelný formát pro lokální vývoj. Dockerfile nastavuje
    # LOG_FORMAT=json, takže produkce loguje JSON automaticky.
    log_format: str = "text"

    # Auth (shared HS256 secret with frontend Auth.js)
    # Empty string means /auth/* endpoints will reject — set in .env before enabling auth.
    auth_secret: str = ""
    auth_jwt_ttl_hours: int = 24

    # Web Push (VAPID) — prázdné = notifikace vypnuté (endpointy vrací 503)
    vapid_private_key: str = ""
    vapid_public_key: str = ""
    vapid_subject: str = "mailto:admin@example.com"

    # Google OAuth client ID — MUST equal the one Auth.js uses on the frontend.
    # Used as the expected `aud` when the backend verifies the Google ID token
    # at /auth/oauth-upsert. Empty means Google login is refused (fail closed).
    # Accepts either GOOGLE_CLIENT_ID or Auth.js's AUTH_GOOGLE_ID in .env.
    google_client_id: str = Field(
        default="",
        validation_alias=AliasChoices("google_client_id", "auth_google_id"),
    )
    # Stored as a comma-separated string in .env (e.g. "google,apple") so
    # pydantic-settings doesn't try to JSON-decode it. Use the
    # `auth_allowed_oauth_providers` property below for a real list.
    auth_allowed_oauth_providers_raw: str = Field(
        default="google,apple",
        alias="auth_allowed_oauth_providers",
    )

    @property
    def auth_allowed_oauth_providers(self) -> list[str]:
        return [p.strip() for p in self.auth_allowed_oauth_providers_raw.split(",") if p.strip()]

    # Konfigurace Pydanticu
    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",  # Klíčové: ignoruje věci v .env, které tu nejsou definované
        populate_by_name=True,  # let the alias and field name both work
    )
@lru_cache()
def get_settings() -> Settings:
    return Settings()