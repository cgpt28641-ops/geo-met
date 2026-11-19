"""Odczytywanie poprawnego miejsca z ekranu wyniku rundy (mapa z pinezką).

Asystent znajduje czarne kółko z żółtą flagą, czyta nazwy miast i krajów na mapie,
z ich znanych współrzędnych wylicza, jakie miejsce na świecie pokazuje pinezka, i sprawdza, w którym kraju leży.
"""
from __future__ import annotations

import math
import re

import mapa
import silnik
import silnik_lokalny


def _mercator(lat: float) -> float:
    return math.log(math.tan(math.pi / 4 + math.radians(max(-85.0, min(85.0, lat))) / 2))


def pinezka(img):
    """Środek czarnego kółka z żółtą flagą (poprawne miejsce) albo None."""
    import numpy as np
    a = np.asarray(img.convert("RGB")).astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    zolty = (r > 220) & (g > 170) & (b < 90)
    czarny = ((r < 45) & (g < 45) & (b < 45)).astype(np.int32)
    ys, xs = np.nonzero(zolty)
    if not len(ys):
        return None
    suma = np.pad(czarny.cumsum(0).cumsum(1), ((1, 0), (1, 0)))  # szybkie liczenie czarnych pikseli wokół punktu
    h, w = czarny.shape
    y0, y1 = np.clip(ys - 16, 0, h), np.clip(ys + 17, 0, h)
    x0, x1 = np.clip(xs - 16, 0, w), np.clip(xs + 17, 0, w)
    ile = suma[y1, x1] - suma[y0, x1] - suma[y1, x0] + suma[y0, x0]
    i = int(ile.argmax())
    if ile[i] < 250:
        return None
    blisko = (abs(xs - xs[i]) < 14) & (abs(ys - ys[i]) < 14) & (ile > 200)
    return float(xs[blisko].mean()), float(ys[blisko].mean())


def _srodek_kraju(kod: str):
    ringi = [r for k, rs in mapa._wczytaj()["kraje"] if k == kod for r in rs]
    if not ringi:
        return None
    ring = max(ringi, key=lambda r: len(r[0]))[0]
    return sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring)


def kraj_w_punkcie(lon: float, lat: float):
    """(kod, odległość w stopniach): kraj zawierający punkt (odległość 0) albo najbliższy kraj z bazy."""
    najblizszy, najmniej = None, 1e9
    for kod, ringi in mapa._wczytaj()["kraje"]:
        for ring, (a, b, c, d) in ringi:
            if a <= lon <= c and b <= lat <= d:
                w, j = False, len(ring) - 1
                for i in range(len(ring)):
                    xi, yi = ring[i]
                    xj, yj = ring[j]
                    if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi:
                        w = not w
                    j = i
                if w:
                    return kod, 0.0
            if kod and a - 15 <= lon <= c + 15 and b - 15 <= lat <= d + 15:
                skala = math.cos(math.radians(lat))
                for x, y in ring[::3]:
                    o = ((x - lon) * skala) ** 2 + (y - lat) ** 2
                    if o < najmniej:
                        najblizszy, najmniej = kod, o
    return najblizszy, math.sqrt(najmniej) if najblizszy else 1e9


