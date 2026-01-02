import asyncio
import os
import sys
import json
from dotenv import load_dotenv

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import async_session_maker
from models import AccountModel
from services.gocardless import gocardless_service
from sqlalchemy import select

async def debug_transactions():
    print("Starting debug_transactions...")
    async with async_session_maker() as db:
        result = await db.execute(select(AccountModel).where(AccountModel.type == "bank"))
        accounts = result.scalars().all()
        
        print(f"Found {len(accounts)} bank accounts.")
        
        for account in accounts:
            print(f"\n--- Account: {account.name} ({account.id}) ---")
            try:
                # Assuming default 90 days lookback or whatever service default is
                transactions = await gocardless_service.get_account_transactions(account.id)
                
                print("Raw Response Keys:", transactions.keys())
                
                booked = transactions.get("transactions", {}).get("booked", [])
                pending = transactions.get("transactions", {}).get("pending", [])
                
                print(f"Booked Transactions: {len(booked)}")
                print(f"Pending Transactions: {len(pending)}")
                
                if booked:
                    print("\nSample Booked Transaction:")
                    print(json.dumps(booked[0], indent=2, ensure_ascii=False))
                
                if pending:
                    print("\nSample Pending Transaction:")
                    print(json.dumps(pending[0], indent=2, ensure_ascii=False))
                    
            except Exception as e:
                print(f"Error fetching transactions: {e}")

if __name__ == "__main__":
    load_dotenv()
    asyncio.run(debug_transactions())
