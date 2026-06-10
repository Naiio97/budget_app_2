# Vylepšení aplikace – analýza a roadmapa

> Pracovní dokument. Vznikl jako detailní analýza současného stavu aplikace + návrh nových
> funkcionalit. Část nápadů pochází od uživatele (sekce „Nápady od tebe"), část je návrh
> nad rámec (sekce „Další návrhy").
>
> Datum vzniku: 2026-05-31

---

## 1. Jak číst tento dokument

- **Sekce 2** popisuje, co aplikace **už dnes umí** (abychom nestavěli něco, co částečně existuje).
- **Sekce 3** rozpracovává **4 nápady od tebe** – u každého je: cíl, současný stav, návrh řešení,
  dopad do datového modelu, API, UI a odhad náročnosti.
- **Sekce 4** přidává **další návrhy** funkcí, které dávají v téhle appce smysl.
- **Sekce 5** je **doporučené pořadí** prací (priority + závislosti).

Odhady náročnosti: 🟢 malá (1–2 dny), 🟡 střední (3–7 dní), 🔴 velká (1–3 týdny).

---

## 2. Co aplikace už umí (současný stav)

Stack: **Next.js 16 (App Router)** ↔ REST ↔ **FastAPI (Python 3.11)** ↔ asyncpg ↔ **PostgreSQL**,
nasazeno na Azure Container Apps. Nově **více­uživatelská** (sloupec `user_id` všude, OAuth přes
Google/Apple + záloha email/heslo, ověření Google ID tokenu na serveru, idle auto-logout, rate limiting).

### Účty
- **Bankovní účty** přes GoCardless (OAuth napojení banky + sync transakcí).
- **Investiční účty** přes Trading 212 (+ denní `portfolio_snapshots` pro graf vývoje).
- **Manuální účty** bez API (spořáky) – mají „obálky" (`manual_account_items`) s příznakem
  `is_mine` (moje vs. cizí/půjčené peníze) – tj. *koncept cizích peněz už v appce existuje*.
- **Manuální investiční účty** s pozicemi a snapshoty.

### Transakce
- Sync z banky, kategorizace, fulltext hledání, filtrování.
- Pole `transaction_type`: `normal` / `internal_transfer` / `family_transfer`.
- Pole `is_excluded` (bool) – transakce **úplně vyřazená** z výpočtu příjmů/výdajů.
- Detekce převodů: mezi vlastními účty (`own_ibans`) a od/na **rodinné IBANy** (`family_ibans`,
  uložené v `settings`) + fallback podle klíčových slov.

### Kategorizace
- **Pravidlový engine** podle klíčových slov (`services/categorization.py`, mapování typu
  „albert/lidl → Food", „shell/omv → Transport"…).
- `category_rules` – uživatelská i „naučená" pravidla s počítadlem shod (`match_count`).
- `categories` – vlastní kategorie (ikona, barva, pořadí, příznak `is_income`).

### Měsíční rozpočet (`/rozpocet`)
- `monthly_budgets` na měsíc (`year_month`), uzavírání měsíce, částka investic, přebytek na spoření.
- **Dynamické řádky příjmů** (`monthly_income_items`: Výplata, Stravenky, Bokovka…),
  jeden může být „salary" plněný ze sync transakcí.
- **Šablony pravidelných výdajů** (`recurring_expenses`) + konkrétní měsíční výdaje
  (`monthly_expenses`) s **`my_percentage`** (můj podíl v %, 50 = platím půlku) a
  **`my_amount_override`** (přímá částka v Kč) + auto-match na transakci.
  → *Tady už existuje logika „dělené platby", ale jen v ručním rozpočtu, ne nad reálnými transakcemi.*

### Budgety a cíle
- `budgets` – měsíční limit na kategorii.
- `savings_goals` – spořicí cíle s cílovou částkou a deadlinem.

### Reporty / Dashboard
- Souhrn příjmy/výdaje/net za období (week/month/year/all), rozpad podle kategorií.
- Historie zůstatku, koláčové a sloupcové grafy.

### Kontakty
- Adresář IBAN → jméno protistrany (doplňuje jména tam, kde je banka nedodá).

### Čeho si všimnout pro plánování níže
1. **`is_excluded` je „všechno nebo nic"** – neumí *rozdělit* jednu transakci (např. příjem od
   ženy z části jako vratku za nájem a z části jako vratku za kreditku).
2. **`my_percentage` / `my_amount_override`** řeší dělení nákladů, ale jen v ručním měsíčním rozpočtu.
3. **Kategorizace je čistě pravidlová** – žádná ML/LLM vrstva.
4. **Úvěry/půjčky nemají v datovém modelu vůbec nic.**

---

## 3. Nápady od tebe

### 3.1 Peníze od ženy – vypořádání společných nákladů 🔴

> **Rozhodnuto (2026-05-31):** Stačí **jedna protistrana = „žena"** (žádný obecný systém víc lidí).
> → jde se **lehčí variantou** (sloupce na `transactions` + příznak `settlement`), bez plné
> tabulky splitů. Plný modul je popsaný níže jen jako možné budoucí rozšíření.

**Problém.** Žena ti každý měsíc posílá peníze na půlku nájmu, energií atd. Ten příchozí převod
se ti počítá jako **příjem** a původní platby (nájem, energie) jako **výdaj** v plné výši. Navíc ti
občas přihodí i peníze za věci, které jsi jí koupil z kreditky. Potřebuješ s tímhle „balíkem"
pracovat tak, aby se **nepočítal do příjmů** a aby se související výdaje počítaly jen tvojí částí.

**Současný stav.** Existuje `transaction_type=family_transfer` a `is_excluded`, ale jen na úrovni
„celá transakce ven". Neumí to rozdělit jeden příchozí převod na víc účelů ani „spárovat" vratku
s konkrétními výdaji.

**Návrh řešení – „Společné náklady & vypořádání" (Shared / Settlement modul).**

Tři stavební kameny:

1. **Podíl na transakci (split).** Umožnit u výdaje označit, jakou částí je *tvoje*. Buď % nebo
   pevná částka. Do příjmů/výdajů a do reportů se pak započítá jen **tvoje část**. Zbytek je
   „pohledávka za ženou".
   - Příklad: nájem 30 000 Kč, tvůj podíl 50 % → do tvých výdajů jde 15 000, zbylých 15 000 je
     „čeká na vyrovnání".

2. **„Vratka" / příchozí převod od ženy.** Označit příchozí převod jako `settlement` (vypořádání),
   ne příjem. Volitelně ho **spárovat** s konkrétními pohledávkami (kreditkové nákupy pro ni +
   podíly na nájmu). Tím se „balík" rozpadne na položky a vynuluje pohledávky.

3. **Přehled vypořádání („Kdo komu dluží").** Stránka, která za měsíc ukáže:
   - Kolik ti žena dluží (součet jejích podílů na společných výdajích + věci z kreditky).
   - Kolik už poslala.
   - Zůstatek (saldo) k vyrovnání.

**Datový model (návrh).**

```text
shared_expense_splits        # rozpad transakce na podíly
  id
  transaction_id  -> transactions.id
  counterparty        # "žena" / contact_id (kdo dluží)
  my_amount           # moje část (jde do výdajů)
  their_amount        # část druhé strany (pohledávka)
  reason              # "nájem", "kreditka - boty"
  is_settled (bool)
  settled_by_tx_id    # která příchozí transakce to vyrovnala (nullable)

settlements                  # příchozí "balík" peněz
  id
  transaction_id  -> transactions.id   # příchozí převod od ženy
  counterparty
  total_amount
  allocated_amount    # kolik z balíku je už rozpočítáno na splits
  note
```

**✅ Zvolená (lehčí) varianta** — bez tabulky splitů, jen sloupce na `transactions`:

```text
transactions  (nové sloupce)
  my_share_amount   Float, nullable   # moje část výdaje; když je vyplněná, do
                                       # výpočtů jde tahle částka místo plného amount
  settlement_flag   Bool, default F   # True = příchozí "balík" od ženy → mimo příjmy
  settlement_note   String, nullable  # "nájem + kreditka boty" apod.
```
- Půlený výdaj: vyplníš `my_share_amount` (např. 15 000 z 30 000) → reporty počítají jen tvou část.
- Balík od ženy: zaškrtneš `settlement_flag` (jako dnešní `is_excluded`, ale s vlastní sémantikou)
  → nezvedá příjmy.
- „Saldo s ženou" jde dopočítat: `Σ(amount − my_share_amount) za výdaje − Σ(přijaté balíky)`.
- Plný modul `shared_expense_splits` + `settlements` (výše) si necháváme jako budoucí upgrade,
  kdyby bylo potřeba párovat konkrétní vratky na konkrétní položky.

**API (návrh).**
- `POST /transactions/{id}/split` – rozdělit transakci na podíly.
- `POST /settlements` – založit „balík" od protistrany + `POST /settlements/{id}/allocate`.
- `GET /settlements/summary?month=YYYY-MM` – saldo „kdo komu dluží".

**Dopad do výpočtů.** Dashboard/Reports (`dashboard.py`, `reports`) musí počítat **`my_amount`**
místo `amount`, pokud má transakce split, a **vyřadit** `settlement` z příjmů (podobně jako dnes
`is_excluded`). To je nejdůležitější (a nejcitlivější) část – upravit agregace na jednom místě.

**UI.**
- V detailu transakce tlačítko „Rozdělit / společný náklad" (zadat % nebo částku, protistranu).
- Nová záložka/karta **„Vypořádání"** (saldo s ženou, seznam nevyrovnaných položek, „označit jako
  vyrovnané" párováním s příchozím balíkem).
- Ve výpisu transakcí vizuální odlišení (badge „50 % moje", „vypořádání").

**Otevřené otázky.**
- ~~Stačí jediná protistrana (žena), nebo víc lidí?~~ → **vyřešeno: jen žena.**
- Má se „balík od ženy" párovat ručně, nebo zkusit i automatický návrh (podle částky/data)?
  (Pro MVP stačí ruční označení.)

**Náročnost:** 🔴 → s lehčí variantou spíš 🟡. Doporučuji fázovat: nejdřív `my_share_amount`
+ `settlement_flag` a úprava výpočtů (MVP), saldo „kolik mi žena dluží" až potom.

---

### 3.2 Přehled předplatného (subscriptions) 🟡

**Cíl.** Vidět, kolik a za co platíš v opakovaných platbách (Netflix, Spotify, mobil, pojistky…),
měsíční i **roční** náklad, nejbližší obnovení, „zapomenutá" předplatná a změny ceny.

**Současný stav.** `recurring_expenses` existují, ale slouží ručnímu měsíčnímu rozpočtu (nájem,
služby…). Kategorie `Bills` chytá část služeb. **Neexistuje** automatická detekce opakovaných
plateb z historie ani dedikovaný přehled.

**Návrh řešení.**
1. **Auto-detekce** – z historie transakcí najít opakující se platby stejné protistraně v ~měsíčním
   / ročním intervalu (tolerance pár dní, podobná částka). Navrhnout je uživateli k potvrzení.
2. **Karta předplatného** – název, částka, **perioda** (měsíc/rok), kategorie, datum příští platby,
   stav (aktivní/zrušené), historie ceny (kdy zdražilo).
3. **Přehledová stránka** – součet **měsíčně / ročně**, řazení podle ceny, upozornění:
   - „Tohle předplatné jsi 3 měsíce nepoužil/neplatil" (možná zrušené).
   - „Cena vzrostla z 199 na 249 Kč."
   - „Nejbližší obnovení do 7 dní" (nepovinně notifikace).

**Datový model (návrh).**

```text
subscriptions
  id, user_id
  name
  merchant_pattern     # pro párování s transakcemi
  amount, currency
  period               # "monthly" | "yearly" | "quarterly"
  category
  next_due_date
  is_active
  first_seen_date, last_charged_date
  created_at
```
(Lze elegantně postavit i rozšířením `recurring_expenses` o `period` + `next_due_date`, ale samostatná
tabulka líp oddělí „rozpočtové položky" od „předplatných".)

**API.** `GET /subscriptions` (+ souhrn měsíc/rok), `GET /subscriptions/detect` (návrhy z historie),
`POST/PATCH/DELETE /subscriptions/{id}`.

**UI.** Nová stránka `/subscriptions` (do navigace), karty + souhrn + štítky upozornění.

**Náročnost:** 🟡 – detekce z historie je hlavní práce; zbytek je běžný CRUD + UI.

---

### 3.3 Lokální / vlastní LLM nad tvými daty 🔴

**Cíl.** Chytřejší kategorizace plateb, analýza utrácení, předpovědi a rozbor portfolia.
Běžel by jako **samostatný kontejner v Azure**, napojený přes API.

**Současný stav.** Kategorizace je čistě pravidlová. Žádná AI vrstva neexistuje. Architektura je
ale na to připravená (services/ vrstva, oddělené kontejnery, async I/O).

> **Rozhodnuto (2026-05-31):** Začít **Fází A (ML kategorizace)**. Lokální open model / Azure
> OpenAI (Fáze C) zůstává na později.

**Návrh řešení – AI/Insights microservice.** Samostatný FastAPI kontejner (`ai-service`),
hlavní backend ho volá přes interní API. Tři úrovně podle náročnosti – doporučuji jít zdola:

**Fáze A – „chytrá kategorizace bez LLM" (nejlepší poměr cena/výkon).** 🟡
- Klasický ML model (např. logistická regrese / gradient boosting nad TF-IDF popisu + částka +
  protistrana), natrénovaný na tvých **už ručně opravených** kategoriích.
- Pro každou novou transakci vrací kategorii + **jistotu**. Nízká jistota → zůstane „k revizi".
- Učí se z oprav (máš na to `category_rules.match_count` a ruční opravy – ideální trénovací data).
- Levné, rychlé, běží i na CPU, žádné externí API.

**Fáze B – analytika & předpovědi.** 🟡
- Predikce cashflow do konce měsíce (kolik pravděpodobně utratíš), detekce anomálií
  („tenhle měsíc o 40 % víc za jídlo"), sezónnost.
- Rozbor portfolia (rozložení, riziko, vývoj) nad daty z Trading 212 + snapshotů.
- Statistika/časové řady stačí; LLM tu není nutný.

**Fáze C – LLM asistent („zeptej se svých financí").** 🔴
- Přirozený jazyk: „Kolik jsem letos dal za restaurace?", „Proč mám tenhle měsíc míň?".
- Možnosti hostování v Azure kontejneru:
  - **Malý open model** (např. 7–8B třída) přes Ollama/vLLM – levné, data neopouští tvůj okruh,
    ale slabší kvalita a žádné „trénování na tvých datech" (spíš RAG nad tvými daty).
  - **Azure OpenAI** – kvalitnější, ale data jdou do služby a platíš za tokeny.
- „Natrénování na tvých datech" v praxi nejčastěji = **RAG** (model dostane do kontextu tvoje
  agregace/transakce), ne fine-tuning. Fine-tuning malého modelu jde, ale je to nákladné na údržbu.

**Architektura.**
```text
frontend ──> backend (FastAPI) ──HTTP──> ai-service (FastAPI, vlastní kontejner)
                                              ├─ /categorize        (Fáze A)
                                              ├─ /insights          (Fáze B)
                                              └─ /chat  (RAG+LLM)    (Fáze C)
```
- Nový workflow `deploy-ai.yml` (po vzoru `deploy-backend.yml`).
- Backend volá ai-service při sync (kategorizace) a na vyžádání (insights/chat).
- **Bezpečnost:** ai-service jen v interní síti Container Apps, autentizace mezi službami,
  data zůstávají v tvém Azure okruhu (hlavně u open modelu).

**Náročnost:** 🔴 (Fáze C), 🟡 (Fáze A/B). **Doporučení:** začít Fází A – největší přínos
(přesnější kategorizace) za zlomek úsilí oproti vlastnímu LLM.

---

### 3.4 Úvěry a splátky 🟡

**Cíl.** Přehled úvěrů: výše splátky, kolik už zaplaceno, kolik zbývá, do kdy splácíš,
měsíční splátka.

**Současný stav.** V datovém modelu **nic** – čistá zelená louka.

**Návrh řešení.**
1. **Evidence úvěru** – jistina, úrok (p.a.), počet/délka splátek, datum první splátky, výše
   měsíční splátky (nebo dopočítat z anuity).
2. **Splátkový kalendář (amortizace)** – dopočítat rozpad každé splátky na úrok vs. jistinu,
   zbývající dluh v čase.
3. **Sledování plateb** – párovat reálné transakce (podle `match_pattern`/protistrany) jako
   zaplacené splátky → „zaplaceno X z Y", „zbývá Z", „konec splácení MM/RRRR".
4. **Přehled** – progress bar, graf klesajícího dluhu, součet všech měsíčních splátek (zapojit
   do měsíčního rozpočtu jako pravidelný výdaj).

**Datový model (návrh).**

```text
loans
  id, user_id
  name                 # "Hypotéka", "Auto", "Spotřebák"
  principal            # původní jistina
  interest_rate        # % p.a.
  monthly_payment      # výše splátky
  term_months          # počet splátek
  start_date
  remaining_balance    # aktuální zůstatek (přepočítáváno)
  match_pattern        # pro párování splátkových transakcí
  is_active
  created_at

loan_payments
  id, loan_id
  due_date
  amount
  principal_part, interest_part
  is_paid
  matched_transaction_id   # nullable
```

**API.** `GET/POST/PATCH/DELETE /loans`, `GET /loans/{id}/schedule` (amortizace),
`GET /loans/summary` (součet splátek, celkový zbývající dluh).

**UI.** Nová stránka `/loans` (do navigace): karty úvěrů (progress, zbývá, konec), detail se
splátkovým kalendářem a grafem. Měsíční splátky propojit s `/rozpocet`.

**Náročnost:** 🟡 – datově i logicky přímočaré (anuita je standardní vzorec), čistý přírůstek
bez zásahu do citlivých agregací.

---

## 4. Další návrhy (nad rámec tvých nápadů)

| # | Funkce | Popis | Náročnost |
|---|--------|-------|-----------|
| 4.1 | **Notifikace / upozornění** | Push (PWA už je) na: překročení budgetu, blížící se splátka/obnovení předplatného, neobvyklá platba, došlý sync. | 🟡 |
| 4.2 | **Export dat** | CSV/Excel/PDF výpis transakcí a reportů (účetní, daně, archiv). | 🟢 |
| 4.3 | **Vyhledávání & filtry v reportech** | Filtr reportů podle období/účtu/kategorie/protistrany, porovnání měsíc vs. měsíc, rok vs. rok. | 🟡 |
| 4.4 | **Cíle utrácení per kategorie s trendem** | Rozšířit `budgets` o vizualizaci „tempo utrácení" v měsíci (burn-down), predikce překročení. | 🟡 |
| 4.5 | **Pravidelné/plánované příjmy a výdaje (kalendář cashflow)** | Časová osa očekávaných pohybů (výplata, nájem, splátky, předplatné) → predikce zůstatku na konci měsíce. Pěkně se pojí s 3.2, 3.4. | 🟡 |
| 4.6 | **Sdílení/čtení pro partnera** | Když je teď appka multi-user, read-only pohled pro ženu na společné náklady (navazuje na 3.1). | 🟡 |
| 4.7 | **Tagy nad rámec kategorií** | Volné štítky (např. „dovolená 2026", „rekonstrukce") napříč kategoriemi pro ad-hoc analýzu projektů. | 🟢 |
| 4.8 | **Čistota kategorizace** | Sjednotit pravidlový engine s `category_rules` z DB (dnes jsou klíčová slova natvrdo v kódu) – aby šla pravidla spravovat z UI. | 🟢 |
| 4.9 | **Bezpečnostní review** | V `MEMORY.md` je poznámka o „critical security issues found April 2026" – stojí za to projít zvlášť (auth, CORS, rate limity, izolace per-user). | 🟡 |

---

## 5. Doporučené pořadí

> **Stav (2026-05-31):** zatím **jen plán**, nic se neimplementuje. Pořadí níže je doporučení,
> až se k realizaci přistoupí.

Seřazeno podle poměru přínos/úsilí a závislostí:

1. **3.4 Úvěry** 🟡 – čistý přírůstek, žádné riziko pro stávající výpočty, hned užitečné.
2. **3.2 Předplatné** 🟡 – vysoká hodnota, znovupoužitelná detekce opakovaných plateb (využije i 4.5).
3. **3.1 Peníze od ženy** (lehčí varianta) 🟡 – nejvyšší osobní hodnota; dotýká se výpočtů →
   dělat fázovaně (MVP: `my_share_amount` + `settlement_flag`; potom saldo).
4. **3.3 AI – Fáze A (ML kategorizace)** 🟡 – velký přínos za rozumné úsilí; až pak Fáze B/C.
5. Doplňky ze sekce 4 podle chuti (export 🟢 a tagy 🟢 jsou rychlé výhry; 4.8/4.9 jako údržba/hygiena).

> **Pozn. k závislostem:** 3.2 (předplatné), 3.4 (úvěry) a 4.5 (kalendář cashflow) sdílí logiku
> „opakovaná platba v čase + párování na transakci". Když se postaví znovupoužitelně, ušetří práci
> u všech tří.

---

## 6. Otázky k upřesnění (než se začne kódit)

1. ~~**3.1:** Jedna protistrana, nebo víc lidí?~~ → **vyřešeno: jen žena, lehčí varianta.**
   Zbývá: ruční označení balíku stačí pro MVP (auto-návrh později)?
2. **3.2:** Má appka jen *ukazovat* předplatná, nebo i upozorňovat (push) před obnovením?
3. ~~**3.3:** Lokální model vs. Azure OpenAI, fine-tuning vs. RAG?~~ → **vyřešeno: nejdřív
   Fáze A (ML kategorizace na tvých opravách).** O hostování LLM (Fáze C) se rozhodne až později.
4. **3.4:** Mají se splátky **párovat automaticky** s reálnými transakcemi, nebo je budeš
   potvrzovat ručně?
