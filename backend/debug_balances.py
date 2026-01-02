import asyncio
import os
import sys
from dotenv import load_dotenv

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import async_session_maker
from models import AccountModel
from services.gocardless import gocardless_service
from sqlalchemy import select

async def debug_balances():
    print("Starting debug_balances...")
    async with async_session_maker() as db:
        result = await db.execute(select(AccountModel).where(AccountModel.type == "bank"))
        accounts = result.scalars().all()
        
        print(f"Found {len(accounts)} bank accounts.")
        
        for account in accounts:
            print(f"\n--- Account: {account.name} ({account.id}) ---")
            try:
                balances = await gocardless_service.get_account_balances(account.id)
                balance_list = balances.get("balances", [])
                
                if not balance_list:
                    print("No balances returned.")
                else:
                    for i, b in enumerate(balance_list):
                        amount = b.get("balanceAmount", {}).get("amount")
                        currency = b.get("balanceAmount", {}).get("currency")
                        b_type = b.get("balanceType")
                        ref_date = b.get("referenceDate")
                        print(f"  [{i}] Type: {b_type:<20} Amount: {amount} {currency} (Date: {ref_date})")
                        
            except Exception as e:
                print(f"Error fetching balance: {e}")

if __name__ == "__main__":
    load_dotenv()
    asyncio.run(debug_balances())
