FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1

# 1. Vytvoření systémového uživatele a skupiny (bezpečnostní standard)
RUN addgroup --system appuser && adduser --system --group appuser

WORKDIR /app

# Instalace curl pro healthchecky
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# 2. Instalace závislostí (optimalizace cache)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 3. Kopírování zbytku kódu
COPY . .

# 4. Předání vlastnictví složky našemu novému uživateli
RUN chown -R appuser:appuser /app

# 5. PŘEPNUTÍ: Od tohoto řádku dál (včetně CMD) už neběžíme jako root
USER appuser

CMD ["sh", "-c", "alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port 8000"]