from pydantic_settings import BaseSettings
from pydantic import Field
from functools import lru_cache


class Settings(BaseSettings):
    """Centrální konfigurace aplikace.
    Všechny hodnoty se načítají výhradně z proměnných prostředí (12-Factor: III. Config).
    """
    # Database — povinné, bez fallbacku
    database_url: str = Field(
        ..., 
        description="Async PostgreSQL connection string, e.g. postgresql+asyncpg://user:pass@host:port/db"
    )
    
    # GoCardless
    gocardless_secret_id: str = ""
    gocardless_secret_key: str = ""
    
    # Trading 212
    trading212_api_key: str = ""
    
    # App
    frontend_url: str = "http://localhost:3000"
    
    class Config:
        env_file = ".env"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
