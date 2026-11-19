"""GeoMeta Asystent — silnik: zrzuty ekranu, analiza przez Claude, historia rund, raport.

Działa niezależnie od interfejsu (asystent.py), więc da się go testować bez okna.
"""
from __future__ import annotations

import base64
import datetime as dt
import html
import io
import json
import os
import sys
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path

import anthropic
from PIL import Image

# ───────────────────────── ścieżki i ustawienia ─────────────────────────

def katalog_aplikacji() -> Path:
    """Folder z danymi użytkownika (ustawienia, historia)."""
    wlasny = os.environ.get("GEOMETA_DANE")  # ustawiane przez uruchom.bat: dane obok programu, na dowolnym dysku
    base = os.environ.get("APPDATA") or str(Path.home() / ".config")
    p = Path(wlasny) if wlasny else Path(base) / "GeoMetaAsystent"
    p.mkdir(parents=True, exist_ok=True)
    (p / "historia").mkdir(exist_ok=True)
    return p


_blokada_logu = threading.Lock()


def log(tekst: str, blad: bool = False) -> None:
    """Dopisuje linijkę do dane/log.txt (z godziną). blad=True dokleja pełny opis ostatniego wyjątku."""
    try:
        import traceback
        plik = katalog_aplikacji() / "log.txt"
        with _blokada_logu:
            if plik.exists() and plik.stat().st_size > 2_000_000:   # stary log odkładamy, żeby plik nie rósł bez końca
                plik.replace(plik.with_name("log_stary.txt"))
            with open(plik, "a", encoding="utf-8") as f:
                f.write(f"{dt.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}  {tekst}\n")
                if blad:
                    f.write(traceback.format_exc() + "\n")
    except Exception:
        pass


def katalog_zasobow() -> Path:
    """Folder z plikami dołączonymi do programu (działa też po spakowaniu PyInstallerem)."""
    return Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))


MODELE = {
    "claude-opus-5-5": {"nazwa": "Claude Opus 5.5 — najdokładniejszy", "in": 4.00, "out": 20.00, "cache_read": 0.20, "cache_write": 5.00},
    "claude-haiku-5-5": {"nazwa": "Claude Haiku 5.5 — ok. 40× taniej", "in": 0.10, "out": 0.50, "cache_read": 0.01, "cache_write": 0.125},
}
USD_PLN = 4.0  # przybliżony kurs do pokazywania kosztów

DOMYSLNE = {
    "tryb": "lokalny",         # "lokalny" = darmowy model na tym komputerze, "claude" = płatny, dokładniejszy
    "api_key": "",
    "model": "claude-opus-5-5",
    "monitor": 1,
    "podpowiedzi": False,      # tryb podpowiedzi (tylko gra pojedyncza / trening)
    "auto_zrzuty": True,       # lokalne zrzuty co kilka sekund (darmowe) — do nauki po rundzie
    "co_ile_s": 2,
    "auto_kraj": True,         # poprawny kraj odczytywany z mapy wyniku
    "porady": False,           # porady i wskazówki GeoMeta w lekcji (wyłączone = tylko to, co rozpoznał program)
    "kompakt": True,           # mała belka z typami w trakcie rundy
    "okno": "",                # zapamiętane położenie i rozmiar okienka
    "auto_koniec": True,       # tryb darmowy: sam wykrywa ekran wyniku i otwiera lekcję
    "skrot_analiza": "f8",
    "skrot_podpowiedzi": "f9",
    "skrot_koniec_rundy": "f10",
}


def wczytaj_ustawienia() -> dict:
    p = katalog_aplikacji() / "ustawienia.json"
    cfg = dict(DOMYSLNE)
    if p.exists():
        try:
            cfg.update(json.loads(p.read_text(encoding="utf-8")))
        except (OSError, json.JSONDecodeError):
            pass
    if cfg.get("model") not in MODELE:
        cfg["model"] = DOMYSLNE["model"]
    return cfg


def zapisz_ustawienia(cfg: dict) -> None:
    (katalog_aplikacji() / "ustawienia.json").write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")


# ───────────────────────── zrzuty ekranu ─────────────────────────

