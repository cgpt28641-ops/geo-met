# GeoMeta — nauka mety do GeoGuessr 🌍

Strona do nauki mety GeoGuessr po polsku, wygodna na telefonie i komputerze.

## Co jest w środku
- **GeoMeta Asystent** (`asystent/`) — aplikacja na Windows: nauka po każdej rundzie GeoGuessra (F10) i opcjonalne podpowiedzi w treningu (zablokowane w trybach rankingowych).
- **Nauka** — panel startowy: seria dni 🔥, dzienny cel, powtórki na dziś, „Moje błędy” oraz **ścieżka nauki** — lekcje z grupami krajów, które łatwo pomylić (przegląd kart → fiszki → test, 80% = zaliczone).
- **Kraje** — 127 krajów i terytoriów (100 głównych) — ponad 2100 wskazówek: kamera Google, tablice, słupki, linie, znaki, język, słupy, przyroda, architektura. Każdy kraj ma zakładki: **Rozpoznanie**, **Regiony**, **Szczegóły** (karty ze zdjęciami z Plonk It, po polsku), **Ściąga** i **Galeria** (zdjęcia z GeoHints). Wyszukiwarka, filtry, oznaczanie krajów jako opanowane.
- **Porównaj** — jedna kategoria obok siebie dla wszystkich krajów, jako opisy albo zdjęcia (16 galerii GeoHints: słupki, tablice, słupy, samochody Google i eskorty, szewrony, STOP, przejścia, drogowskazy…).
- **Poradniki** — plan rundy, ruch lewostronny, żółte linie, kolory tablic, ALTO/PARE, generacje kamer, cyrylica, litery łacinki, słońce i cienie, poruszanie się, tryby rywalizacji.
- **Fiszki** — powtórki rozłożone w czasie (1 → 3 → 7 → 14 → 30 dni), przykładowe zdjęcie na odwrocie, swipe na telefonie, skróty klawiszowe (Spacja, 1, 2).
- **Quiz** — wskazówka→kraj, **zdjęcie→kraj** (jak w GeoGuessr), flaga, strona ruchu, domena; przykładowe zdjęcie po każdej odpowiedzi, błędy zapisują się do powtórki.
- Tryb ciemny, działa offline (PWA — można „dodać do ekranu głównego”).

## Uruchomienie lokalne
Statyczna strona bez budowania:
```bash
python3 -m http.server
```
i otwórz http://localhost:8000 (karty ze zdjęciami ładują dane przez `fetch`, więc samo kliknięcie w `index.html` nie wystarczy).

## Wdrożenie na Cloudflare Pages

### Sposób 1 — przez GitHub (polecany, aktualizuje się sam po każdym pushu)
1. Wejdź na https://dash.cloudflare.com → **Workers & Pages** → **Create** → zakładka **Pages** → **Connect to Git**.
2. Połącz konto GitHub i wybierz repozytorium **geo-met**.
3. Ustawienia buildu:
   - **Production branch:** gałąź, na której jest strona (np. `main` po scaleniu albo `claude/busy-faraday-3taaef`),
   - **Framework preset:** `None`,
   - **Build command:** *(puste)*,
   - **Build output directory:** `/` (katalog główny).
4. **Save and Deploy** — po chwili strona działa pod adresem `https://<nazwa>.pages.dev`.
5. (Opcjonalnie) **Custom domains** → podepnij własną domenę.

### Sposób 2 — przeciągnij i upuść
1. Pobierz repozytorium jako ZIP (GitHub → **Code** → **Download ZIP**) i rozpakuj.
2. Cloudflare → **Workers & Pages** → **Create** → **Pages** → **Upload assets**.
3. Nadaj nazwę projektu i przeciągnij rozpakowany folder → **Deploy site**.

### Sposób 3 — z terminala
```bash
npx wrangler login
npx wrangler pages deploy . --project-name geometa
```
(nagłówki cache są w `_headers`).

### Prywatna sekcja 🔒 Moje (opcjonalnie)
Strona ma ukrytą sekcję (kłódka w stopce, adres `/#moje`) na rundy z **GeoMeta Asystenta** — aplikacji na komputer w folderze [`asystent/`](asystent/README.md). Wymaga w Cloudflare Pages bazy KV (`GEOMETA_KV`) i sekretów `ADMIN_USER`, `ADMIN_PASS`, `SESSION_SECRET`, `UPLOAD_TOKEN` — instrukcja krok po kroku w [`asystent/README.md`](asystent/README.md). Bez tego reszta strony działa normalnie.

## Edycja treści
- `js/countries.js` — ściąga krajów (Plonk It + Geometas, po polsku) używana też w fiszkach i quizie,
- `data/plonk/<kod>.json` — karty ze zdjęciami: rozpoznanie, regiony i szczegóły z Plonk It (po polsku),
- `data/gallery.json` — galerie zdjęć z GeoHints (słupki, tablice, słupy, samochody, znaki…),
- `js/guides.js` — poradniki.

Zdjęcia są wczytywane bezpośrednio z serwerów Plonk It i GeoHints (strona do użytku własnego).

Źródła: Plonk It, Geometas, GeoHints, blog „GeoGuessr – The Top Tips, Tricks and Techniques”. Google zmienia pokrycie, więc część wskazówek może się zestarzeć.
