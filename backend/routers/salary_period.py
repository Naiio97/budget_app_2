"""Výplatní období — hranice aktuálního rozpočtového období pro frontend.

Rozpočet i „tento měsíc" běží od dne příchodu výplaty, ne od 1. Frontend tenhle
endpoint používá jen pro výchozí zvolené období (které může být minulý kalendářní
měsíc, dokud výplata nedorazí); hranice konkrétního měsíce vrací i /monthly-budget.
"""
from datetime import date

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from database import get_db
from models import UserModel
from services.salary_period import current_period_year_month, period_bounds

router = APIRouter()


class SalaryPeriodResponse(BaseModel):
    year_month: str  # identita období (měsíc, který financuje výplata daného období)
    start: str       # den příchodu výplaty (YYYY-MM-DD)
    end: str         # den příchodu příští výplaty, exkluzivní


@router.get("/current", response_model=SalaryPeriodResponse)
async def get_current_salary_period(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ym = await current_period_year_month(db, current_user.id, date.today())
    start, end = await period_bounds(db, current_user.id, ym)
    return SalaryPeriodResponse(year_month=ym, start=start, end=end)