def zrob_zrzut(monitor: int = 1, zaslon: list | None = None) -> Image.Image:
    """Zrzut wybranego monitora. zaslon: prostokąty (x0, y0, x1, y1) we współrzędnych ekranu do zamalowania
    (okienko asystenta, gdy system nie potrafi go pominąć przy zrzucie)."""
    import mss  # import tutaj, żeby testy bez ekranu nie wymagały mss

    with mss.mss() as sct:
        mons = sct.monitors
        m = mons[monitor] if 0 < monitor < len(mons) else mons[1]
        shot = sct.grab(m)
        img = Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")
    for x0, y0, x1, y1 in zaslon or []:
        x0, y0, x1, y1 = x0 - m["left"], y0 - m["top"], x1 - m["left"], y1 - m["top"]
        x0, y0, x1, y1 = max(0, x0), max(0, y0), min(img.width, x1), min(img.height, y1)
        if x1 > x0 and y1 > y0:
            img.paste((0, 0, 0), (x0, y0, x1, y1))
    return img


def plaskie_pola(img: Image.Image):
    """Siatka 27x48 pól: True tam, gdzie obraz ma jednolity kolor (mapa, interfejs), False na zdjęciu z ulicy."""
    import numpy as np
    a = np.asarray(img.convert("RGB").resize((480, 270))).astype(np.int16)
    b = a.reshape(27, 10, 48, 10, 3).transpose(0, 2, 1, 3, 4).reshape(27, 48, 100, 3)
    return (b.max(2) - b.min(2)).max(2) <= 8


def kolory_mapy(img: Image.Image) -> float:
    """Jaką część dolnej połowy ekranu zajmują kolory mapy Google (niebieska woda, pastelowo zielony ląd). Niebo jest wyżej, więc go nie liczymy."""
    import numpy as np
    a = np.asarray(img.convert("RGB").resize((160, 90))).astype(np.int16)[40:86, 6:154]
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    woda = (r > 125) & (r < 170) & (g > 168) & (g < 205) & (b > 232)
    lad = (r > 135) & (r < 208) & (g > 200) & (g < 240) & (b > 150) & (b < 215) & (g - r > 18) & (g - b > 12)
    return float((woda | lad).mean())


def kolory_mapy_szerokie(img: Image.Image) -> float:
    """Jak kolory_mapy, ale liczy też jasne, beżowe i szarawe tło mapy (suche tereny, mapa mocno przybliżona na miasto).
    Takie kolory mają też białe ściany czy śnieg, więc tej miary używamy tylko razem z pinezką wyniku."""
    import numpy as np
    a = np.asarray(img.convert("RGB").resize((160, 90))).astype(np.int16)[8:86, 6:154]
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    woda = (r > 125) & (r < 170) & (g > 168) & (g < 205) & (b > 232)
    lad = (r > 135) & (r < 215) & (g > 200) & (g < 245) & (b > 150) & (b < 225) & (g - r > 10)
    jasne = (r > 222) & (g > 222) & (b > 200) & (abs(r - g) < 14) & (r - b < 40) & (r - b > -12)
    return float((woda | lad | jasne).mean())


def czysty_widok(img: Image.Image) -> bool:
    """Czy to zwykły widok z ulicy, bez dużej mapy na ekranie (tylko takie zrzuty trafiają do widoków z rundy)."""
    try:
        return kolory_mapy(img) < 0.10 and float(plaskie_pola(img)[8:25, 3:36].mean()) < 0.30
    except Exception:
        return True


def czy_mapa(img: Image.Image) -> bool:
    """Czy dużą część ekranu zajmuje mapa (kolory mapy albo duże jednolite plamy), a nie widok z ulicy."""
    try:
        return kolory_mapy(img) >= 0.35 or float(plaskie_pola(img)[12:25, 4:30].mean()) >= 0.38
    except Exception:
        return False


def rodzaj_ekranu(img: Image.Image) -> str:
    """Rozpoznaje po kolorach: 'wynik' (fioletowy pasek u góry + mapa), 'podsumowanie' (cały fioletowy),
    'mapa' (duża mapa bez paska — trzeba sprawdzić pinezkę, żeby odróżnić wynik od mapy otwartej w rundzie) albo 'runda'."""
    m = img.convert("RGB").resize((160, 90))
    px = m.load()

    def fiolet(r, g, b):
        return r < 90 and g < 70 and 40 < b < 140 and b > r + 10

    def mapa(r, g, b):
        return (b > 200 and g > 150 and r < 170) or (g > 190 and 130 < r < 190 and b < 190)
    gora = sum(fiolet(*px[x, y]) for y in range(0, 18) for x in range(160)) / (18 * 160)
    dol_f = sum(fiolet(*px[x, y]) for y in range(23, 90) for x in range(160)) / (67 * 160)
    dol_m = sum(mapa(*px[x, y]) for y in range(23, 90) for x in range(160)) / (67 * 160)
    if gora > 0.6 and (dol_m > 0.5 or kolory_mapy(img) >= 0.35):
        return "wynik"
    if gora > 0.6 and dol_f > 0.4:
        return "podsumowanie"
    if dol_f > 0.4:
        return "podsumowanie"       # fioletowe tło bez paska: ekrany między grami, menu
    if czy_mapa(img):
        return "mapa"               # dużą część ekranu zajmuje mapa: wynik w innym trybie gry ALBO mapa otwarta w trakcie rundy
    return "runda"


