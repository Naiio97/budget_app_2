import asyncio
from database import async_session_maker
from models import AccountModel
from sqlalchemy import select

async def main():
    async with async_session_maker() as session:
        result = await session.execute(select(AccountModel))
        accounts = result.scalars().all()
        print(f"Found {len(accounts)} accounts:")
        for acc in accounts:
            print(f"- Name: '{acc.name}', Type: '{acc.type}', Institution: '{acc.institution}'")

if __name__ == "__main__":
    asyncio.run(main())
