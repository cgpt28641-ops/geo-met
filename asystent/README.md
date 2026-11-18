# 🌍 GeoMeta Asystent

Małe okienko na komputer, które działa obok GeoGuessra (przeglądarka lub Steam):

- **🏁 Nauka po rundzie (F10)** — zawsze działa. Po każdej rundzie robi zrzut ekranu wyniku, odczytuje poprawny kraj i tłumaczy, po czym dało się go rozpoznać na widokach z rundy. Zapisuje historię, statystyki i błędy do powtórki.
- **💡 Podpowiedzi (F9 włącz/wyłącz, F8 analiza)** — tylko do gry pojedynczej i treningu. Pierwsze F8 mówi, *na co spojrzeć*, drugie F8 pokazuje 3 najbardziej prawdopodobne kraje. **W trybach rankingowych (Duels, Battle Royale) podpowiedzi są blokowane** — to byłoby oszukiwanie i grozi banem.

Program patrzy tylko na to, co widać na ekranie (nie czyta danych gry). Analizę robi model Claude.

## Tryb darmowy (bez opłat)

W ustawieniach (⚙) jest przełącznik **Tryb**:

- **Darmowy** — model StreetCLIP działa na twoim komputerze (karta NVIDIA lub procesor), nic nie kosztuje i żadne zdjęcia nie są wysyłane. Po rundzie (F10) wpisujesz poprawny kraj, a asystent pokazuje, co typował model na widokach z rundy, i wskazówki z bazy GeoMeta dla tego kraju. Podpowiedzi na żywo (F8) w tym trybie nie ma. Lekcja zawiera też reguły GeoMeta najlepiej pasujące do widoków z rundy, reguły ogólne zauważone na zrzutach (pismo, kolor linii, krajobraz) i porównanie z krajem, z którym model pomylił poprawny.
- **Claude** — płatny: sam odczytuje wynik rundy, opisuje konkretnie, co było widać, i daje podpowiedzi w treningu.

Tryb darmowy wymaga Pythona (wersja .exe go nie zawiera, bo model i biblioteki ważą kilka GB):

1. Zainstaluj Pythona 3.12 z python.org (zaznacz „Add python.exe to PATH”).
2. Uruchom `zainstaluj_darmowy.bat` (jednorazowo, pobiera ok. 3 GB bibliotek).
3. Uruchamiaj asystenta przez `uruchom.bat`. Przy pierwszej rundzie pobierze się model (~1,7 GB).

W teście na 45 zdjęciach krajobrazów model trafił kraj w 56% przypadków, a w 82% poprawny kraj był w pierwszej trójce. Na zbliżeniach pojedynczych znaków czy słupków radzi sobie słabo.

## Koszt

Każda analiza (F8 lub F10) to jedno zapytanie do Claude. Koszt widać na dole okienka.

| Model | ok. koszt jednej analizy |
|---|---|
| Claude Opus 5.5 (domyślny, najdokładniejszy) | ~10–15 gr |
| Claude Haiku 5.5 (ustawienia → Model) | ~0,3–0,5 gr |

Przykład: 50 rund dziennie z F10 na Opusie to ok. 5–7 zł, na Haiku kilkadziesiąt groszy. Zrzuty robione automatycznie w tle (do nauki) są darmowe — zostają tylko na komputerze.

## Instalacja

1. **Klucz API:** wejdź na https://console.anthropic.com → zaloguj się → **Billing** (doładuj np. 5 $) → **API Keys** → **Create Key**. Skopiuj klucz (zaczyna się od `sk-ant-…`).
2. **Pobierz program:** na GitHubie w repozytorium otwórz **Actions** → „Zbuduj GeoMeta Asystent (Windows)” → najnowsze uruchomienie → na dole **Artifacts** → `GeoMetaAsystent-Windows` (zip z `GeoMetaAsystent.exe`).
   *Alternatywa:* zainstaluj Pythona z python.org i uruchom `uruchom.bat` z tego folderu.
