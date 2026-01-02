import asyncio
import os
import sys

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from services.exchange_rates import get_exchange_rate

async def verify_rate():
    print("Testing Exchange Rate Service...")
    rate = await get_exchange_rate("EUR", "CZK")
    print(f"EUR -> CZK Rate: {rate}")
    
    if rate > 1.0:
        print("SUCCESS: Rate looks valid (roughly > 20)")
    else:
        print("WARNING: Rate is 1.0 or lower, might be fallback.")

if __name__ == "__main__":
    asyncio.run(verify_rate())
