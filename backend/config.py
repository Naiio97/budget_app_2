from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field
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

    # Auth (shared HS256 secret with frontend Auth.js)
    # Empty string means /auth/* endpoints will reject — set in .env before enabling auth.
    auth_secret: str = ""
    auth_jwt_ttl_hours: int = 24
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