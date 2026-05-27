"""One-off: move every owned row from one user to another, then delete source.

Use case: bootstrap user (id=1) was seeded by migration 0007 with the default
email 'bootstrap@local'; a real account registered later got a new user_id, so
all the bank/transaction/budget data is still attached to the bootstrap row.
This script merges them.

Usage:
    cd backend
    python scripts/reassign_user_data.py --from 1 --to <your-user-id>

It runs everything in a single transaction; on error nothing is touched.

Idempotency: cleans up rows on the target user that would collide with the
move (categories with the same name, settings with the same key, contacts with
the same iban) BEFORE the UPDATE. The target keeps the source's data — the
target's stub data is dropped.
"""
import argparse
import asyncio
import sys
from pathlib import Path

# Allow running as a top-level script: add backend/ to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from config import get_settings

# Tables that own data per user — same list as in migration 0007/0008.
OWNED_TABLES_SIMPLE: list[str] = [
    "accounts",
    "transactions",
    "sync_status",
    "budgets",
    "savings_goals",
    "category_rules",
    "monthly_budgets",
    "recurring_expenses",
    "manual_accounts",
    "portfolio_snapshots",
    "manual_investment_accounts",
]

# Tables with per-user unique constraints — target rows that would collide
# get deleted first so the UPDATE can proceed.
CONFLICTING_TABLES: dict[str, list[str]] = {
    # table -> columns to match between source and target
    "categories": ["name"],
    "monthly_budgets": ["year_month"],  # also appears in OWNED_TABLES_SIMPLE; that's fine
    "portfolio_snapshots": ["snapshot_date"],
    "settings": ["key"],   # composite PK is (user_id, key)
    "contacts": ["iban"],  # composite PK is (user_id, iban)
}

# Composite-PK tables that aren't in OWNED_TABLES_SIMPLE.
EXTRA_OWNED: list[str] = ["settings", "contacts", "categories"]


async def main(src: int, dst: int) -> None:
    if src == dst:
        print("from and to are the same user_id — nothing to do.")
        return

    engine = create_async_engine(get_settings().database_url)
    async with engine.begin() as conn:
        # Sanity: both users must exist.
        src_row = (await conn.execute(text("SELECT email FROM users WHERE id = :id"), {"id": src})).first()
        dst_row = (await conn.execute(text("SELECT email FROM users WHERE id = :id"), {"id": dst})).first()
        if src_row is None:
            raise SystemExit(f"Source user_id={src} does not exist.")
        if dst_row is None:
            raise SystemExit(f"Target user_id={dst} does not exist.")
        print(f"Source: id={src} email={src_row[0]}")
        print(f"Target: id={dst} email={dst_row[0]}")

        # 1) Drop target rows that would violate per-user uniques after the move.
        for table, cols in CONFLICTING_TABLES.items():
            col_list = ", ".join(cols)
            # Delete target rows whose (cols) match a source row's (cols).
            sql = text(f"""
                DELETE FROM {table}
                WHERE user_id = :dst
                  AND ({col_list}) IN (
                    SELECT {col_list} FROM {table} WHERE user_id = :src
                  )
            """)
            res = await conn.execute(sql, {"src": src, "dst": dst})
            print(f"  cleared {res.rowcount or 0} conflicting rows from {table}")

        # 2) Move every owned row.
        total = 0
        all_tables = sorted(set(OWNED_TABLES_SIMPLE) | set(EXTRA_OWNED) | set(CONFLICTING_TABLES))
        for table in all_tables:
            res = await conn.execute(
                text(f"UPDATE {table} SET user_id = :dst WHERE user_id = :src"),
                {"src": src, "dst": dst},
            )
            moved = res.rowcount or 0
            total += moved
            if moved:
                print(f"  moved {moved} rows: {table}")

        # 3) Drop the source user.
        await conn.execute(text("DELETE FROM users WHERE id = :id"), {"id": src})
        print(f"Deleted user id={src}.")
        print(f"Total rows moved: {total}")

    await engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--from", dest="src", type=int, required=True, help="Source user_id (data will be moved off this user)")
    parser.add_argument("--to", dest="dst", type=int, required=True, help="Target user_id (data will be moved onto this user)")
    args = parser.parse_args()
    asyncio.run(main(args.src, args.dst))
