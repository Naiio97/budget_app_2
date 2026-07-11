"""Odhad výplaty z nahraného timesheetu (.xlsx).

Upload → parse (services/timesheet_parser) → výpočet (services/salary_calculator)
→ upsert do salary_estimates. Accept zapíše čistou částku na účet jako řádek
příjmu „Výplata" do měsíčního rozpočtu (zrcadlí sync-income v monthly_budget.py).
"""
import asyncio
import json
import re
from dataclasses import asdict
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from database import get_db
from models import (
    MonthlyBudgetModel,
    MonthlyIncomeItemModel,
    SalaryEstimateModel,
    UserModel,
)
from routers.settings import get_setting, set_setting
from services.payslip_parser import parse_payslip
from services.salary_calculator import calculate_salary
from services.timesheet_parser import compute_fond_days, parse_timesheet

router = APIRouter()

YEAR_MONTH_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


class SalaryEstimateResponse(BaseModel):
    year_month: str
    source_filename: Optional[str] = None
    fond_days: int
    salary_used: float
    prumer_used: float
    bonus: float
    gross_pay: float
    net_pay: float
    net_to_account: float
    breakdown: dict
    is_accepted: bool
    prumer_stale: bool
    payout_month: str  # měsíc, ve kterém výplata přijde na účet (year_month + 1)
    # Zpětná vazba z reálné výplatnice (null, dokud nebyla nahraná)
    actual_net_to_account: Optional[float] = None
    actual: Optional[dict] = None


class SalaryPayslipResponse(SalaryEstimateResponse):
    config_updated: dict  # {"prumer": bool, "base": bool} — co se zkalibrovalo


def _quarter_of(year_month: str) -> str:
    """"2026-07" → "2026-Q3"."""
    year, month = year_month.split("-")
    return f"{year}-Q{(int(month) - 1) // 3 + 1}"


def _next_month(year_month: str) -> str:
    """Výplatní měsíc: mzda za měsíc M chodí na účet v měsíci M+1."""
    year, month = (int(x) for x in year_month.split("-"))
    if month == 12:
        return f"{year + 1}-01"
    return f"{year}-{month + 1:02d}"


def _validate_year_month(year_month: str) -> None:
    if not YEAR_MONTH_RE.match(year_month):
        raise HTTPException(status_code=400, detail="Neplatný měsíc — očekávám formát YYYY-MM.")


def _build_response(estimate: SalaryEstimateModel, prumer_quarter: Optional[str]) -> SalaryEstimateResponse:
    return SalaryEstimateResponse(
        year_month=estimate.year_month,
        source_filename=estimate.source_filename,
        fond_days=estimate.fond_days,
        salary_used=estimate.salary_used,
        prumer_used=estimate.prumer_used,
        bonus=estimate.bonus,
        gross_pay=estimate.gross_pay,
        net_pay=estimate.net_pay,
        net_to_account=estimate.net_to_account,
        breakdown=json.loads(estimate.breakdown_json),
        is_accepted=bool(estimate.is_accepted),
        prumer_stale=(
            prumer_quarter is not None
            and _quarter_of(estimate.year_month) != prumer_quarter
        ),
        payout_month=_next_month(estimate.year_month),
        actual_net_to_account=estimate.actual_net_to_account,
        actual=json.loads(estimate.actual_json) if estimate.actual_json else None,
    )


async def _get_estimate(db: AsyncSession, user_id: int, year_month: str) -> Optional[SalaryEstimateModel]:
    result = await db.execute(
        select(SalaryEstimateModel).where(
            SalaryEstimateModel.user_id == user_id,
            SalaryEstimateModel.year_month == year_month,
        )
    )
    return result.scalar_one_or_none()