def czy_pojedynek(img: Image.Image, jeden_pasek: bool = False) -> bool:
    """Wykrywa ekran pojedynku (Duels): dwa paski życia u góry, po lewej i po prawej (także gdy życia jest mało)."""
    m = img.convert("RGB").resize((320, 180))
    px = m.load()

    def zielony(r, g, b):
        # pasek życia: wypełnienie zielone, żółte lub pomarańczowe (mało życia) albo jego granatowa, pusta część
        kolor = max(r, g, b) > 170 and b < 130 and max(r, g, b) - b > 70
        pusty = r < 75 and g < 70 and 50 < b < 130 and b > r + 15
        return kolor or pusty

    def pasek(x0, x1):
        najlepszy = 0.0
        for y in range(4, 20):  # paski życia leżą w górnych ~10% ekranu
            najlepszy = max(najlepszy, sum(zielony(*px[x, y]) for x in range(x0, x1)) / (x1 - x0))
        return najlepszy
    lewy, prawy = pasek(14, 76) > 0.8, pasek(244, 306) > 0.8
    # jeden_pasek: gdy część górnego paska jest zasłonięta (np. zamalowanym okienkiem asystenta), wystarcza jeden pasek życia
    return (lewy or prawy) if jeden_pasek else (lewy and prawy)


def podpis_klatki(img: Image.Image) -> bytes:
    """Mały odcisk obrazu (32x18, szarość) do szybkiego porównywania zrzutów."""
    w, h = img.size
    return img.crop((0, int(h * 0.12), w, int(h * 0.88))).convert("L").resize((32, 18)).tobytes()


def roznica_klatek(a: bytes, b: bytes) -> float:
    """Średnia różnica jasności między dwoma odciskami (0–255)."""
    return sum(abs(x - y) for x, y in zip(a, b)) / len(a)


def wybierz_rozne(klatki: list, ile: int) -> list:
    """Z listy (obraz, odcisk) wybiera najbardziej różniące się widoki; ostatni jest zawsze wśród nich."""
    if len(klatki) <= ile:
        return [k[0] for k in klatki]
    wybrane = [len(klatki) - 1]
    while len(wybrane) < ile:
        najlepszy = max((i for i in range(len(klatki)) if i not in wybrane),
                        key=lambda i: min(roznica_klatek(klatki[i][1], klatki[j][1]) for j in wybrane))
        wybrane.append(najlepszy)
    return [klatki[i][0] for i in sorted(wybrane)]


def obraz_do_base64(img: Image.Image, max_bok: int = 1568, jakosc: int = 82) -> str:
    """Zmniejsza i kompresuje zrzut (mniej tokenów = taniej), zwraca base64 JPEG."""
    img = img.convert("RGB")
    w, h = img.size
    skala = min(1.0, max_bok / max(w, h))
    if skala < 1:
        img = img.resize((int(w * skala), int(h * skala)), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=jakosc, optimize=True)
    return base64.standard_b64encode(buf.getvalue()).decode("ascii")


