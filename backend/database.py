from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from contextlib import asynccontextmanager
from typing import AsyncGenerator
from config import get_settings

settings = get_settings()

# Validace formátu — musí být async PostgreSQL driver
if not settings.database_url.startswith("postgresql+asyncpg://"):
    raise ValueError(
        f"DATABASE_URL musí začínat 'postgresql+asyncpg://'. "
        f"Aktuální hodnota začíná: '{settings.database_url[:30]}...'"
    )


class Base(DeclarativeBase):
    """Base class for all models"""
    pass


# Create async engine
engine = create_async_engine(
    settings.database_url,
    echo=False,  # Set to True for SQL debugging
    pool_size=5,
    max_overflow=10,
)

# Create async session factory
async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False
)


async def init_db():
    """Initialize database - create all tables"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency for getting database session"""
    async with async_session_maker() as session:
        try:
            yield session
        finally:
            await session.close()


@asynccontextmanager
async def get_db_context():
    """Context manager for database session (for use in services)"""
    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()