3. Uruchom `GeoMetaAsystent.exe`. Przy pierwszym starcie otworzą się ustawienia — wklej klucz API.
   Windows SmartScreen może ostrzec o nieznanym programie → „Więcej informacji” → „Uruchom mimo to”.
4. Ustaw GeoGuessra w **oknie** albo **pełnym ekranie w oknie** (borderless) — w zwykłym pełnym ekranie okienko asystenta może być niewidoczne.

## Jak używać

1. Graj normalnie — asystent co kilka sekund zapisuje widok (lokalnie, za darmo).
2. Gdy pojawi się ekran wyniku rundy, naciśnij **F10** → dostajesz lekcję: poprawny kraj, twój strzał, czego nie zauważyłeś.
3. **📊** w okienku otwiera raport ze wszystkimi rundami (zdjęcia, lekcje, najczęściej mylone kraje).
4. W treningu możesz włączyć **F9** i używać **F8** jako podpowiedzi.

Dane lokalne: `%APPDATA%\GeoMetaAsystent\` (ustawienia, historia, zrzuty, raport).

## Prywatna synchronizacja ze stroną (opcjonalnie)

Rundy mogą trafiać do **ukrytej sekcji 🔒 Moje** na twojej stronie GeoMeta. Znajomi widzą normalną stronę, a twoje rundy tylko ty po zalogowaniu. Błędy z rund automatycznie trafiają tam do „Moje błędy” w quizie.

### Konfiguracja Cloudflare (jednorazowo)

1. **Baza KV:** dash.cloudflare.com → **Storage & Databases** → **KV** → **Create** → nazwa np. `geometa`.
2. **Podpięcie bazy:** **Workers & Pages** → twój projekt strony → **Settings** → **Bindings** → **Add** → **KV namespace**:
   - Variable name: `GEOMETA_KV`
   - KV namespace: `geometa`
3. **Login, hasło i klucze:** w tym samym projekcie → **Settings** → **Variables and Secrets** → **Add** (typ **Secret**) — dodaj 4 zmienne:
   - `ADMIN_USER` — twój login
   - `ADMIN_PASS` — twoje hasło (długie!)
   - `SESSION_SECRET` — dowolny długi losowy ciąg znaków (np. 40 znaków)
   - `UPLOAD_TOKEN` — inny długi losowy ciąg (to „hasło” dla aplikacji)
4. **Deployments** → **Retry deployment** (albo wypchnij dowolną zmianę), żeby ustawienia zadziałały.
5. Na stronie kliknij **🔒** w stopce (adres `/#moje`) i zaloguj się.
6. W aplikacji: ⚙ → **Adres strony** = `https://twoja-strona.pages.dev`, **Token synchronizacji** = wartość `UPLOAD_TOKEN` → Zapisz (aplikacja sprawdzi połączenie).

Zabezpieczenia: hasło nigdy nie jest w kodzie; sesja to podpisane ciasteczko HttpOnly (30 dni); po 8 nieudanych próbach logowania z jednego adresu blokada na 15 minut; zdjęcia i rundy są dostępne tylko po zalogowaniu.

## Aktualizacja bazy mety

`meta_kontekst.txt` to skrót z `js/countries.js` (podsumowania i złote wskazówki krajów), wysyłany do Claude jako kontekst (z pamięcią podręczną, więc tanio). Po zmianie danych strony wygeneruj go ponownie:

```bash
node -e "global.window={};require('./js/countries.js');require('fs').writeFileSync('asystent/meta_kontekst.txt',window.COUNTRIES.map(c=>'['+c.id.toUpperCase()+'] '+c.name+' ('+c.region+', ruch '+(c.drive==='L'?'lewostronny':'prawostronny')+', '+c.domain+'): '+c.summary+' '+(c.tips||[]).join(' ')).join('\n')+'\n')"
```
