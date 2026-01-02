from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from config import get_settings
from routers import accounts, transactions, dashboard, sync, settings
from database import init_db

settings_config = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database on startup"""
    await init_db()
    yield


app = FastAPI(
    title="Budget Tracker API",
    description="Personal finance tracking with GoCardless & Trading 212",
    version="1.0.0",
    lifespan=lifespan
)

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings_config.frontend_url, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(accounts.router, prefix="/api/accounts", tags=["Accounts"])
app.include_router(transactions.router, prefix="/api/transactions", tags=["Transactions"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["Dashboard"])
app.include_router(sync.router, prefix="/api/sync", tags=["Sync"])
app.include_router(settings.router, prefix="/api/settings", tags=["Settings"])


@app.get("/")
async def root():
    return {"message": "Budget Tracker API", "status": "running"}


@app.get("/health")
async def health():
    return {"status": "healthy"}
