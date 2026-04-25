import logging
import sys
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from config import get_settings
from routers import accounts, transactions, dashboard, sync, settings, investments, budgets, monthly_budget, categories, manual_accounts, contacts, manual_investments
from database import get_db

# Centrální konfigurace logování — 12-Factor: logy jdou striktně na stdout (event stream)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    handlers=[logging.StreamHandler(sys.stdout)]
)

logger = logging.getLogger(__name__)
settings_config = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(
    title="Budget Tracker API",
    description="Personal finance tracking with GoCardless & Trading 212",
    version="1.0.0",
    lifespan=lifespan
)

# CORS for frontend
# Seznam povolených URL (tvůj nový frontend)
origins = [
    "https://budget-frontend.redfield-d4fd3af1.westeurope.azurecontainerapps.io",
    "http://localhost:3000", # Pro tvůj lokální vývoj
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(accounts.router, prefix="/accounts", tags=["Accounts"])
app.include_router(transactions.router, prefix="/transactions", tags=["Transactions"])
app.include_router(dashboard.router, prefix="/dashboard", tags=["Dashboard"])
app.include_router(sync.router, prefix="/sync", tags=["Sync"])
app.include_router(settings.router, prefix="/settings", tags=["Settings"])
app.include_router(investments.router, prefix="/investments", tags=["Investments"])
app.include_router(budgets.router, prefix="/budgets", tags=["Budgets"])
app.include_router(monthly_budget.router)
app.include_router(categories.router, prefix="/categories", tags=["Categories"])
app.include_router(manual_accounts.router, prefix="/manual-accounts", tags=["Manual Accounts"])
app.include_router(contacts.router, prefix="/contacts", tags=["Contacts"])
app.include_router(manual_investments.router, prefix="/manual-investments", tags=["Manual Investments"])

@app.get("/")
async def root():
    return {"message": "Budget Tracker API", "status": "running"}


@app.get("/health")
async def health(db: AsyncSession = Depends(get_db)):
    """Healthcheck — ověří skutečné spojení s databází přes SELECT 1."""
    try:
        await db.execute(text("SELECT 1"))
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        logger.error(f"Healthcheck failed: {e}")
        return JSONResponse(
            status_code=500,
            content={"status": "unhealthy", "database": "disconnected", "error": str(e)}
        )