def blok_obrazu(img: Image.Image) -> dict:
    return {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": obraz_do_base64(img)}}


# ───────────────────────── prompty i schematy ─────────────────────────

def kontekst_mety() -> str:
    p = katalog_zasobow() / "meta_kontekst.txt"
    try:
        return p.read_text(encoding="utf-8")
    except OSError:
        return ""


SYSTEM_BAZA = """Jesteś trenerem GeoGuessr. Analizujesz zrzuty ekranu z gry i uczysz gracza rozpoznawać kraje po mecie: \
strona ruchu, pismo i język, tablice rejestracyjne, słupki drogowe, linie na drodze, znaki, słupy, samochód Google i generacja kamery, \
roślinność, gleba, architektura. Odpowiadasz zawsze po polsku, zwięźle i konkretnie — opisuj tylko to, co naprawdę widać na zrzucie.

Zasady:
- Jeśli interfejs wskazuje tryb rywalizacji z innymi graczami (Duels, Team Duels, Battle Royale, rankingowe mecze, \
widoczne paski życia lub przeciwnicy), ustaw tryb_rankingowy=true. Wtedy NIE podawaj kandydatów ani podpowiedzi \
(zostaw puste listy i pusty tekst) — pomoc w rywalizacji to oszukiwanie.
- Kody krajów to ISO 3166-1 alpha-2 małymi literami (np. "pl", "br", "us").
- Pewność to liczby 0–100, suma dla kandydatów nie musi wynosić 100.

Poniżej baza mety (skrót z GeoMeta: Plonk It, Geometas, GeoHints) — korzystaj z niej, ale nie ograniczaj się do niej:
"""

SCHEMAT_ANALIZY = {
    "type": "object",
    "additionalProperties": False,
    "required": ["tryb_rankingowy", "ekran", "widoczne_wskazowki", "gdzie_patrzec", "kandydaci"],
    "properties": {
        "tryb_rankingowy": {"type": "boolean"},
        "ekran": {"type": "string", "enum": ["runda", "wynik", "inne"]},
        "widoczne_wskazowki": {"type": "array", "items": {"type": "string"}},
        "gdzie_patrzec": {"type": "string"},
        "kandydaci": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["kod", "kraj", "pewnosc", "dlaczego"],
                "properties": {
                    "kod": {"type": "string"},
                    "kraj": {"type": "string"},
                    "pewnosc": {"type": "integer"},
                    "dlaczego": {"type": "string"},
                },
            },
        },
    },
}

SCHEMAT_LEKCJI = {
    "type": "object",
    "additionalProperties": False,
    "required": ["tryb_rankingowy", "poprawny_kod", "poprawny_kraj", "miejsce", "twoj_strzal", "trafiony_kraj", "lekcja", "przeoczone", "zagadka"],
    "properties": {
        "tryb_rankingowy": {"type": "boolean"},
        "poprawny_kod": {"type": "string"},
        "poprawny_kraj": {"type": "string"},
        "miejsce": {"type": "string"},
        "twoj_strzal": {"type": "string"},
        "trafiony_kraj": {"type": "boolean"},
        "lekcja": {"type": "string"},
        "przeoczone": {"type": "array", "items": {"type": "string"}},
        "zagadka": {"type": "string"},
    },
}

POLECENIE_ANALIZY = """To zrzut ekranu z bieżącej rundy GeoGuessr.
1. Ustal, czy to tryb rywalizacji (tryb_rankingowy) i jaki to ekran.
2. Wypisz w widoczne_wskazowki konkretne rzeczy widoczne na zrzucie, które pomagają ustalić kraj (np. „ruch lewostronny”, „litera ł na szyldzie”, „biały słupek z czerwonym odblaskiem”).
3. W gdzie_patrzec napisz JEDNO zdanie-podpowiedź, na co gracz powinien zwrócić uwagę, BEZ zdradzania kraju (np. „Przyjrzyj się słupkowi po prawej i kolorowi linii”).
4. Podaj do 3 kandydatów od najbardziej prawdopodobnego, z krótkim uzasadnieniem opartym na mecie."""

POLECENIE_LEKCJI = """Runda GeoGuessr właśnie się skończyła. Ostatni obraz to ekran wyniku (widać poprawne miejsce i strzał gracza), \
wcześniejsze obrazy to widoki z tej rundy (któryś może być już ekranem przejściowym — pomiń go).
1. Odczytaj z ekranu wyniku poprawny kraj (i miejsce, jeśli widać), a w twoj_strzal — gdzie gracz postawił pinezkę (kraj/region, jeśli da się ustalić; inaczej „nieznany”). trafiony_kraj = czy pinezka gracza jest w tym samym kraju.
2. lekcja: 2–4 zdania — po czym w widokach z rundy dało się rozpoznać ten kraj (konkretna meta widoczna na zrzutach).
3. przeoczone: lista konkretnych wskazówek widocznych na zrzutach, które warto zapamiętać.
4. zagadka: jedno zdanie-wskazówka do fiszki, opisujące najbardziej charakterystyczną rzecz z tej rundy BEZ nazwy kraju ani przymiotnika od niej.
Jeśli to tryb rywalizacji, i tak przygotuj lekcję — runda już się skończyła, więc to tylko nauka."""


