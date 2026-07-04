# Push notifikace — aktivace

> Web push (PWA) upozornění na selhaný sync a končící souhlas banky.
> Implementováno v PR #42 (migrace 0017). Vyhodnocují se po každém syncu —
> až poběží automatický sync, budou chodit samy.

## 1. Jednorázově: VAPID klíče na Azure

Bez nastavených klíčů je funkce spící (endpointy vrací 503, nic se nerozbije).

Vygeneruj produkční pár klíčů (z `backend/`):

```bash
cd backend && venv/bin/python -c "
from py_vapid import Vapid, b64urlencode
from cryptography.hazmat.primitives import serialization
v = Vapid(); v.generate_keys()
print('VAPID_PRIVATE_KEY=' + b64urlencode(v.private_key.private_numbers().private_value.to_bytes(32, 'big')))
print('VAPID_PUBLIC_KEY=' + b64urlencode(v.public_key.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)))
"
```

(Dev klíče jsou v lokálním `backend/.env` — produkce si zaslouží vlastní pár.)

Nastav je na **backend** Container App:

- **Portál:** Azure Portal → backend Container App → Containers → Environment variables → Edit and deploy
- **CLI:**

```bash
az containerapp update -n <jmeno-backend-appky> -g <resource-group> \
  --set-env-vars VAPID_PRIVATE_KEY=<private> VAPID_PUBLIC_KEY=<public> VAPID_SUBJECT=mailto:nick.bures@gmail.com
```

Container App si po změně env sama vytvoří novou revizi — restart není potřeba.

## 2. Na každém zařízení: zapnutí v appce

> ⚠️ Funguje **jen na nasazené (live) verzi** — na localhostu se service worker
> záměrně sebedestruuje (viz `public/sw.js`), takže tam subscribe selže.

### Desktop (Chrome/Edge)
1. Otevři appku → **Nastavení → Pokročilé → karta Notifikace**
2. **„Zapnout notifikace"** → prohlížeč se zeptá → **Povolit**
3. **„Poslat test"** — do pár vteřin přijde testovací notifikace 🎉

### iPhone (důležité pořadí!)
1. Appku měj **nainstalovanou na ploše** (Safari → Sdílet → *Přidat na plochu*) —
   iOS pouští web push jen instalovaným PWA (iOS 16.4+)
2. Otevři appku **z ikony na ploše** (ne ze Safari)
3. Nastavení → Pokročilé → Notifikace → Zapnout → Povolit
4. Poslat test

### Android
Funguje rovnou v Chromu i z nainstalované PWA — stejný postup jako desktop.

## 3. Co chodí za notifikace

Vyhodnocuje se v `notify_after_sync()` (`backend/routers/sync.py`) po každém syncu:

- 🔴 **„Sync selhal"** — některý účet se nepodařilo synchronizovat (jméno účtu v textu)
- ⚠️ **„Souhlas banky brzy vyprší / vypršel"** — 7 dní předem a po vypršení

## Troubleshooting

- Test nepřišel → zkontroluj systémová oznámení (macOS: Nastavení systému →
  Oznámení → Chrome; iOS: Nastavení → Oznámení → Koruna).
- „Zapnout" vrací chybu 503 → na Azure chybí VAPID env proměnné (krok 1).
- Mrtvé odběry (odinstalovaná appka apod.) se čistí samy při odesílání.
- „Vypnout" v kartě Notifikace odběr daného zařízení zruší.
