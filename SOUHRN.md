# Souhrn — co je nového a co plánujeme

> Kontextový dokument pro nový chat. Stav k 2026-07-04.
> Roadmapa a detaily návrhů: [VYLEPSENI.md](VYLEPSENI.md). Návod na notifikace: [NOTIFIKACE.md](NOTIFIKACE.md).

## Co jsme udělali (2.–4. 7. 2026)

### Opravy zůstatků a souhlasy bank (PR #34, #36)
- **Správný typ zůstatku z GoCardless**: ČS neposílá `interimAvailable`, jen `expected`
  + `closingBooked` — appka ukazovala zaúčtovaný zůstatek bez čekajících plateb.
  Sdílený `select_balance()` v `services/gocardless.py` (priorita interimAvailable →
  expected → closingBooked → …).
- **Sledování platnosti souhlasu (EUA)**: sloupec `accounts.consent_expires_at`
  (migrace 0012), obnovuje se při každém syncu (před stahováním zůstatků — funguje
  i pro účet, co 401kuje) a při (re)connectu. UI: text platnosti v Nastavení
  („Souhlas platí ještě X dní"), tlačítko **Obnovit**, badge v panelu účtů.
- **Odolný connect callback**: selhání zůstatků/detailů (např. denní rate limit GC)
  už neshodí celý callback — obnovený souhlas se uloží vždy.

### Settlement modul (PR #38 — Nicolas + nav fix)
- Sdílené náklady & vypořádání (VYLEPSENI 3.1 MVP + fáze 2): `my_share_amount`,
  `settlement_flag`, share_rules, stránka `/vyporadani`, migrace 0013/0014.
- Oprava navbaru: appbar filtruje jen Nastavení místo `slice(0, 8)` (Vypořádání se
  uřezávalo), vrácená ikona předplatného, handshake ikona pro /vyporadani.

### UI sjednocení a přizpůsobení (PR #39)
- **Čárové ikony kategorií** (`lib/category-icons.tsx`): emoji z DB se při renderu
  překládají na monochromatické stroke ikony (stejný jazyk jako menu) — bez migrace
  dat; výběr ikony v Nastavení nabízí pojmenované ikony a ukládá klíče.
- **Přizpůsobitelné menu** (`lib/nav-preferences.ts`): každá stránka jde dát do
  hlavního menu / rychlých akcí / skrýt. Nastavení → záložka **Menu**. Uloženo
  v localStorage (jako téma), projevuje se okamžitě (useSyncExternalStore).

### Kategorizace do DB — VYLEPSENI 4.8 (PR #40)
- ~230 klíčových slov přesunuto z kódu do `category_rules` jako výchozí pravidla
  (`is_builtin`, migrace 0015, seed při registraci uživatele). Spravovatelné z UI.
- Engine: user rules → purposeCode → MCC → learned+builtin (tie-break delší pattern).
- Opraveny footguny: „plat" (substring „platba" → falešné Salary), chybějící
  „dame jidlo" bez diakritiky.

### Tagy — VYLEPSENI 4.7 (PR #41)
- Volné štítky napříč kategoriemi („dovolená 2026"): tabulky `tags` +
  `transaction_tags` (migrace 0016), M:N.
- Detail transakce: picker tagů + vytvoření inline; barevné `#tagy` v seznamu;
  filtr podle tagu + souhrn „kolik stál projekt" (počítá `my_share_amount`,
  přeskakuje převody/vypořádání); správa v Nastavení → Kategorie.

### Zdraví syncu + push notifikace (PR #42)
- Poučení z 10denního tichého výpadku Airu: `accounts.last_sync_error`
  (migrace 0017) — badge **„sync selhává"** v panelu/menu/Nastavení, ruční sync
  hlásí selhané účty; vrácen `consent_expires_at` do dashboard payloadu
  (ztratil se při fe_bugs merge).
- **Web push (PWA)**: `push_subscriptions`, pywebpush + VAPID, `/notifications`
  endpointy, push handler v sw.js, karta Notifikace v Nastavení → Pokročilé.
- `notify_after_sync()`: po syncu pushne selhané účty a souhlasy končící do 7 dní.
  Stejný hook použije budoucí automatický sync.

## Stav infrastruktury

- Migrace: řetěz po **0017** (aplikují se samy při startu kontejneru na Azure).
- **⏳ Čeká na Nicolase**: nastavit `VAPID_PRIVATE_KEY/PUBLIC_KEY/SUBJECT` na Azure
  backend Container App (návod v NOTIFIKACE.md) a zapnout notifikace na zařízeních.
- Dev: Docker Postgres `localhost:5432` (user `nicolas`), backend venv
  `backend/venv`, uvicorn `--reload` na :8000, frontend `npm run dev` na :3000.
  Service worker je na localhostu záměrně vypnutý.

## Co plánujeme

1. **AI — ML kategorizace (VYLEPSENI 3.3 Fáze A)** — dělat **společně, interaktivně**
   (Nicolas si chce osahat devops část): samostatný `ai-service` FastAPI kontejner,
   workflow `deploy-ai.yml` po vzoru deploy-backend, interní síť Container Apps.
   Trénovací data = ruční opravy kategorií (po 4.8 čistě v DB).
2. **Automatický sync na pozadí** — Nicolas si implementuje **sám** (Azure Container
   Apps Jobs / cron). Notifikace po syncu už na to čekají (`notify_after_sync`).
3. K zvážení (zatím nerozhodnuto): automatické zálohy DB do Blob Storage,
   bezpečnostní review (VYLEPSENI 4.9), trend utrácení v budgetech (4.4),
   globální hledání Cmd+K, roční přehled „Spending Wrapped".
4. Odloženo/nechceme: export dat (4.2), kalendář cashflow (4.5).

## Poznámky pro nový chat

- Commity dělat malé a tematické, zprávy anglicky `typ(oblast): popis`.
- PR do mainu přes `gh pr create`; merge až po odsouhlasení Nicolasem
  (občas mergne sám, občas řekne „merge").
- Deploy: push do mainu → GitHub Actions → Azure Container Apps
  (frontend/backend zvlášť, filtrované podle cest).
- Před commitem: `npx tsc --noEmit` + `npm run lint` (frontend),
  import check + ideálně ASGI test (backend). Produkční `npm run build`
  u větších FE změn (chytá chyby, co dev režim nechytí — viz PR #36).
