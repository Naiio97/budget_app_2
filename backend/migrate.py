import sqlite3
import asyncio
import os
from dotenv import load_dotenv
import asyncpg

# Načtení spojení na Postgres z .env
load_dotenv()
POSTGRES_URL = os.getenv("DATABASE_URL").replace("+asyncpg", "") # asyncpg nepotřebuje ten prefix

async def migrate_data():
    print("Zahajuji ETL Pipeline...")

    # 1. EXTRACT: Připojení k SQLite
    con = sqlite3.connect('budget.db')
    cur = con.cursor()
    accounts = cur.execute("SELECT * FROM accounts")

    sqlite_accounts = [] # Sem ulož data ze SQLite
    sqlite_accounts.append(accounts)
    
    print(f"Vytěženo {len(sqlite_accounts)} účtů ze SQLite.")

    # 2. TRANSFORM & LOAD: Připojení k Postgresu
    conn = await asyncpg.connect(POSTGRES_URL)
    
    try:
        for account in sqlite_accounts:
            # TODO: Tady musíš data z account (což je n-tice ze SQLite) 
            # rozebrat a případně přeložit (např. 1/0 na True/False)
            
            # TODO: Napiš SQL dotaz (INSERT INTO...), který data vloží do Postgresu
            # await conn.execute("INSERT INTO manualaccountmodel (...) VALUES ($1, $2...)", hodnota1, hodnota2)
            pass
            
        print("Migrace úspěšně dokončena.")
    except Exception as e:
        print(f"Kritická chyba při nahrávání: {e}")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(migrate_data())