@router.get("/", response_model=list[SalaryEstimateResponse])
async def list_salary_estimates(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Historie odhadů, nejnovější první"""
    result = await db.execute(
        select(SalaryEstimateModel)
        .where(SalaryEstimateModel.user_id == current_user.id)
        .order_by(SalaryEstimateModel.year_month.desc())
    )
    estimates = result.scalars().all()
    prumer_quarter = await get_setting(db, current_user.id, "salary_prumer_quarter")
    return [_build_response(e, prumer_quarter) for e in estimates]


@router.get("/{year_month}", response_model=SalaryEstimateResponse)
async def get_salary_estimate(
    year_month: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    estimate = await _get_estimate(db, current_user.id, year_month)
    if not estimate:
        raise HTTPException(status_code=404, detail="Pro tento měsíc žádný odhad není.")
    prumer_quarter = await get_setting(db, current_user.id, "salary_prumer_quarter")
    return _build_response(estimate, prumer_quarter)


@router.post("/{year_month}", response_model=SalaryEstimateResponse)
async def upload_salary_timesheet(
    year_month: str,
    file: UploadFile = File(...),
    bonus: float = Form(0.0),
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Nahrát timesheet a spočítat odhad výplaty pro daný měsíc"""
    _validate_year_month(year_month)

    base = await get_setting(db, current_user.id, "salary_base_monthly")
    prumer = await get_setting(db, current_user.id, "salary_prumer")
    prumer_quarter = await get_setting(db, current_user.id, "salary_prumer_quarter")
    if not base or not prumer:
        raise HTTPException(
            status_code=404,
            detail="Nastav nejprve mzdovou konfiguraci (základní mzda a průměr náhrady).",
        )

    file_bytes = await file.read()
    try:
        # openpyxl parse je synchronní CPU práce — nesmí blokovat event loop
        hours = await asyncio.to_thread(parse_timesheet, file_bytes)
    except Exception:
        raise HTTPException(
            status_code=400,
            detail="Soubor se nepodařilo přečíst — je to timesheet ve formátu .xlsx?",
        )
    if hours.fond_days == 0:
        raise HTTPException(
            status_code=400,
            detail="V souboru jsem nenašel žádné dny — je to timesheet ve správném formátu?",
        )

    fond_days = compute_fond_days(year_month)
    breakdown = calculate_salary(
        hours=hours,
        fond_days=fond_days,
        salary=float(base),
        prumer=float(prumer),
        bonus=bonus,
    )
    breakdown_payload = {"hours": asdict(hours), **asdict(breakdown)}

    estimate = await _get_estimate(db, current_user.id, year_month)
    if estimate is None:
        estimate = SalaryEstimateModel(user_id=current_user.id, year_month=year_month)
        db.add(estimate)
    estimate.source_filename = file.filename
    estimate.fond_days = fond_days
    estimate.salary_used = float(base)
    estimate.prumer_used = float(prumer)
    estimate.bonus = bonus
    estimate.gross_pay = breakdown.hruba_mzda
    estimate.net_pay = breakdown.cista_mzda
    estimate.net_to_account = breakdown.na_ucet
    estimate.breakdown_json = json.dumps(breakdown_payload)
    estimate.is_accepted = False
    estimate.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(estimate)
    return _build_response(estimate, prumer_quarter)


@router.post("/{year_month}/payslip", response_model=SalaryPayslipResponse)
async def upload_salary_payslip(
    year_month: str,
    file: UploadFile = File(...),
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Nahrát reálnou výplatnici (PDF) — uloží skutečnost k odhadu a zkalibruje
    konfiguraci (kvartální průměr náhrad, základní mzda) pro další měsíce."""
    _validate_year_month(year_month)

    estimate = await _get_estimate(db, current_user.id, year_month)
    if not estimate:
        raise HTTPException(
            status_code=404,
            detail="Pro tento měsíc není odhad — nahraj nejdřív timesheet.",
        )

    file_bytes = await file.read()
    try:
        data = await asyncio.to_thread(parse_payslip, file_bytes)
    except Exception:
        raise HTTPException(
            status_code=400,
            detail="PDF se nepodařilo přečíst — je to výplatnice?",
        )
    if data.na_ucet is None:
        raise HTTPException(
            status_code=400,
            detail="V PDF jsem nenašel řádek 'Mzda na účet' — je to výplatnice?",
        )
    if data.year_month and data.year_month != year_month:
        raise HTTPException(
            status_code=400,
            detail=f"Výplatnice je za {data.year_month}, ale odhad je za {year_month}.",
        )

    estimate.actual_net_to_account = data.na_ucet
    estimate.actual_json = json.dumps({
        "na_ucet": data.na_ucet,
        "base_monthly": data.base_monthly,
        "prumer": data.prumer,
        "srazky": data.srazky,
        "delta": round(data.na_ucet - estimate.net_to_account, 2),
        "source_filename": file.filename,
    })
    estimate.updated_at = datetime.utcnow()

    # Kalibrace konfigurace: pásku bereme jako zdroj pravdy, ale jen když
    # není starší než už uložený kvartál (zpětné nahrání historie nesmí
    # přepsat novější průměr). "YYYY-QN" se dá porovnávat lexikograficky.
    config_updated = {"prumer": False, "base": False}
    paska_quarter = _quarter_of(year_month)
    stored_quarter = await get_setting(db, current_user.id, "salary_prumer_quarter")
    if stored_quarter is None or paska_quarter >= stored_quarter:
        if data.prumer is not None:
            stored_prumer = await get_setting(db, current_user.id, "salary_prumer")
            if stored_prumer is None or float(stored_prumer) != data.prumer or stored_quarter != paska_quarter:
                await set_setting(db, current_user.id, "salary_prumer", str(data.prumer))
                await set_setting(db, current_user.id, "salary_prumer_quarter", paska_quarter)
                config_updated["prumer"] = True
        if data.base_monthly is not None:
            stored_base = await get_setting(db, current_user.id, "salary_base_monthly")
            if stored_base is None or float(stored_base) != data.base_monthly:
                await set_setting(db, current_user.id, "salary_base_monthly", str(data.base_monthly))
                config_updated["base"] = True

    await db.commit()
    await db.refresh(estimate)

    prumer_quarter = await get_setting(db, current_user.id, "salary_prumer_quarter")
    base_response = _build_response(estimate, prumer_quarter)
    return SalaryPayslipResponse(**base_response.model_dump(), config_updated=config_updated)


@router.post("/{year_month}/accept")
async def accept_salary_estimate(
    year_month: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Přijmout odhad jako řádek příjmu „Výplata" — do rozpočtu VÝPLATNÍHO
    měsíce (year_month + 1), protože mzda za měsíc M chodí na účet v M+1.
    Stejná konvence jako sync-income: rozpočet měsíce M má příjem došlý v M."""
    estimate = await _get_estimate(db, current_user.id, year_month)
    if not estimate:
        raise HTTPException(status_code=404, detail="Pro tento měsíc žádný odhad není.")

    payout_month = _next_month(year_month)
    budget_result = await db.execute(
        select(MonthlyBudgetModel).where(
            MonthlyBudgetModel.user_id == current_user.id,
            MonthlyBudgetModel.year_month == payout_month,
        )
    )
    budget = budget_result.scalar_one_or_none()
    if not budget:
        budget = MonthlyBudgetModel(user_id=current_user.id, year_month=payout_month)
        db.add(budget)
        await db.commit()
        await db.refresh(budget)

    item_result = await db.execute(
        select(MonthlyIncomeItemModel)
        .where(MonthlyIncomeItemModel.budget_id == budget.id)
        .where(MonthlyIncomeItemModel.is_salary.is_(True))
    )
    salary_item = item_result.scalar_one_or_none()
    if salary_item is None:
        salary_item = MonthlyIncomeItemModel(
            budget_id=budget.id,
            name="Výplata",
            amount=estimate.net_to_account,
            order_index=0,
            is_salary=True,
        )
        db.add(salary_item)
    else:
        salary_item.amount = estimate.net_to_account

    estimate.is_accepted = True
    await db.commit()

    return {"status": "accepted", "amount": estimate.net_to_account, "payout_month": payout_month}


@router.delete("/{year_month}")
async def delete_salary_estimate(
    year_month: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    estimate = await _get_estimate(db, current_user.id, year_month)
    if not estimate:
        raise HTTPException(status_code=404, detail="Pro tento měsíc žádný odhad není.")
    await db.delete(estimate)
    await db.commit()
    return {"status": "deleted"}
