import sqlite3
import asyncio
import os
from dotenv import load_dotenv
import asyncpg
from datetime import datetime

# Načtení spojení na Postgres z .env
load_dotenv()
POSTGRES_URL = os.getenv("DATABASE_URL").replace("+asyncpg", "")
print(POSTGRES_URL)

async def migrate_data():
    print("Zahajuji ETL Pipeline...")

    con = None
    conn = None

    try:
        # 1. EXTRACT: Stažení surových dat do paměti
        # Používáme absolutní cestu, jak jsi měl původně
        con = sqlite3.connect('/mnt/c/Users/uzivatel/Documents/budget_app_2/backend/budget.db')
        cur = con.cursor()
        
        # Surová data vytáhneme jedním dotazem
        cur.execute("SELECT id, name, type, balance, currency, institution, details_json, last_synced, is_visible FROM accounts")
        sqlite_accounts = cur.fetchall()
        print(f"Vytěženo {len(sqlite_accounts)} účtů ze SQLite.")

        # 2. TRANSFORM: Očištění a typová konverze v paměti Pythonu
        print("Transformuji data...")
        # Všechna data transformujeme najednou předtím, než vůbec sáhneme na novou DB
        transformed_accounts = [
            (
                acc[0], acc[1], acc[2], acc[3], acc[4], acc[5], acc[6],
                datetime.fromisoformat(acc[7]), # Zásah skalpelem na formát času
                bool(acc[8])                    # Nativní a čistý převod 1/0 na True/False
            )
            for acc in sqlite_accounts
        ]

        # 3. LOAD: Dávkový zápis čistých dat
        local_postgres_url = POSTGRES_URL.replace("@db:", "@localhost:")
        print(f"Připojuji se do Postgresu na: {local_postgres_url}")
        
        conn = await asyncpg.connect(local_postgres_url)
        
        # Zásadní změna: executemany posílá vše v jedné síťové transakci
        await conn.executemany(
            "INSERT INTO accounts (id, name, type, balance, currency, institution, details_json, last_synced, is_visible) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
            transformed_accounts
        )
        print("Migrace úspěšně dokončena.")

    except Exception as e:
        print(f"Kritická chyba v ETL procesu: {e}")
        
    finally:
        # Úklid zdrojů je absolutní nutnost, jinak vznikají memory leaky a visící spojení
        if conn:
            await conn.close()
            print("Postgres spojení uzavřeno.")
        if con:
            con.close()
            print("SQLite spojení uzavřeno.")

if __name__ == "__main__":
    asyncio.run(migrate_data())