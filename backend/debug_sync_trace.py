import asyncio
import os
import sys
import json
import traceback
from datetime import datetime
from dotenv import load_dotenv

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import async_session_maker
from models import AccountModel, TransactionModel
from services.gocardless import gocardless_service
from sqlalchemy import select, delete

def categorize_transaction(tx: dict) -> str:
    try:
        desc = (tx.get("remittanceInformationUnstructured", "") or 
                tx.get("creditorName", "") or 
                tx.get("debtorName", "") or "").lower()
        
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
    except Exception as e:
        print(f"Error in categorize: {e}")
        return "Other"

async def debug_sync_trace():
    print("Starting debug_sync_trace...")
    async with async_session_maker() as db:
        try:
            # 1. Get Accounts
            result = await db.execute(select(AccountModel).where(AccountModel.type == "bank"))
            bank_accounts = result.scalars().all()
            print(f"Found {len(bank_accounts)} accounts.")
            
            for account in bank_accounts:
                print(f"Processing account: {account.name}")
                
                # 2. Fetch Transactions
                print("Fetching transactions...")
                transactions = await gocardless_service.get_account_transactions(account.id)
                booked = transactions.get("transactions", {}).get("booked", [])
                print(f"Got {len(booked)} booked transactions.")
                
                count = 0
                for tx_data in booked:
                    try:
                        # 3. Extract ID
                        tx_id = (
                            tx_data.get("transactionId") or 
                            tx_data.get("internalTransactionId") or 
                            tx_data.get("entryReference", "")
                        )
                        if not tx_id:
                            print("Skipping - No ID")
                            continue
                            
                        # 4. Extract Data
                        amount_val = float(tx_data.get("transactionAmount", {}).get("amount", 0))
                        currency_val = tx_data.get("transactionAmount", {}).get("currency", "CZK")
                        date_val = tx_data.get("bookingDate", "")
                        
                        description = (
                            tx_data.get("remittanceInformationUnstructured") or 
                            tx_data.get("remittanceInformationStructured") or
                            tx_data.get("creditorName") or 
                            tx_data.get("debtorName") or 
                            "Transaction"
                        )
                        
                        # 5. Create Model (Simulated)
                        cat = categorize_transaction(tx_data)
                        print(f"Preparing TX {tx_id}: {amount_val} {currency_val} ({cat})")
                        
                        # In real sync we would add to DB, but here let's valid attributes
                        tx = TransactionModel(
                            id=tx_id,
                            account_id=account.id,
                            date=date_val,
                            description=description,
                            amount=amount_val,
                            currency=currency_val,
                            category=cat,
                            account_type="bank",
                            raw_json=json.dumps(tx_data)
                        )
                        
                        # Try adding to session to check for constraint errors
                        db.add(tx)
                        count += 1
                        
                    except Exception as e:
                        print(f"FAILED to process transaction: {e}")
                        traceback.print_exc()
                        
                print(f"Successfully processed {count} transactions for this account.")
                
            # Try commit
            print("Attempting to commit...")
            await db.commit()
            print("Commit successful!")
            
        except Exception as e:
            print(f"Global sync error: {e}")
            traceback.print_exc()

if __name__ == "__main__":
    load_dotenv()
    asyncio.run(debug_sync_trace())
