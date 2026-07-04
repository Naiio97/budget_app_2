"""Pytest bootstrap.

Testy importují routery (→ auth → database → config.Settings). `database_url`
je v Settings povinné a čte se z .env, které v CI neexistuje — bez něj padá
už sběr testů na ValidationError. Nastavíme neškodné dummy DATABASE_URL dřív,
než se cokoli naimportuje. Engine se z něj vytváří líně, takže se nikdy
nepřipojuje — čisté (pure-function) testy DB nepotřebují. `setdefault`
nepřepíše skutečnou hodnotu v lokálním vývoji.
"""
import os

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://test:test@localhost:5432/test",
)
