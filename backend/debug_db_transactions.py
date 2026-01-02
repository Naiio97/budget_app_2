import asyncio
import os
import sys
from dotenv import load_dotenv

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import async_session_maker
from models import TransactionModel
from sqlalchemy import select, func

async def debug_db_transactions():
    print("Checking database transactions...")
    async with async_session_maker() as db:
        # Count all transactions
        result = await db.execute(select(func.count(TransactionModel.id)))
        count = result.scalar()
        print(f"Total Transactions in DB: {count}")
        
        if count > 0:
            # Show last 5
            result = await db.execute(select(TransactionModel).order_by(TransactionModel.date.desc()).limit(5))
            txs = result.scalars().all()
            print("\nLast 5 Transactions:")
            for tx in txs:
                print(f"- [{tx.date}] {tx.description} ({tx.amount} {tx.currency}) ID: {tx.id}")

if __name__ == "__main__":
    load_dotenv()
    asyncio.run(debug_db_transactions())
