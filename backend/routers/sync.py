from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from datetime import datetime
import json

from database import get_db
from models import AccountModel, TransactionModel, SyncStatusModel
from services.gocardless import gocardless_service
from services.trading212 import trading212_service
from services.exchange_rates import get_exchange_rate

router = APIRouter()


def categorize_transaction(tx: dict) -> str:
    """Simple category detection based on description"""
    desc = (tx.get("remittanceInformationUnstructured", "") or 
            tx.get("creditorName", "") or 
            tx.get("debtorName", "")).lower()
    
    categories = {
        "food": ["lidl", "albert", "tesco", "billa", "kaufland", "restaurant", "bistro", "food"],
        "transport": ["uber", "bolt", "benzina", "orlen", "mhd", "jízdenka", "prague transport"],
        "utilities": ["čez", "pražské vodovody", "innogy", "vodafone", "t-mobile", "o2"],
        "entertainment": ["netflix", "spotify", "cinema", "hbo", "disney"],
        "shopping": ["amazon", "alza", "mall.cz", "czc", "datart"],
        "salary": ["mzda", "plat", "salary", "výplata"],
    }
    
    for category, keywords in categories.items():
        if any(kw in desc for kw in keywords):
            return category.capitalize()
    
    return "Other"


@router.post("/")
async def sync_all_data(db: AsyncSession = Depends(get_db)):
    """Synchronize all data from external APIs to local database"""
    
    # Create sync status record
    sync_status = SyncStatusModel(
        started_at=datetime.utcnow(),
        status="running"
    )
    db.add(sync_status)
    await db.commit()
    await db.refresh(sync_status)
    
    accounts_synced = 0
    transactions_synced = 0
    
    try:
        # Clear existing transactions (fresh sync)
        await db.execute(delete(TransactionModel))
        await db.commit()  # Commit the delete before adding new transactions
        
        # Sync bank accounts from GoCardless
        # Sync bank accounts from GoCardless
        try:
            # Get connected bank accounts from DB
            result = await db.execute(select(AccountModel).where(AccountModel.type == "bank"))
            bank_accounts = result.scalars().all()
            
            for account in bank_accounts:
                try:
                    # Sync Balance
                    balances = await gocardless_service.get_account_balances(account.id)
                    balance_list = balances.get("balances", [])
                    
                    if balance_list:
                        # Log available balance types for debugging
                        balance_types = [b.get("balanceType") for b in balance_list]
                        print(f"Account {account.id} has balance types: {balance_types}")
                        
                        # Smart selection login
                        selected_balance = None
                        
                        # 1. Try interimAvailable (what you verify usually see in bank app)
                        selected_balance = next((b for b in balance_list if b.get("balanceType") == "interimAvailable"), None)
                        
                        # 2. Try closingBooked (confirmed balance)
                        if not selected_balance:
                            selected_balance = next((b for b in balance_list if b.get("balanceType") == "closingBooked"), None)
                            
                        # 3. Try interimBooked
                        if not selected_balance:
                            selected_balance = next((b for b in balance_list if b.get("balanceType") == "interimBooked"), None)
                            
                        # 4. Try openingBooked
                        if not selected_balance:
                             selected_balance = next((b for b in balance_list if b.get("balanceType") == "openingBooked"), None)
                             
                        # 5. Fallback to first one
                        if not selected_balance:
                            selected_balance = balance_list[0]
                            
                        if selected_balance:
                            amount = float(selected_balance["balanceAmount"]["amount"])
                            currency = selected_balance["balanceAmount"]["currency"]
                            print(f"Selected balance for {account.id}: {amount} {currency} ({selected_balance.get('balanceType')})")
                            
                            account.balance = amount
                            account.currency = currency
                            account.last_synced = datetime.utcnow()
                        
                    # Sync Transactions (last 90 days)
                    transactions = await gocardless_service.get_account_transactions(account.id)
                    
                    # Process booked transactions
                    for tx_data in transactions.get("transactions", {}).get("booked", []):
                        tx_id = (
                            tx_data.get("transactionId") or 
                            tx_data.get("internalTransactionId") or 
                            tx_data.get("entryReference", "")
                        )
                        if not tx_id:
                            continue
                            
                        amount_val = float(tx_data.get("transactionAmount", {}).get("amount", 0))
                        currency_val = tx_data.get("transactionAmount", {}).get("currency", "CZK")
                        date_val = tx_data.get("bookingDate", "")
                        
                        # Description fallback chain
                        description = (
                            tx_data.get("remittanceInformationUnstructured") or 
                            tx_data.get("remittanceInformationStructured") or
                            tx_data.get("creditorName") or 
                            tx_data.get("debtorName") or 
                            "Transaction"
                        )
                        
                        tx = TransactionModel(
                            id=tx_id,
                            account_id=account.id,
                            date=date_val,
                            description=description,
                            amount=amount_val,
                            currency=currency_val,
                            category=categorize_transaction(tx_data),
                            account_type="bank",
                            raw_json=json.dumps(tx_data)
                        )
                        await db.merge(tx)  # Use merge to handle duplicates
                        transactions_synced += 1
                        
                    accounts_synced += 1
                    
                except Exception as inner_e:
                    error_msg = f"Failed to sync account {account.id}: {str(inner_e)}"
                    print(error_msg)
                    sync_status.error_message = (sync_status.error_message or "") + error_msg + "; "
                    # Do not raise, just continue to try other accounts
                    continue
                    
        except Exception as e:
            print(f"GoCardless sync skipped: {e}")
            sync_status.error_message = (sync_status.error_message or "") + f"GoCardless Error: {str(e)}; "
            if "429" in str(e):
                 raise e
        
        # Sync Trading 212
        try:
            cash = await trading212_service.get_account_info()
            portfolio = await trading212_service.get_portfolio()
            
            # Calculate total value in original currency (usually EUR)
            eur_total_value = cash.get("free", 0) + sum(
                p.get("currentPrice", 0) * p.get("quantity", 0) for p in portfolio
            )
            base_currency = cash.get("currency", "EUR")
            
            # Get exchange rate to CZK
            exchange_rate = 1.0
            target_currency = "CZK"
            
            if base_currency != target_currency:
                exchange_rate = await get_exchange_rate(base_currency, target_currency)
            
            # Convert total value
            czk_total_value = eur_total_value * exchange_rate
            
            print(f"Trading 212: {eur_total_value} {base_currency} -> {czk_total_value} {target_currency} (Rate: {exchange_rate})")
            
            # Upsert Trading 212 account
            t212_account = await db.get(AccountModel, "trading212")
            if t212_account:
                t212_account.balance = float(czk_total_value)
                t212_account.currency = target_currency
                t212_account.last_synced = datetime.utcnow()
                t212_account.details_json = json.dumps({
                    "cash": cash, 
                    "positions": len(portfolio),
                    "original_currency": base_currency,
                    "original_balance": eur_total_value,
                    "exchange_rate": exchange_rate
                })
            else:
                t212_account = AccountModel(
                    id="trading212",
                    name="Trading 212",
                    type="investment",
                    balance=float(czk_total_value),
                    currency=target_currency,
                    institution="Trading 212",
                    details_json=json.dumps({
                        "cash": cash,
                        "original_currency": base_currency,
                        "original_balance": eur_total_value,
                        "exchange_rate": exchange_rate
                    }),
                    last_synced=datetime.utcnow()
                )
                db.add(t212_account)
            
            accounts_synced += 1
            
            # Sync orders as transactions
            orders = await trading212_service.get_orders(limit=100)
            for order in orders.get("items", []):
                # Calculate amount in original currency
                eur_amount = -float(order.get("fillPrice", 0)) * float(order.get("filledQuantity", 0))
                
                # Convert to CZK
                czk_amount = eur_amount * exchange_rate
                
                tx = TransactionModel(
                    id=order.get("id", ""),
                    account_id="trading212",
                    date=order.get("dateExecuted", order.get("dateCreated", ""))[:10],
                    description=f"{order.get('type', 'ORDER')} {order.get('ticker', '')} ({eur_amount:.2f} {base_currency})",
                    amount=czk_amount,
                    currency=target_currency,
                    category="Investment",
                    account_type="investment",
                    raw_json=json.dumps(order)
                )
                await db.merge(tx)  # Use merge to handle duplicates
                transactions_synced += 1
            
            # Sync dividends
            dividends = await trading212_service.get_dividends(limit=100)
            for div in dividends.get("items", []):
                div_amount = float(div.get("amount", 0))
                div_currency = div.get("currency", "EUR")
                
                # Convert if needed (dividends might be in USD etc, but for simplicity assuming base account currency or using same rate if EUR)
                # Ideally we should fetch rate for div_currency -> CZK if different
                div_rate = exchange_rate
                if div_currency != base_currency and div_currency != target_currency:
                     div_rate = await get_exchange_rate(div_currency, target_currency)
                
                czk_div_amount = div_amount * div_rate
                
                tx = TransactionModel(
                    id=f"div_{div.get('reference', '')}",
                    account_id="trading212",
                    date=div.get("paidOn", "")[:10] if div.get("paidOn") else "",
                    description=f"Dividend: {div.get('ticker', '')} ({div_amount:.2f} {div_currency})",
                    amount=czk_div_amount,
                    currency=target_currency,
                    category="Dividend",
                    account_type="investment",
                    raw_json=json.dumps(div)
                )
                await db.merge(tx)  # Use merge to handle duplicates
                transactions_synced += 1
                
        except Exception as e:
            print(f"Trading 212 sync error: {e}")
        
        # Update sync status
        sync_status.status = "completed"
        sync_status.completed_at = datetime.utcnow()
        sync_status.accounts_synced = accounts_synced
        sync_status.transactions_synced = transactions_synced
        
        await db.commit()
        
        return {
            "status": "completed",
            "accounts_synced": accounts_synced,
            "transactions_synced": transactions_synced
        }
        
    except Exception as e:
        # Rollback any pending transaction before updating status
        await db.rollback()
        
        # Re-fetch sync_status after rollback (it may be detached)
        result = await db.execute(
            select(SyncStatusModel).order_by(SyncStatusModel.id.desc()).limit(1)
        )
        sync_status = result.scalar_one_or_none()
        
        if sync_status:
            sync_status.status = "failed"
            sync_status.error_message = str(e)
            sync_status.completed_at = datetime.utcnow()
            await db.commit()
        
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status")
async def get_sync_status(db: AsyncSession = Depends(get_db)):
    """Get the status of the last synchronization"""
    result = await db.execute(
        select(SyncStatusModel).order_by(SyncStatusModel.id.desc()).limit(1)
    )
    sync_status = result.scalar_one_or_none()
    
    if not sync_status:
        return {
            "status": "never",
            "last_sync": None,
            "accounts_synced": 0,
            "transactions_synced": 0
        }
    
    return {
        "status": sync_status.status,
        "last_sync": sync_status.completed_at.isoformat() if sync_status.completed_at else sync_status.started_at.isoformat(),
        "accounts_synced": sync_status.accounts_synced,
        "transactions_synced": sync_status.transactions_synced,
        "error": sync_status.error_message
    }
