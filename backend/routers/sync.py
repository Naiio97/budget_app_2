from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from datetime import datetime, timedelta
import asyncio
import httpx
import json
import logging
import re
import time

from auth import get_current_user
from database import get_db
from models import AccountModel, TransactionModel, SyncStatusModel, CategoryRuleModel, PortfolioSnapshotModel, UserModel, ShareRuleModel
from services.share_rules import match_share_rule, compute_my_share
from services.transfers import detect_and_mark_transfers
from services.gocardless import gocardless_service, select_balance, GoCardlessAPIError
from services.push import send_push_to_user
from services.timefmt import utc_iso, utcnow
from services.trading212 import trading212_service
from services.exchange_rates import get_exchange_rate
from services.categorization import (
    RULE_ORDER,
    categorize_transaction_with_rules,
    categorize_with_preloaded_rules,
)

router = APIRouter()

logger = logging.getLogger(__name__)


def _humanize_retry_seconds(text: str) -> str | None:
    """„Please try again in 17388 seconds" → „za ~4 h 50 min (cca v 18:30)"."""
    m = re.search(r"(\d+)\s*seconds", text)
    if not m:
        return None
    secs = int(m.group(1))
    if secs < 90:
        wait = f"{secs} s"
    else:
        total_min = (secs + 59) // 60
        h, mins = divmod(total_min, 60)
        wait = f"{h} h {mins} min" if h and mins else (f"{h} h" if h else f"{mins} min")
    try:
        from zoneinfo import ZoneInfo
        at = (datetime.now(ZoneInfo("Europe/Prague")) + timedelta(seconds=secs)).strftime("%H:%M")
        return f"za ~{wait} (cca v {at})"
    except Exception:
        # bez tzdata (minimální image) aspoň délka čekání
        return f"za ~{wait}"


def _friendly_sync_error(e: Exception) -> str:
    """Přeloží technickou chybu na hlášku, ze které jde poznat CO udělat.
    Technický detail zůstává za pomlčkou pro diagnostiku."""
    if isinstance(e, GoCardlessAPIError):
        extra = e.detail or e.summary
        if e.status_code == 429:
            human = _humanize_retry_seconds(extra or "")
            if human:
                return f"Denní limit synchronizací banky vyčerpán (4/den) — další sync {human}."
            return f"Denní limit synchronizací banky vyčerpán (4/den). — {extra}"
        if e.status_code in (401, 403):
            return f"Banka odmítla přístup — nejspíš vypršel souhlas, obnov připojení v Nastavení. — {extra}"
        if e.status_code >= 500:
            return f"Výpadek GoCardless/banky (HTTP {e.status_code}), zkus to později. — {extra}"
    if isinstance(e, httpx.TimeoutException):
        return "Banka/GoCardless neodpověděla včas (timeout) — zkus sync za chvíli."
    if isinstance(e, httpx.TransportError):
        return f"Síťová chyba při volání banky ({type(e).__name__}) — zkus sync za chvíli."
    # httpx výjimky mívají prázdný str() — bez fallbacku by v historii
    # zůstala prázdná hláška (přesně to se dělo s timeouty).
    return str(e).strip() or f"{type(e).__name__} (bez podrobností)"


