# Budget app

Aplikace pro správu rozpočtu. Možnost rozchození lokálně. Nutné mít vlastní DB. Využívá API od GOCardles kde lze napojit vlastní bankovní učty stahovat transakce a zůstatky na účtu. Možnost i napojení 212 a stahování zustatku na investičního portfolia.

### Stack
* NextJS
* Python
* Postgres

### Napojené api
* Gocardles
* Trading 212

### URL
[Budget App](https://budget-frontend.redfield-d4fd3af1.westeurope.azurecontainerapps.io)

## DEV setup
Pro spuštení je potřeba mít připravenou Postgres DB. Dále připravené api kliče pro GoCardles Api a Trading 212 Api. Nainstalovat Node, Python a Uvicorn. Api kliče vložit do .env. V projektu je k dispozici example.

### BE
* Python
* Uvicorn

### FE
* Node
* NPM

### ENV
* Api klíče
* Konfigurace DB

### Spuštění apliakce
git clone https://github.com/Naiio97/budget_app_2.git

### Spuštení FE
1) cd /frontend
2) npm install
3) npm run dev

### Spuštení BE
1) cd /backend
2) python3 -m venv venv
3) source venv/bin/activate
4) pip install -r requirements.txt
5) Připravit env s požadovnýma hodnotama. Api kliče a konfigurace DB.
6) python3 -m uvicorn main:app --reload --port 8000

## Architektura
Celá aplikace běží ve třech kontejnerech v Azure, každá komponenta má svuj vlastní kontejner. 
Jak FE tak BE má ingress vystavený ven. Na DB vidí pouze BE. FE volá BE přes URL. BE má definovanou URL databaze v env.

### ASCII Diagram
[Next.js FE] --> [FastAPI BE] --> [PostgreSQL DB]
           ^      ^
           |      |
          [Internet] 

## CI/CD Pipeline
Deploy aplikace je plně automatizovaná přes GITHUB Actions. Je to rozdělené do 3 souboru, které se nacházení /.github/worflows. FE a BE mají každý svuj deploy .yml a potom je tam společný pro testy.

### Test
Pouští se na základě změny buď v BE nebo FE a zároveň při pull requestu.
Není za podmínka, tedy pokud ze změní FE nebo BE a je pull requset pustí se dva JOBY jak pro FE tak pro BE, běží paralerně a aktuálně zatím kontrolují jen správnou sintaxi. Pokud testy proběhnou, že možné udělat merge do live.

### Deploy
Obsahuje vždy pouze jeden JOB. Kdy se vytvoří serevr ubunt a stahne aktuální repozitář. Následně se přihlásí do Azure pomocí Azure credetials. Které jsou definováné v GITHUB Action secrets, následně se přihlásí do ACR. Opět uloženo v secrets. Zde už se dostáváme Docker Buildu u FE přidáváme url BE ,kteréou ma NEXT.js volat. Potom příchází docker push a následuje Deploy Azure Contaner app. Kde BE má navíc explicitně definováný port a ,že je dostupný z internetu. FE je dostupný defaultně.