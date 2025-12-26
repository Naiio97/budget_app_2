from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
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