@router.post("/recategorize")
async def recategorize_transactions(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Recategorize all existing transactions using improved category detection with rules.

    Skips locked transactions (category_locked=True) — manual corrections and
    transfers detected by IBAN matching must survive a bulk recategorize."""
    import json

    result = await db.execute(
        select(TransactionModel).where(
            TransactionModel.user_id == current_user.id,
            TransactionModel.category_locked == False,
        )
    )
    transactions = result.scalars().all()

    updated = 0
    categories_count = {}

    for tx in transactions:
        if tx.account_type == "investment":
            continue

        raw_data = {}
        if tx.raw_json:
            try:
                raw_data = json.loads(tx.raw_json)
            except Exception:
                raw_data = {"remittanceInformationUnstructured": tx.description}
        else:
            raw_data = {"remittanceInformationUnstructured": tx.description}

        new_category = await categorize_transaction_with_rules(raw_data, db, current_user.id)

        if tx.category != new_category:
            tx.category = new_category
            updated += 1

        categories_count[new_category] = categories_count.get(new_category, 0) + 1

    await db.commit()

    return {
        "updated": updated,
        "categories": categories_count
    }



async def notify_after_sync(db: AsyncSession, user_id: int, failed_accounts: list[str]) -> None:
    """Push notifikace po syncu: selhané účty a souhlasy před vypršením.

    Volá se z ručního syncu i (v budoucnu) z automatického — je to jediné
    místo, kde se vyhodnocují 'po syncu' podmínky.
    """
    if failed_accounts:
        names = ", ".join(failed_accounts)
        await send_push_to_user(
            db, user_id,
            title="Sync selhal",
            body=f"Nepodařilo se synchronizovat: {names}. Zkontroluj připojení banky.",
            url="/settings",
        )

    # Souhlasy končící do 7 dnů (nebo už vypršelé) — jednou denně by stačilo,
    # ale sync běží max 4×/den, takže duplicity jsou snesitelné.
    week_ahead = utcnow() + timedelta(days=7)
    result = await db.execute(
        select(AccountModel).where(
            AccountModel.user_id == user_id,
            AccountModel.type == "bank",
            AccountModel.consent_expires_at != None,
            AccountModel.consent_expires_at <= week_ahead,
        )
    )
    for account in result.scalars():
        expired = account.consent_expires_at <= utcnow()
        days_left = max(0, (account.consent_expires_at - utcnow()).days)
        await send_push_to_user(
            db, user_id,
            title="Souhlas banky " + ("vypršel" if expired else "brzy vyprší"),
            body=(
                f"{account.name}: souhlas vypršel — obnov připojení v Nastavení."
                if expired else
                f"{account.name}: souhlas vyprší za {days_left} dní. Obnov ho v Nastavení."
            ),
            url="/settings",
        )


@router.post("/")
async def sync_all_data(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Synchronize all data from external APIs to local database"""

    sync_status = SyncStatusModel(
        user_id=current_user.id,
        started_at=utcnow(),
        status="running"
    )
    db.add(sync_status)
    await db.commit()
    await db.refresh(sync_status)

    accounts_synced = 0
    transactions_synced = 0
    failed_accounts: list[str] = []
    # Per-účtový průběh běhu — ukládá se do sync_status.details_json, aby i na
    # produkci šlo zpětně říct, co přesně se při kterém syncu stalo.
    account_results: list[dict] = []
    run_t0 = time.monotonic()

    # Preload all category rules ONCE so categorization during the sync respects user choices
    # (e.g. "billa → Supermarkets") without N+1 DB roundtrips.
    user_rules_result = await db.execute(
        select(CategoryRuleModel)
        .where(
            CategoryRuleModel.user_id == current_user.id,
            CategoryRuleModel.is_user_defined == True,
        )
        .order_by(*RULE_ORDER)
    )
    preloaded_user_rules = list(user_rules_result.scalars())
    learned_rules_result = await db.execute(
        select(CategoryRuleModel)
        .where(
            CategoryRuleModel.user_id == current_user.id,
            CategoryRuleModel.is_user_defined == False,
        )
        .order_by(*RULE_ORDER)
    )
    preloaded_learned_rules = list(learned_rules_result.scalars())

    # Auto-split rules — new expenses matching a rule get my_share_amount at insert
    share_rules_result = await db.execute(
        select(ShareRuleModel).where(
            ShareRuleModel.user_id == current_user.id,
            ShareRuleModel.is_active == True,
        )
    )
    preloaded_share_rules = list(share_rules_result.scalars())

    try:
        # Sync bank accounts from GoCardless
        try:
            result = await db.execute(
                select(AccountModel).where(
                    AccountModel.user_id == current_user.id,
                    AccountModel.type == "bank",
                )
            )
            bank_accounts = result.scalars().all()

            # Refresh EUA consent expiry before the balance loop — an expired
            # consent 401s the account below, and that is exactly when the UI
            # needs the expiry date to say "reconnect".
            if bank_accounts:
                try:
                    consent_map = await gocardless_service.get_consent_expirations()
                    for account in bank_accounts:
                        if account.id in consent_map:
                            account.consent_expires_at = consent_map[account.id]
                except Exception as e:
                    logger.warning(f"Failed to refresh consent expirations: {e}")

            for account in bank_accounts:
                acc_t0 = time.monotonic()
                try:
                    balances, clean_transactions = await asyncio.gather(
                        gocardless_service.get_account_balances(account.id),
                        gocardless_service.get_account_transactions(account.id),
                    )
                    balance_list = balances.balances or []

                    if balance_list:
                        balance_types = [b.balanceType for b in balance_list]
                        logger.debug(f"Account {account.id} has balance types: {balance_types}")
                        
                        selected_balance = select_balance(balance_list)

                        if selected_balance:
                            amount = float(selected_balance.balanceAmount.amount)
                            currency = selected_balance.balanceAmount.currency
                            logger.info(f"Selected balance for {account.id}: {amount} {currency} ({selected_balance.balanceType})")
                            
                            account.balance = amount
                            account.currency = currency
                            account.last_synced = utcnow()
                        
                    rows_to_upsert = []
                    for tx_data in clean_transactions:
                        tx_id = (
                            tx_data.transactionId or 
                            tx_data.internalTransactionId or 
                            tx_data.entryReference or ""
                        )
                        if not tx_id:
                            continue
                        
                        description = (
                            tx_data.remittanceInformationUnstructured or 
                            tx_data.remittanceInformationStructured or
                            tx_data.creditorName or 
                            tx_data.debtorName or 
                            "Transaction"
                        )
                        
                        tx_dict = tx_data.model_dump(mode="json")

                        tx_amount = float(tx_data.transactionAmount.amount)
                        # Auto-split: a new shared expense (rent, utilities…) gets my
                        # share set right away per the user's share rules.
                        my_share = share_counterparty = share_note = None
                        share_rule = match_share_rule(tx_dict, tx_amount, preloaded_share_rules)
                        if share_rule:
                            my_share = compute_my_share(tx_amount, share_rule)
                            share_counterparty = share_rule.counterparty
                            share_note = share_rule.note
                            share_rule.match_count += 1

                        rows_to_upsert.append({
                            "id": tx_id,
                            "user_id": current_user.id,
                            "account_id": account.id,
                            "date": str(tx_data.bookingDate) if tx_data.bookingDate else "",
                            "description": description,
                            "amount": tx_amount,
                            "currency": tx_data.transactionAmount.currency,
                            "category": categorize_with_preloaded_rules(tx_dict, preloaded_user_rules, preloaded_learned_rules),
                            "account_type": "bank",
                            "transaction_type": "normal",
                            "is_excluded": False,
                            "my_share_amount": my_share,
                            "share_counterparty": share_counterparty,
                            "settlement_note": share_note,
                            "raw_json": json.dumps(tx_dict),
                        })
                    
                    if rows_to_upsert:
                        stmt = pg_insert(TransactionModel).values(rows_to_upsert)
                        stmt = stmt.on_conflict_do_update(
                            index_elements=["id"],
                            set_={
                                "description": stmt.excluded.description,
                                "raw_json": stmt.excluded.raw_json,
                            }
                        )
                        await db.execute(stmt)
                        transactions_synced += len(rows_to_upsert)
                    
                    accounts_synced += 1
                    account.last_sync_error = None
                    account_results.append({
                        "account_id": account.id,
                        "name": account.name,
                        "status": "ok",
                        "transactions": len(rows_to_upsert),
                        "duration_ms": int((time.monotonic() - acc_t0) * 1000),
                    })

                except Exception as inner_e:
                    friendly = _friendly_sync_error(inner_e)
                    logger.error("Sync účtu %s (%s) selhal: %s", account.name, account.id, inner_e)
                    account.last_sync_error = friendly[:500]
                    failed_accounts.append(account.name)
                    account_results.append({
                        "account_id": account.id,
                        "name": account.name,
                        "status": "error",
                        "error": friendly[:500],
                        "duration_ms": int((time.monotonic() - acc_t0) * 1000),
                    })
                    sync_status.error_message = (sync_status.error_message or "") + f"{account.name}: {friendly}; "
                    continue
                    
        except Exception as e:
            logger.warning(f"GoCardless sync skipped: {e}")
            sync_status.error_message = (sync_status.error_message or "") + f"GoCardless: {_friendly_sync_error(e)}; "
            if (isinstance(e, GoCardlessAPIError) and e.status_code == 429) or "429" in str(e):
                raise e
        
        # Sync Trading 212
        t212_t0 = time.monotonic()
        try:
            cash = await trading212_service.get_account_info()
            portfolio = await trading212_service.get_portfolio()

            eur_total_value = cash.get("free", 0) + sum(
                p.get("currentPrice", 0) * p.get("quantity", 0) for p in portfolio
            )
            base_currency = cash.get("currency", "EUR")

            exchange_rate = 1.0
            target_currency = "CZK"

            if base_currency != target_currency:
                exchange_rate = await get_exchange_rate(base_currency, target_currency)

            czk_total_value = eur_total_value * exchange_rate

            # Extract P&L fields from cash endpoint
            # T212 API uses "ppl" for unrealized P&L; "result" may also be present
            invested_eur = float(cash.get("invested", 0) or 0)
            result_eur = float(cash.get("ppl", 0) or cash.get("result", 0) or 0)
            cash_free_eur = float(cash.get("free", 0) or 0)

            logger.info(f"Trading 212: {eur_total_value} {base_currency} -> {czk_total_value} {target_currency} (Rate: {exchange_rate}), invested={invested_eur}, result={result_eur}")

            # Store simplified positions (only fields we need for display)
            simplified_positions = [
                {
                    "ticker": p.get("ticker", ""),
                    "quantity": p.get("quantity", 0),
                    "averagePrice": p.get("averagePrice", 0),
                    "currentPrice": p.get("currentPrice", 0),
                    "ppl": p.get("ppl", 0),
                    "fxPpl": p.get("fxPpl", 0),
                }
                for p in portfolio
            ]

            # Fetch pies with names (detail endpoint needed for name field)
            pies_data = []
            try:
                pies_list = await trading212_service.get_pies()
                if isinstance(pies_list, list):
                    for pie_basic in pies_list:
                        pie_id = pie_basic.get("id")
                        if not pie_id:
                            continue
                        try:
                            detail = await trading212_service.get_pie_detail(pie_id)
                            settings_block = detail.get("settings", {})
                            result_block = pie_basic.get("result", {})
                            pies_data.append({
                                "id": pie_id,
                                "name": settings_block.get("name", f"Pie {pie_id}"),
                                "icon": settings_block.get("icon", ""),
                                "goal": settings_block.get("goal"),
                                "invested_eur": float(result_block.get("priceAvgInvestedValue", 0) or 0),
                                "value_eur": float(result_block.get("priceAvgValue", 0) or 0),
                                "result_eur": float(result_block.get("priceAvgResult", 0) or 0),
                                "result_pct": float(result_block.get("priceAvgResultCoef", 0) or 0) * 100,
                                "instruments": [
                                    {
                                        "ticker": inst.get("ticker", ""),
                                        "current_share": float(inst.get("currentShare", 0) or 0),
                                        "expected_share": float(inst.get("expectedShare", 0) or 0),
                                        "owned_quantity": float(inst.get("ownedQuantity", 0) or 0),
                                        "value_eur": float((inst.get("result") or {}).get("priceAvgValue", 0) or 0),
                                        "result_eur": float((inst.get("result") or {}).get("priceAvgResult", 0) or 0),
                                    }
                                    for inst in detail.get("instruments", [])
                                ],
                            })
                        except Exception as pie_err:
                            logger.warning(f"Could not fetch detail for pie {pie_id}: {pie_err}")
            except Exception as pies_err:
                logger.warning(f"Pies sync skipped: {pies_err}")

            details_payload = json.dumps({
                "cash": cash,
                "positions": simplified_positions,
                "positions_count": len(portfolio),
                "original_currency": base_currency,
                "original_balance": eur_total_value,
                "exchange_rate": exchange_rate,
                "pies": pies_data,
            })

            # Look up by (user, type='investment') so existing user-1 row with
            # id="trading212" keeps working. New users get a user-scoped id.
            t212_result = await db.execute(
                select(AccountModel).where(
                    AccountModel.user_id == current_user.id,
                    AccountModel.type == "investment",
                    AccountModel.institution == "Trading 212",
                )
            )
            t212_account = t212_result.scalar_one_or_none()
            if t212_account:
                t212_account.balance = float(czk_total_value)
                t212_account.currency = target_currency
                t212_account.last_synced = utcnow()
                t212_account.details_json = details_payload
            else:
                t212_account = AccountModel(
                    id=f"trading212-{current_user.id}",
                    user_id=current_user.id,
                    name="Trading 212",
                    type="investment",
                    balance=float(czk_total_value),
                    currency=target_currency,
                    institution="Trading 212",
                    details_json=details_payload,
                    last_synced=utcnow()
                )
                db.add(t212_account)
            t212_account_id = t212_account.id

            # Save daily portfolio snapshot (upsert by user + date)
            try:
                today = utcnow().strftime("%Y-%m-%d")
                snapshot_stmt = pg_insert(PortfolioSnapshotModel).values({
                    "user_id": current_user.id,
                    "snapshot_date": today,
                    "total_value_czk": float(czk_total_value),
                    "invested_czk": invested_eur * exchange_rate,
                    "result_czk": result_eur * exchange_rate,
                    "cash_free_czk": cash_free_eur * exchange_rate,
                    "total_value_eur": eur_total_value,
                    "exchange_rate": exchange_rate,
                    "positions_count": len(portfolio),
                })
                snapshot_stmt = snapshot_stmt.on_conflict_do_update(
                    index_elements=["user_id", "snapshot_date"],
                    set_={
                        "total_value_czk": snapshot_stmt.excluded.total_value_czk,
                        "invested_czk": snapshot_stmt.excluded.invested_czk,
                        "result_czk": snapshot_stmt.excluded.result_czk,
                        "cash_free_czk": snapshot_stmt.excluded.cash_free_czk,
                        "total_value_eur": snapshot_stmt.excluded.total_value_eur,
                        "exchange_rate": snapshot_stmt.excluded.exchange_rate,
                        "positions_count": snapshot_stmt.excluded.positions_count,
                    }
                )
                await db.execute(snapshot_stmt)
                logger.info(f"Portfolio snapshot saved for {today}: {czk_total_value:.0f} CZK")
            except Exception as snap_err:
                logger.warning(f"Portfolio snapshot skipped (table may not exist yet — run migrations): {snap_err}")

            accounts_synced += 1
            
            # Sync orders
            orders = await trading212_service.get_orders(limit=50)
            order_rows = []
            for order in orders.get("items", []):
                # DEFENZIVNÍ OPRAVA ZDE:
                if not order:
                    continue
                    
                order_id = order.get("id", "")
                if not order_id:
                    continue
                
                eur_amount = -float(order.get("fillPrice", 0)) * float(order.get("filledQuantity", 0))
                czk_amount = eur_amount * exchange_rate
                
                order_rows.append({
                    "id": order_id,
                    "user_id": current_user.id,
                    "account_id": t212_account_id,
                    "date": order.get("dateExecuted", order.get("dateCreated", ""))[:10],
                    "description": f"{order.get('type', 'ORDER')} {order.get('ticker', '')} ({eur_amount:.2f} {base_currency})",
                    "amount": czk_amount,
                    "currency": target_currency,
                    "category": "Investment",
                    "account_type": "investment",
                    "transaction_type": "normal",
                    "is_excluded": False,
                    "raw_json": json.dumps(order),
                })
            
            if order_rows:
                stmt = pg_insert(TransactionModel).values(order_rows)
                stmt = stmt.on_conflict_do_update(
                    index_elements=["id"],
                    set_={
                        "description": stmt.excluded.description,
                        "raw_json": stmt.excluded.raw_json,
                    }
                )
                await db.execute(stmt)
                transactions_synced += len(order_rows)
            
            # Sync dividends
            dividends = await trading212_service.get_dividends(limit=50)
            div_rows = []
            for div in dividends.get("items", []):
                # DEFENZIVNÍ OPRAVA ZDE:
                if not div:
                    continue
                    
                div_amount = float(div.get("amount", 0))
                div_currency = div.get("currency", "EUR")
                
                div_rate = exchange_rate
                if div_currency != base_currency and div_currency != target_currency:
                     div_rate = await get_exchange_rate(div_currency, target_currency)
                
                czk_div_amount = div_amount * div_rate
                div_id = f"div_{div.get('reference', '')}"
                
                div_rows.append({
                    "id": div_id,
                    "user_id": current_user.id,
                    "account_id": t212_account_id,
                    "date": div.get("paidOn", "")[:10] if div.get("paidOn") else "",
                    "description": f"Dividend: {div.get('ticker', '')} ({div_amount:.2f} {div_currency})",
                    "amount": czk_div_amount,
                    "currency": target_currency,
                    "category": "Dividend",
                    "account_type": "investment",
                    "transaction_type": "normal",
                    "is_excluded": False,
                    "raw_json": json.dumps(div),
                })
            
            if div_rows:
                stmt = pg_insert(TransactionModel).values(div_rows)
                stmt = stmt.on_conflict_do_update(
                    index_elements=["id"],
                    set_={
                        "description": stmt.excluded.description,
                        "raw_json": stmt.excluded.raw_json,
                    }
                )
                await db.execute(stmt)
                transactions_synced += len(div_rows)

            account_results.append({
                "account_id": t212_account_id,
                "name": "Trading 212",
                "status": "ok",
                "transactions": len(order_rows) + len(div_rows),
                "duration_ms": int((time.monotonic() - t212_t0) * 1000),
            })

        except Exception as e:
            friendly = _friendly_sync_error(e)
            logger.error(f"Trading 212 sync error: {e}")
            account_results.append({
                "account_id": "trading212",
                "name": "Trading 212",
                "status": "error",
                "error": friendly[:500],
                "duration_ms": int((time.monotonic() - t212_t0) * 1000),
            })
            sync_status.error_message = (sync_status.error_message or "") + f"Trading 212: {friendly}; "
        
        sync_status.status = "completed"
        sync_status.completed_at = utcnow()
        sync_status.accounts_synced = accounts_synced
        sync_status.transactions_synced = transactions_synced
        sync_status.details_json = json.dumps({"accounts": account_results})

        await db.commit()

        # Jednořádkový souhrn běhu — dohledatelný textem ("SYNC done") i podle
        # JSON polí (event=sync.done) v Log Analytics / Kibaně.
        logger.info(
            "SYNC done user=%s status=completed accounts_ok=%d failed=%s tx=%d duration=%.1fs",
            current_user.id, accounts_synced, failed_accounts or "[]",
            transactions_synced, time.monotonic() - run_t0,
            extra={
                "event": "sync.done",
                "user_id": current_user.id,
                "sync_result": "completed",
                "accounts_ok": accounts_synced,
                "failed_accounts": failed_accounts,
                "transactions": transactions_synced,
                "duration_s": round(time.monotonic() - run_t0, 1),
            },
        )

        transfer_result = await detect_and_mark_transfers(db, current_user.id)

        # Post-sync notifikace (selhané účty, končící souhlasy) — nesmí shodit sync
        try:
            await notify_after_sync(db, current_user.id, failed_accounts)
        except Exception as notify_e:
            logger.warning(f"Post-sync notifications failed: {notify_e}")

        return {
            "status": "completed",
            "accounts_synced": accounts_synced,
            "transactions_synced": transactions_synced,
            "failed_accounts": failed_accounts,
            "error": sync_status.error_message,
            "marked_internal_transfers": transfer_result["marked_internal"],
            "marked_family_transfers": transfer_result["marked_family"],
            "marked_my_account_transfers": transfer_result["marked_my_account"]
        }

    except Exception as e:
        await db.rollback()
        friendly = _friendly_sync_error(e)
        logger.error(
            "SYNC done user=%s status=failed error=%s duration=%.1fs",
            current_user.id, e, time.monotonic() - run_t0,
            extra={
                "event": "sync.done",
                "user_id": current_user.id,
                "sync_result": "failed",
                "error": str(e),
                "duration_s": round(time.monotonic() - run_t0, 1),
            },
        )

        result = await db.execute(
            select(SyncStatusModel)
            .where(SyncStatusModel.user_id == current_user.id)
            .order_by(SyncStatusModel.id.desc()).limit(1)
        )
        sync_status = result.scalar_one_or_none()

        if sync_status:
            sync_status.status = "failed"
            sync_status.error_message = friendly
            sync_status.completed_at = utcnow()
            sync_status.details_json = json.dumps({"accounts": account_results})
            await db.commit()

        raise HTTPException(status_code=500, detail=friendly)


@router.get("/status")
async def get_sync_status(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the status of the last synchronization"""
    from sqlalchemy import func

    result = await db.execute(
        select(SyncStatusModel)
        .where(SyncStatusModel.user_id == current_user.id)
        .order_by(SyncStatusModel.id.desc()).limit(1)
    )
    sync_status = result.scalar_one_or_none()

    # Count successful syncs today (UTC date)
    today_start = utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    count_result = await db.execute(
        select(func.count()).select_from(SyncStatusModel).where(
            SyncStatusModel.user_id == current_user.id,
            SyncStatusModel.status == "completed",
            SyncStatusModel.started_at >= today_start,
        )
    )
    syncs_today = count_result.scalar() or 0

    if not sync_status:
        return {
            "status": "never",
            "last_sync": None,
            "accounts_synced": 0,
            "transactions_synced": 0,
            "syncs_today": syncs_today,
        }

    return {
        "status": sync_status.status,
        "last_sync": utc_iso(sync_status.completed_at or sync_status.started_at),
        "accounts_synced": sync_status.accounts_synced,
        "transactions_synced": sync_status.transactions_synced,
        "error": sync_status.error_message,
        "syncs_today": syncs_today,
    }


@router.get("/history")
async def get_sync_history(
    limit: int = Query(10, ge=1, le=50),
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Posledních N běhů synchronizace včetně per-účtových výsledků — hlavní
    okno do toho, co se dělo na produkci, bez lezení do Azure logů."""
    result = await db.execute(
        select(SyncStatusModel)
        .where(SyncStatusModel.user_id == current_user.id)
        .order_by(SyncStatusModel.id.desc())
        .limit(limit)
    )
    runs = []
    for run in result.scalars():
        accounts = []
        if run.details_json:
            try:
                accounts = (json.loads(run.details_json) or {}).get("accounts", [])
            except Exception:
                accounts = []
        duration_s = None
        if run.completed_at and run.started_at:
            duration_s = round((run.completed_at - run.started_at).total_seconds(), 1)
        runs.append({
            "id": run.id,
            "started_at": utc_iso(run.started_at),
            "completed_at": utc_iso(run.completed_at),
            "duration_s": duration_s,
            "status": run.status,
            "accounts_synced": run.accounts_synced,
            "transactions_synced": run.transactions_synced,
            "error": run.error_message,
            "accounts": accounts,
        })
    return {"runs": runs}


@router.post("/detect-transfers")
async def detect_transfers(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Manually detect and mark internal transfers and family transfers"""
    result = await detect_and_mark_transfers(db, current_user.id)
    return {
        "status": "completed",
        "marked_internal_transfers": result["marked_internal"],
        "marked_family_transfers": result["marked_family"],
        "marked_my_account_transfers": result["marked_my_account"],
        "unmarked_excluded_accounts": result["unmarked_excluded"],
    }