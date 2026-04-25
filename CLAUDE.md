# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Personal budget/finance tracking app with bank integration. Single-user, no auth. Built as a Next.js frontend + FastAPI backend + PostgreSQL stack deployed on Azure Container Apps.

## Commands

### Frontend (in `frontend/`)
```bash
npm run dev        # dev server on port 3000
npm run build      # production build (standalone output)
npm run lint       # ESLint
```

### Backend (in `backend/`)
```bash
python3 -m uvicorn main:app --reload --port 8000   # dev server
alembic upgrade head                                # run DB migrations
python3 migrate.py                                  # alternative migration runner
```

### Local full-stack
```bash
cd backend && docker-compose up   # starts PostgreSQL + runs migrations
```

## Architecture

```
Next.js 16 (App Router) ← REST → FastAPI (Python 3.11) ← asyncpg → PostgreSQL
```

**Frontend** (`frontend/`):
- App Router pages under `app/` — routes: `/`, `/accounts/[id]`, `/budgets`, `/investments`, `/transactions`, `/reports`, `/rozpocet`, `/settings`, `/manual-account/[id]`
- TanStack React Query for all server state (30s stale, 5min cache)
- `lib/api.ts` — central API client; respects `NEXT_PUBLIC_USE_MOCKS=true` to return mock data
- `contexts/AccountsContext.tsx` — shared account list state
- PWA with Service Worker (`public/sw.js`)

**Backend** (`backend/`):
- `main.py` — FastAPI app + router registration + CORS
- `config.py` — Pydantic `Settings` singleton (LRU-cached), reads `.env`
- `database.py` — async SQLAlchemy engine + session factory
- `models.py` — all SQLAlchemy ORM models
- `routers/` — one file per domain: accounts, transactions, dashboard, sync, investments, budgets, categories, manual_accounts, contacts, settings
- `services/` — GoCardless, Trading212, and exchange rate API clients

**Database models** (all in `models.py`): `accounts`, `transactions`, `sync_status`, `settings`, `budgets`, `savings_goals`, `categories`, `monthly_budgets`, `monthly_income_items`, `monthly_expenses`, `category_rules`, `manual_accounts`, `manual_account_items`, `contacts`, `portfolio_snapshots`, `recurring_expenses`

## External Integrations

- **GoCardless** (formerly Nordigen) — bank account OAuth + transaction sync
- **Trading 212** — investment portfolio data via API key
- **Exchange rate service** — currency conversion for multi-currency accounts

## Key Patterns

- All backend I/O is async (asyncio + asyncpg); never use blocking calls in routers or services
- Account/transaction IDs from GoCardless are strings; app-generated records use integer PKs
- Dates stored as `YYYY-MM-DD` ISO strings, not date objects
- Transfer detection: automatic logic identifies internal transfers between own accounts and configured family IBANs
- Category rules engine auto-categorizes transactions on sync

## Environment Setup

**`backend/.env`** (see `.env.example`):
```
DATABASE_URL=postgresql+asyncpg://admin:change_me@db:5432/budget_db
GOCARDLESS_SECRET_ID=...
GOCARDLESS_SECRET_KEY=...
TRADING212_API_KEY=...
FRONTEND_URL=http://localhost:3000
```

**`frontend/.env.local`**:
```
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_USE_MOCKS=false
```

## CI/CD

Three GitHub Actions workflows:
- `ci.yml` — lint only (ESLint + flake8 syntax/undefined-name checks) on PRs to main
- `deploy-frontend.yml` — Docker build → Azure Container Apps
- `deploy-backend.yml` — Docker build → Azure Container Apps

Frontend Docker build injects `NEXT_PUBLIC_BACKEND_URL` at build time.