# ───────────────────────── klient Claude ─────────────────────────

@dataclass
class Koszt:
    usd: float = 0.0
    wywolania: int = 0

    @property
    def pln(self) -> float:
        return self.usd * USD_PLN


@dataclass
class Silnik:
    cfg: dict
    koszt: Koszt = field(default_factory=Koszt)

    def _klient(self) -> anthropic.Anthropic:
        klucz = (self.cfg.get("api_key") or "").strip()
        return anthropic.Anthropic(api_key=klucz) if klucz else anthropic.Anthropic()

    def _system(self) -> list:
        # stały tekst = trafia do pamięci podręcznej (prompt caching), kolejne wywołania są dużo tańsze
        return [{"type": "text", "text": SYSTEM_BAZA + kontekst_mety(), "cache_control": {"type": "ephemeral"}}]

    def _policz_koszt(self, usage) -> float:
        cena = MODELE[self.cfg["model"]]
        u = lambda n: (getattr(usage, n, 0) or 0)
        usd = (u("input_tokens") * cena["in"] + u("output_tokens") * cena["out"]
               + u("cache_read_input_tokens") * cena["cache_read"]
               + u("cache_creation_input_tokens") * cena["cache_write"]) / 1_000_000
        self.koszt.usd += usd
        self.koszt.wywolania += 1
        return usd

    def _zapytaj(self, obrazy: list[Image.Image], polecenie: str, schemat: dict) -> dict:
        model = self.cfg["model"]
        kwargs = dict(
            model=model,
            max_tokens=4000,
            system=self._system(),
            messages=[{"role": "user", "content": [*(blok_obrazu(i) for i in obrazy), {"type": "text", "text": polecenie}]}],
            output_config={"effort": "low", "format": {"type": "json_schema", "schema": schemat}},
        )
        klient = self._klient()
        if model == "claude-opus-5-5":
            # gdyby model odmówił (filtry bezpieczeństwa), serwer sam ponowi zapytanie innym modelem
            odp = klient.beta.messages.create(betas=["server-side-fallback-2026-07-01"], fallbacks="default", **kwargs)
        else:
            odp = klient.messages.create(**kwargs)
        self._policz_koszt(odp.usage)
        if odp.stop_reason == "refusal":
            raise RuntimeError("Model odmówił analizy tego obrazu.")
        if odp.stop_reason == "max_tokens":
            raise RuntimeError("Odpowiedź została ucięta — spróbuj ponownie.")
        tekst = next((b.text for b in odp.content if b.type == "text"), "")
        return json.loads(tekst)

    def analizuj(self, zrzut: Image.Image) -> dict:
        return self._zapytaj([zrzut], POLECENIE_ANALIZY, SCHEMAT_ANALIZY)

    def lekcja(self, widoki: list[Image.Image], wynik: Image.Image) -> dict:
        return self._zapytaj([*widoki[-2:], wynik], POLECENIE_LEKCJI, SCHEMAT_LEKCJI)


# ───────────────────────── historia i raport ─────────────────────────

def runda_udana(w: dict) -> bool:
    """Czy runda poszła dobrze: trafiony kraj, a gdy tego nie wiadomo — strzał bliżej niż 250 km."""
    if w.get("trafiony_kraj") is not None:
        return bool(w.get("trafiony_kraj"))
    return w.get("odleglosc_km") is not None and w["odleglosc_km"] <= 250


def zapisz_runde(lekcja: dict, widoki: list[Image.Image], wynik: Image.Image) -> dict:
    kat = katalog_aplikacji() / "historia"
    znacznik = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    pliki = []
    for i, img in enumerate([*widoki[-2:], wynik]):
        nazwa = f"{znacznik}-{i}.jpg"
        img.convert("RGB").save(kat / nazwa, quality=80)
        pliki.append(nazwa)
    wpis = {"czas": dt.datetime.now().isoformat(timespec="seconds"), "pliki": pliki, **lekcja}
    plik = katalog_aplikacji() / "historia.json"
    hist = wczytaj_historie()
    hist.append(wpis)
    plik.write_text(json.dumps(hist, ensure_ascii=False, indent=1), encoding="utf-8")
    return wpis