def odczytaj(img, typy_modelu: list[str] | None = None) -> dict | None:
    """Zwraca {kod, pewny, lat, lon, miasta, odleglosc_km, powod} albo None, gdy nie da się nic ustalić."""
    import numpy as np
    typy_modelu = typy_modelu or []
    miasta = silnik_lokalny.miasta()
    nazwy_krajow = {silnik_lokalny._uprosc(k["pl"]): k["id"] for k in silnik_lokalny.kraje()}
    w, h = img.size
    odczyty = silnik_lokalny.czytnik().readtext(np.asarray(img.convert("RGB")))
    silnik.log(f"mapa wyniku: zrzut {w}x{h} · pinezka {pinezka(img)} · odczytane napisy ({len(odczyty)}): " + " | ".join(f"{t} [{int(pole[0][0])},{int(pole[0][1])}]" for pole, t, pw in odczyty[:60]))

    # odległość gracza: pierwszy od lewej napis „… km” w górnej części ekranu
    km = []
    for pole, tekst, pw in odczyty:
        m = re.search(r"(\d[\d  ]*)\s*km", tekst.lower())
        if m and pole[0][1] < h * 0.35:
            km.append((pole[0][0], int(re.sub(r"\D", "", m.group(1)))))
    odleglosc = min(km)[1] if km else None

    pin = pinezka(img)
    if pin and not (h * 0.22 < pin[1] < h * 0.97 and w * 0.02 < pin[0] < w * 0.98):
        pin = None
    kotwice = []  # (x, y, lon, lat, waga, czy_miasto)
    for pole, tekst, pw in odczyty:
        if pw < 0.4 or pole[0][1] < h * 0.22:
            continue
        klucz = silnik_lokalny._uprosc(tekst).strip(" .,-")
        cy = (pole[0][1] + pole[2][1]) / 2
        if len(klucz) >= 4 and klucz in miasta:
            kotwice.append((pole[0][0] - 8, cy, miasta[klucz][3], miasta[klucz][2], 1.0, True))  # kropka miasta jest tuż na lewo od napisu
        elif klucz in nazwy_krajow and _srodek_kraju(nazwy_krajow[klucz]):
            lon, lat = _srodek_kraju(nazwy_krajow[klucz])
            kotwice.append(((pole[0][0] + pole[2][0]) / 2, cy, lon, lat, 0.15, False))
    if not pin or len(kotwice) < 2:
        return {"kod": None, "pewny": False, "odleglosc_km": odleglosc, "miasta": 0, "powod": "za mało napisów na mapie"} if odleglosc is not None else None

    def dopasuj(kot):
        A, B = [], []
        for x, y, lon, lat, waga, _ in kot:
            A += [[waga * math.radians(lon), waga, 0], [-waga * _mercator(lat), 0, waga]]
            B += [waga * x, waga * y]
        return np.linalg.lstsq(np.array(A), np.array(B), rcond=None)[0]
    def blad(k, s, tx, ty):
        return math.hypot(s * math.radians(k[2]) + tx - k[0], -s * _mercator(k[3]) + ty - k[1])

    # Część napisów to pomyłki (np. Córdoba czy Santa Fe są na kilku kontynentach), więc szukamy takiego ułożenia mapy,
    # z którym zgadza się najwięcej napisów: próbujemy każdą parę i liczymy, ile pozostałych do niej pasuje.
    najl = None
    for i in range(len(kotwice)):
        for j in range(i + 1, len(kotwice)):
            a, b = kotwice[i], kotwice[j]
            if math.hypot(a[0] - b[0], a[1] - b[1]) < 60:
                continue
            try:
                s, tx, ty = dopasuj([a, b])
            except Exception:
                continue
            if not (s > 0):
                continue
            zgodne = [k for k in kotwice if blad(k, s, tx, ty) <= (30 if k[5] else 160)]
            ocena = sum(1.0 if k[5] else 0.3 for k in zgodne)
            if najl is None or ocena > najl[0]:
                najl = (ocena, zgodne)
    if najl is None or len(najl[1]) < 2:
        return {"kod": None, "pewny": False, "odleglosc_km": odleglosc, "miasta": 0, "powod": "nie udało się dopasować mapy"}
    kotwice = najl[1]
    s, tx, ty = dopasuj(kotwice)
    if s <= 0:
        return {"kod": None, "pewny": False, "odleglosc_km": odleglosc, "miasta": 0, "powod": "nie udało się dopasować mapy"}
    lon = math.degrees((pin[0] - tx) / s)
    lat = math.degrees(2 * math.atan(math.exp((ty - pin[1]) / s)) - math.pi / 2)
    ile_miast = sum(1 for k in kotwice if k[5])
    kod, odl = kraj_w_punkcie(lon, lat)
    znany = bool(kod) and silnik_lokalny.kraj(kod) is not None
    if not znany:
        return {"kod": None, "pewny": False, "lat": lat, "lon": lon, "odleglosc_km": odleglosc, "miasta": ile_miast, "powod": "miejsce poza krajami z bazy"}
    if odl == 0 and ile_miast >= 3:
        pewny, powod = True, f"pinezka w granicach kraju, {ile_miast} miast na mapie"
    elif kod in typy_modelu[:3] and odl < 8:
        pewny, powod = True, "zgodne z typem modelu"
    else:
        pewny, powod = False, "wynik przybliżony — potwierdź"
    return {"kod": kod, "pewny": pewny, "lat": lat, "lon": lon, "dokladne": ile_miast >= 3, "odleglosc_km": odleglosc, "miasta": ile_miast, "powod": powod}
