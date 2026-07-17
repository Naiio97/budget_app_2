import logging
import sys
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from config import get_settings
from routers import accounts, transactions, dashboard, sync, settings, investments, budgets, monthly_budget, recurring_expenses, categories, manual_accounts, contacts, manual_investments, auth, loans, subscriptions, tags, notifications, cashflow, salary_estimate
from auth import limiter
from database import get_db

settings_config = get_settings()

# Centrální konfigurace logování — 12-Factor: logy jdou striktně na stdout (event stream).
# Úroveň řídí LOG_LEVEL, formát LOG_FORMAT (json = produkce, text = lokální vývoj).
# JSON logy nesou i pole z `extra={...}` (event, user_id, duration_s…), takže se
# v Log Analytics / Kibaně filtruje podle polí místo grepování textu.
class _ColorFormatter(logging.Formatter):
    """Barevný level pro lokální vývoj (jen když je stdout terminál)."""
    _COLORS = {
        "DEBUG": "\x1b[36m", "INFO": "\x1b[32m", "WARNING": "\x1b[33m",
        "ERROR": "\x1b[31m", "CRITICAL": "\x1b[1;41m",
    }
    _RESET = "\x1b[0m"

    def format(self, record):
        color = self._COLORS.get(record.levelname)
        if color:
            record = logging.makeLogRecord(record.__dict__)
            record.levelname = f"{color}{record.levelname}{self._RESET}"
        return super().format(record)


_log_handler = logging.StreamHandler(sys.stdout)
if settings_config.log_format.lower() == "json":
    from pythonjsonlogger.json import JsonFormatter
    _log_handler.setFormatter(JsonFormatter(
        "%(asctime)s %(levelname)s %(name)s %(message)s",
        rename_fields={"asctime": "timestamp", "levelname": "level", "name": "logger"},
        datefmt="%Y-%m-%dT%H:%M:%S%z",
        json_ensure_ascii=False,
    ))
    # Jednotný JSON i pro uvicorn (včetně access logu) — jen v produkci.
    # Lokálně si uvicorn nechává vlastní barevný výstup.
    for _name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        _uv_logger = logging.getLogger(_name)
        _uv_logger.handlers.clear()
        _uv_logger.propagate = True
else:
    formatter_cls = _ColorFormatter if sys.stdout.isatty() else logging.Formatter
    _log_handler.setFormatter(formatter_cls(
        '%(asctime)s [%(levelname)s] %(name)s: %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S',
    ))
logging.basicConfig(
    level=getattr(logging, settings_config.log_level.upper(), logging.INFO),
    handlers=[_log_handler],
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(
    title="Budget Tracker API",
    description="Personal finance tracking with GoCardless & Trading 212",
    version="1.0.0",
    lifespan=lifespan
)

# Rate limiting (slowapi) — limiter itself is a singleton from auth.py so that
# routers can decorate endpoints with @limiter.limit(...).
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS — povolené originy řídí config (env CORS_ORIGINS), viz config.py
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings_config.cors_origins,
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
app.include_router(recurring_expenses.router)
app.include_router(categories.router, prefix="/categories", tags=["Categories"])
app.include_router(manual_accounts.router, prefix="/manual-accounts", tags=["Manual Accounts"])
app.include_router(contacts.router, prefix="/contacts", tags=["Contacts"])
app.include_router(manual_investments.router, prefix="/manual-investments", tags=["Manual Investments"])
app.include_router(loans.router, prefix="/loans", tags=["Loans"])
app.include_router(subscriptions.router, prefix="/subscriptions", tags=["Subscriptions"])
app.include_router(salary_estimate.router, prefix="/salary-estimate", tags=["Salary Estimate"])
app.include_router(auth.router, prefix="/auth", tags=["Auth"])
app.include_router(tags.router, prefix="/tags", tags=["Tags"])
app.include_router(notifications.router, prefix="/notifications", tags=["Notifications"])
app.include_router(cashflow.router, prefix="/cashflow", tags=["Cashflow"])

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