def wczytaj_historie() -> list:
    plik = katalog_aplikacji() / "historia.json"
    try:
        return json.loads(plik.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []


def statystyki(hist: list | None = None) -> dict:
    hist = wczytaj_historie() if hist is None else hist
    kraje: dict[str, dict] = {}
    for w in hist:
        k = kraje.setdefault(w.get("poprawny_kod", "?"), {"kraj": w.get("poprawny_kraj", "?"), "rundy": 0, "trafione": 0})
        k["rundy"] += 1
        k["trafione"] += 1 if runda_udana(w) else 0
    najgorsze = sorted(kraje.items(), key=lambda kv: (kv[1]["trafione"] / kv[1]["rundy"], -kv[1]["rundy"]))
    return {"rundy": len(hist), "trafione": sum(1 for w in hist if runda_udana(w)), "kraje": kraje, "najgorsze": najgorsze[:8]}


def eksport_dla_geometa() -> Path:
    """Plik do zaimportowania na stronie GeoMeta (Nauka → Importuj z Asystenta): rundy z nietrafionym krajem."""
    hist = wczytaj_historie()
    bledy = [{"t": "clue", "c": w["poprawny_kod"].lower(), "k": "inne", "v": w["zagadka"]}
             for w in hist if not runda_udana(w) and w.get("zagadka") and len(w.get("poprawny_kod", "")) == 2]
    p = katalog_aplikacji() / "geometa_bledy.json"
    p.write_text(json.dumps({"zrodlo": "GeoMeta Asystent", "bledy": bledy}, ensure_ascii=False, indent=1), encoding="utf-8")
    return p


def raport_html() -> Path:
    hist = wczytaj_historie()
    st = statystyki(hist)
    e = html.escape
    wiersze = []
    for w in reversed(hist):
        imgs = "".join(f'<a href="historia/{e(f)}" target="_blank"><img src="historia/{e(f)}"></a>' for f in w.get("pliki", []))
        flaga = f'<img class="flag" src="https://flagcdn.com/w40/{e(w.get("poprawny_kod", "").lower())}.png">'
        przeocz = "".join(f"<li>{e(x)}</li>" for x in w.get("przeoczone", []))
        wiersze.append(f"""<div class="r {'ok' if runda_udana(w) else 'zle'}">
          <div class="h">{flaga}<b>{e(w.get('poprawny_kraj', '?'))}</b> {e(w.get('miejsce', ''))}
          <span>{('✅ ' if runda_udana(w) else '❌ ') + (f"{w['odleglosc_km']} km od celu" if w.get('odleglosc_km') is not None else ('trafiony kraj' if w.get('trafiony_kraj') else 'twój strzał: ' + e(w.get('twoj_strzal', '?'))))}</span>
          <small>{e(w.get('czas', ''))}</small></div>
          <div class="imgs">{imgs}</div><p>{e(w.get('lekcja', ''))}</p><ul>{przeocz}</ul></div>""")
    najg = "".join(f"<li>{e(v['kraj'])}: {v['trafione']}/{v['rundy']}</li>" for _, v in st["najgorsze"])
    tresc = f"""<!doctype html><html lang="pl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>GeoMeta Asystent — moje rundy</title>
<style>body{{font:15px system-ui;margin:0;background:#f3f5fa;color:#0d1526}}main{{max-width:1100px;margin:auto;padding:20px}}
.r{{background:#fff;border-radius:14px;padding:14px;margin:12px 0;border-left:6px solid #0fa968}}.r.zle{{border-left-color:#e5484d}}
.h{{display:flex;gap:10px;align-items:center;flex-wrap:wrap}}.h span{{color:#5d6679}}.h small{{margin-left:auto;color:#888}}
.imgs{{display:flex;gap:8px;overflow-x:auto;margin:10px 0}}.imgs img{{height:150px;border-radius:8px}}.flag{{height:20px}}
.box{{background:#fff;border-radius:14px;padding:14px}}</style><main>
<h1>Moje rundy</h1><div class="box">Rund: <b>{st['rundy']}</b> · trafiony kraj: <b>{st['trafione']}</b>
<h3>Kraje, w których mylisz się najczęściej</h3><ul>{najg or '<li>brak danych</li>'}</ul></div>
{''.join(wiersze) or '<p>Brak zapisanych rund — po zakończeniu rundy naciśnij skrót „koniec rundy”.</p>'}</main></html>"""
    p = katalog_aplikacji() / "raport.html"
    p.write_text(tresc, encoding="utf-8")
    return p
