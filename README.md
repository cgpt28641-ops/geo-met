# GeoMeta — nauka mety do GeoGuessr 🌍

Strona do nauki mety GeoGuessr po polsku, wygodna na telefonie i komputerze.

## Co jest w środku
- **Kraje** — 79 krajów z oficjalnym pokryciem: tablice, słupki, linie, język/pismo, znaki, kamera Google, krajobraz, wskazówki. Wyszukiwarka (np. „snorkel”, „żółte”, „ř”), filtry regionu i strony ruchu, oznaczanie krajów jako opanowane.
- **Porównaj** — jedna kategoria (np. słupki albo tablice) obok siebie dla wszystkich krajów.
- **Poradniki** — plan rundy, ruch lewostronny, żółte linie, kolory tablic, ALTO/PARE, generacje kamer, cyrylica, litery łacinki, linki do Plonk It / GeoHints / geotips / LearnableMeta.
- **Fiszki** — system Leitnera (karty, których nie znasz, wracają częściej), swipe na telefonie, skróty klawiszowe (Spacja, 1, 2).
- **Quiz** — wskazówka→kraj, flaga, strona ruchu, domena; rekordy i lista krajów do powtórki.
- Tryb ciemny, działa offline (PWA — można „dodać do ekranu głównego”).

## Uruchomienie
Statyczna strona bez budowania — otwórz `index.html` albo:
```bash
python3 -m http.server
```
**GitHub Pages:** Settings → Pages → Deploy from branch → wybierz gałąź i folder `/ (root)`.

## Edycja treści
Cała meta jest w `js/data.js` (`COUNTRIES` i `GUIDES`) — dodanie kraju to dopisanie jednego obiektu.

Meta pochodzi z wiedzy społeczności (Plonk It, GeoHints, geotips.net, LearnableMeta). Google zmienia pokrycie, więc część wskazówek może się zestarzeć.
