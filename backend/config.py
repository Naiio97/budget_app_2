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

    # Konfigurace Pydanticu
    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore"  # Klíčové: ignoruje věci v .env, které tu nejsou definované
    )
@lru_cache()
def get_settings() -> Settings:
    return Settings()