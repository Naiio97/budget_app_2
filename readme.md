# Budget app

Aplikace pro přehled rozpočtu a portfolia. Kontejnerizovaná v Dockeru, využívá FastAPI, běží v Azure, deployment probíhá přes GitHub Actions.

## Stack

### Frontend
- Next.js
- Node.js
- TypeScript

### Backend
- Python
- FastAPI
- Uvicorn

### Database
- PostgreSQL

### Infrastructure
- Docker
- Azure Container Apps
- Azure Container Registry
- GitHub Actions

### External API
- GoCardless - Načítání dat z bankovních účtů.
- Trading 212 - Načítání dat z investičního portfolia.

## Architektura
Aplikace se skládá z dvou Azure Container Apps - jedné pro FE a druhé pro BE, dále Azure Database for PostgreSQL (managed service). Images přicházejí z Azure Container Registry. FE využívá Next.js a TypeScript, JavaScript běží v prohlížeči u klienta, kontejner servíruje statická data. Prohlížeč volá BE kontejner a ten následně komunikuje na DB. Jak FE tak BE má ingress vystavený ven, na DB vidí pouze BE.

```mermaid
graph TD
   Browser[Browser klienta]
   FE[FE Container App<br/>Next.js]
   BE[BE Container App<br/>FastAPI]
   DB[(Azure Database<br/>for PostgreSQL)]
   ACR[Azure Container<br/>Registry]

   Browser -->|stáhne statická data| FE
   Browser -->|API calls| BE
   BE -->|SQL queries| DB
   ACR -.->|pull image| FE
   ACR -.->|pull image| BE
```
## CI/CD Pipeline
Deploy aplikace je plně automatizovaný přes GitHub Actions. Máme 3 soubory, které se nachází v /.github/workflows - ci.yml, deploy-backend.yml a deploy-frontend.yml

### Test 
ci.yml - pouští se na základě změny BE nebo FE a zároveň při pull requestu. Pokud vše proběhne bez chyb, je umožněn merge do main, v opačném případě nejsme schopní pokračovat a je potřeba chyby opravit.

### Deploy
deploy-backend.yml a deploy-frontend.yml - obsahují pouze jeden job. Vytvoří server Ubuntu a stáhne aktuální repozitář. Následně se přihlásí do Azure pomocí Azure credentials, které jsou definované v GitHub Action secrets, následně se přihlásí do ACR. Opět uloženo v secrets. Zde už se dostáváme k Docker Buildu u FE přidáváme url BE, kterou má JavaScript v prohlížeči klienta volat. Potom přichází docker push a následuje deploy Azure Container App. Kde BE má navíc explicitně definovaný port a ingress vystavený do internetu. FE je dostupný defaultně.

## Live Demo
[Budget App](https://budget-frontend.redfield-d4fd3af1.westeurope.azurecontainerapps.io)

> ⚠️ První načtení může trvat déle – kontejnery i databáze se při neaktivitě uspávají (scale-to-zero) a probouzejí se na první request

## DEV Setup

### Prerequisites 
- Node.js 22
- Python 3.12
- PostgreSQL 18.3

### Clone
git clone https://github.com/Naiio97/budget_app_2.git

### ENV BE
- GOCARDLESS_SECRET_ID - získám zde https://developer.gocardless.com/bank-account-data/quick-start-guide/
- GOCARDLESS_SECRET_KEY - získám zde https://developer.gocardless.com/bank-account-data/quick-start-guide/
- TRADING212_API_KEY - https://docs.trading212.com/api
- POSTGRES_USER - Vytvořit uživatele
- POSTGRES_PASSWORD - Vytvořit heslo
- POSTGRES_DB - Název DB
- DATABASE_URL - postgresql+asyncpg://user:password@localhost:5432/dbname
- AUTH_SECRET - libovolný silný náhodný string pro podepisování session tokenů (min. 32 znaků)

### ENV FE
- AUTH_SECRET - libovolný silný náhodný string pro podepisování session tokenů (min. 32 znaků)
- AUTH_GOOGLE_ID - https://console.cloud.google.com/auth/clients
- AUTH_GOOGLE_SECRET - https://console.cloud.google.com/auth/clients

### DB setup 
Nainstalovanou DB lokálně ,při prvním nastavení se vše automaticky nastaví.

### Spuštění BE
1) cd backend
2) python3 -m venv venv
3) source venv/bin/activate
4) pip install -r requirements.txt
5) Připravit env s požadovnými hodnotami. API kliče a konfigurace DB viz. example.
6) python3 -m uvicorn main:app --reload --port 8000

### Spuštění FE
1) cd frontend
2) Připravit env s požadovnými hodnotami viz. example.
3) npm install
4) npm run dev