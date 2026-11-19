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
    skala = (h / 1080) ** 2
    if ile[i] < 320 * skala:
        return None
    # flaga jest mała: przy prawdziwej pinezce żółtych pikseli jest kilkadziesiąt, a nie setki (awatary, paski życia)
    if not (6 * skala <= int(((abs(xs - xs[i]) < 14) & (abs(ys - ys[i]) < 14)).sum()) <= 90 * skala):
        return None
    blisko = (abs(xs - xs[i]) < 14) & (abs(ys - ys[i]) < 14) & (ile > 200 * skala)
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


_baza: dict = {}
_surowa: dict = {}


def miasta_w_okolicy(lat: float, lon: float, ile: int = 6, dlat: float = 1.4, dlon: float = 2.0) -> list[dict]:
    """Największe miejscowości w pobliżu punktu (do orientacji na przybliżonej mapie w okienku)."""
    baza_miast()
    if not _surowa:
        return []
    wybrane = []     # lista w bazie jest ułożona od największych miast
    for i, (_, la, lo) in enumerate(_surowa["m"]):
        if abs(la - lat) <= dlat and abs(lo - lon) <= dlon and all(abs(la - w[1]) + abs(lo - w[2]) > 0.35 for w in wybrane):
            wybrane.append((i, la, lo))
            if len(wybrane) >= ile:
                break
    if not wybrane:
        return []
    nazwy, szukane = {}, {w[0] for w in wybrane}
    for klucz, ids in _surowa["k"].items():     # pierwsza nazwa danego miasta w bazie to jego nazwa główna
        for i in ids:
            if i in szukane and i not in nazwy:
                nazwy[i] = klucz.title()
        if len(nazwy) == len(szukane):
            break
    return [{"lat": la, "lon": lo, "napis": nazwy.get(i, ""), "kolor": "#cfd6e6", "tlo": True} for i, la, lo in wybrane]


def baza_miast():
    """Duża baza miejscowości do czytania map (ok. 70 tys., z nazwami w różnych językach): nazwa → lista (kraj, szerokość, długość)."""
    if not _baza:
        import json
        try:
            d = json.loads((silnik.katalog_zasobow() / "miasta_mapa.json").read_text(encoding="utf-8"))
            _surowa.update(d)
            _baza.update({k: [d["m"][i] for i in ids] for k, ids in d["k"].items()})
        except Exception:   # brak dużej bazy — zostaje mniejsza lista miast
            _baza.update({k: [[m[1], m[2], m[3]]] for k, m in silnik_lokalny.miasta().items()})
    return _baza


def _odleglosc_z_paska(rgb, czyt):
    """Zwykła gra: odległość z dolnego paska pod napisem DISTANCE (np. „498 km”). Zwraca kilometry albo None.

    Cyfry są dużo wyższe niż dopisek „km”, więc najpierw oddzielamy je po wysokości znaków i czytamy same cyfry.
    """
    import numpy as np
    from PIL import Image
    try:
        w, h = rgb.size
        x0, y0 = int(w * 0.405), int(h * 0.932)
        wyc = rgb.crop((x0, y0, int(w * 0.49), int(h * 0.968)))
        a = np.asarray(wyc).min(axis=2) > 190           # białe znaki na ciemnym tle
        kolumny = a.any(axis=0)
        znaki, start = [], None
        for x, jest in enumerate(list(kolumny) + [False]):
            if jest and start is None:
                start = x
            elif not jest and start is not None:
                wiersze = np.nonzero(a[:, start:x].any(axis=1))[0]
                znaki.append((start, x, int(wiersze[-1] - wiersze[0] + 1)))
                start = None
        znaki = [z for z in znaki if z[2] >= 5]
        if not znaki:
            return None
        najw = max(z[2] for z in znaki)
        duze = [z for z in znaki if z[2] >= 0.8 * najw]
        # liczba to pierwsza zwarta grupa dużych znaków (dalej, po prawej, bywa już kolumna SCORE)
        grupa = [duze[0]]
        for z in duze[1:]:
            przerwa = z[0] - grupa[-1][1]
            # większa przerwa to koniec liczby (dalej jest „km”), chyba że stoi w niej przecinek tysięcy („7,686”)
            przecinek = any(grupa[-1][1] <= m[0] and m[1] <= z[0] and m[2] < 0.5 * najw for m in znaki)
            if przerwa > najw * 0.3 and not (przecinek and przerwa < najw * 0.9):
                break
            grupa.append(z)
        male = [z for z in znaki if z[2] < 0.8 * najw and grupa[-1][1] <= z[0] <= grupa[-1][1] + najw * 3]
        prawa = grupa[-1][1] + (max(1, (male[0][0] - grupa[-1][1]) // 2) if male else 6)     # nie zahaczamy o literę „k”
        cyfry = Image.new("RGB", (prawa - grupa[0][0] + 24, wyc.height), (30, 20, 70))
        cyfry.paste(wyc.crop((max(0, grupa[0][0] - 6), 0, prawa, wyc.height)), (9, 0))
        cyfry = cyfry.resize((cyfry.width * 4, cyfry.height * 4), Image.LANCZOS)
        tekst = "".join(t for _, t, _ in czyt.readtext(np.asarray(cyfry), allowlist="0123456789"))
        szer_jedn = (male[-1][1] - male[0][0]) if male else 0
        metry = bool(male) and szer_jedn < 1.5 * max(z[2] for z in male)     # samo „m” jest wąskie, „km” szerokie
        silnik.log(f"dolny pasek (odległość): cyfry {tekst!r} · jednostka {'m' if metry else 'km'} (szerokość {szer_jedn})")
        if not tekst:
            return None
        return round(int(tekst) / 1000) if metry else int(tekst)
    except Exception:
        silnik.log("BŁĄD odczytu odległości z dolnego paska", blad=True)
        return None


def odczytaj(img, typy_modelu: list[str] | None = None) -> dict | None:
    """Jak _odczytaj, ale pilnuje, żeby w tym samym czasie nie działała analiza w tle."""
    with silnik_lokalny._gpu:
        return _odczytaj(img, typy_modelu)


def _odczytaj(img, typy_modelu: list[str] | None = None) -> dict | None:
    """Zwraca {kod, pewny, lat, lon, miasta, odleglosc_km, powod} albo None, gdy nie da się nic ustalić."""
    import numpy as np
    typy_modelu = typy_modelu or []
    miasta = baza_miast()
    nazwy_krajow = {silnik_lokalny._uprosc(k["pl"]): k["id"] for k in silnik_lokalny.kraje()}
    w, h = img.size
    pojedynek = silnik.rodzaj_ekranu(img) == "wynik"      # fioletowy pasek u góry; w zwykłej grze mapa jest na cały ekran
    gora = 0.22 if pojedynek else 0.06
    pin = pinezka(img)
    if pin and not (h * gora < pin[1] < h * 0.97 and w * 0.02 < pin[0] < w * 0.98):
        pin = None
    rgb = img.convert("RGB")
    czyt = silnik_lokalny.czytnik()
    # Czytamy tylko okolicę pinezki (tam są napisy potrzebne do ustalenia miejsca) — to kilka razy szybsze niż cały ekran.
    if pin:
        x0, x1 = int(max(0, pin[0] - w * 0.36)), int(min(w, pin[0] + w * 0.36))
        y0, y1 = int(max(h * gora, pin[1] - h * 0.42)), int(min(h * (1.0 if pojedynek else 0.89), pin[1] + h * 0.42))
    else:
        x0, y0, x1, y1 = 0, int(h * gora), w, h
    odczyty = [([[q[0] + x0, q[1] + y0] for q in pole], t, pw) for pole, t, pw in czyt.readtext(np.asarray(rgb.crop((x0, y0, x1, y1))))]
    if pojedynek:   # pasek z odległościami („66 km | 146 km”) pod wynikiem rundy
        px0, py0 = int(w * 0.30), int(h * 0.17)
        odczyty += [([[q[0] + px0, q[1] + py0] for q in pole], t, pw) for pole, t, pw in czyt.readtext(np.asarray(rgb.crop((px0, py0, int(w * 0.70), int(h * 0.27)))))]
    silnik.log(f"mapa wyniku: zrzut {w}x{h} · pinezka {pin} · czytany obszar {x0},{y0}–{x1},{y1} · odczytane napisy ({len(odczyty)}): "
               + " | ".join(f"{t} [{int(pole[0][0])},{int(pole[0][1])}]" for pole, t, pw in odczyty[:60]))

    # odległość gracza: pierwszy od lewej napis „… km” w górnej części ekranu (pojedynek) albo w dolnym panelu (zwykła gra)
    km, km_dol = [], []
    for pole, tekst, pw in odczyty:
        m = re.search(r"(\d[\d  .,]*)\s*km\b", tekst.lower())
        if not m or not re.sub(r"\D", "", m.group(1)):
            continue
        wartosc = int(re.sub(r"\D", "", m.group(1)))
        if pole[0][1] < h * 0.35:
            km.append((pole[0][0], wartosc))
        elif pole[0][1] > h * 0.80 and pole[0][0] < w * 0.80:      # prawy dolny róg to podziałka mapy, nie wynik
            km_dol.append((pole[0][0], wartosc))
    odleglosc = min(km)[1] if km else (min(km_dol)[1] if km_dol else None)
    if not pojedynek:
        odleglosc = _odleglosc_z_paska(rgb, czyt)

    kotwice = []  # (x, y, lon, lat, czy_miasto, nr napisu) — jeden napis może mieć kilka możliwych miejsc (miasta o tej samej nazwie)
    for nr, (pole, tekst, pw) in enumerate(odczyty):
        if pw < 0.4 or pole[0][1] < h * gora:
            continue
        klucz = silnik_lokalny._uprosc(tekst).strip(" .,-")
        cy = (pole[0][1] + pole[2][1]) / 2
        if len(klucz) >= 4 and klucz in miasta:
            for _, lat, lon in miasta[klucz]:
                kotwice.append((pole[0][0] - 8, cy, lon, lat, True, nr))  # kropka miasta jest tuż na lewo od napisu
        elif klucz in nazwy_krajow and _srodek_kraju(nazwy_krajow[klucz]):
            lon, lat = _srodek_kraju(nazwy_krajow[klucz])
            kotwice.append(((pole[0][0] + pole[2][0]) / 2, cy, lon, lat, False, nr))
    if not pin or len({k[5] for k in kotwice}) < 2:
        return {"kod": None, "pewny": False, "odleglosc_km": odleglosc, "miasta": 0, "powod": "brak pinezki na mapie" if not pin else "za mało napisów na mapie"} if odleglosc is not None or pin else None

    X = np.array([k[0] for k in kotwice], float)
    Y = np.array([k[1] for k in kotwice], float)
    L = np.radians([k[2] for k in kotwice])
    M = np.array([_mercator(k[3]) for k in kotwice])
    miasto = np.array([k[4] for k in kotwice])
    napis = np.array([k[5] for k in kotwice])
    prog = np.where(miasto, 30.0, 160.0)
    waga = np.where(miasto, 1.0, 0.3)

    def zgodne(s, tx, ty):
        """Dla każdego napisu najwyżej jedno miejsce: to, które najlepiej pasuje do ułożenia mapy."""
        blad = np.hypot(s * L + tx - X, -s * M + ty - Y)
        najl = {}
        for i in np.nonzero(blad <= prog)[0]:
            if napis[i] not in najl or blad[i] < blad[najl[napis[i]]]:
                najl[napis[i]] = i
        return list(najl.values())

    # Część napisów to pomyłki albo miasta o tej samej nazwie gdzie indziej, więc szukamy takiego ułożenia mapy
    # (skala i przesunięcie), z którym zgadza się najwięcej napisów: próbujemy pary i liczymy pasujące.
    import random
    pary = [(i, j) for i in range(len(kotwice)) for j in range(i + 1, len(kotwice)) if napis[i] != napis[j]]
    if len(pary) > 5000:
        pary = random.Random(1).sample(pary, 5000)
    najl = None
    for i, j in pary:
        dx, dl = X[j] - X[i], L[j] - L[i]
        dy, dm = Y[j] - Y[i], M[j] - M[i]
        if abs(dx) >= abs(dy):
            if abs(dl) < 1e-6 or abs(dx) < 40:
                continue
            s = dx / dl
        else:
            if abs(dm) < 1e-6 or abs(dy) < 40:
                continue
            s = -dy / dm
        if not (150 < s < 5e6):
            continue
        tx, ty = X[i] - s * L[i], Y[i] + s * M[i]
        blad = np.hypot(s * L + tx - X, -s * M + ty - Y)
        ok = blad <= prog
        ocena = sum(waga[k] for k in {napis[k]: k for k in np.nonzero(ok)[0]}.values())
        if najl is None or ocena > najl[0]:
            najl = (ocena, s, tx, ty)
    if najl is None:
        return {"kod": None, "pewny": False, "odleglosc_km": odleglosc, "miasta": 0, "powod": "nie udało się dopasować mapy"}
    wybrane = zgodne(*najl[1:])
    if len(wybrane) < 2:
        return {"kod": None, "pewny": False, "odleglosc_km": odleglosc, "miasta": 0, "powod": "nie udało się dopasować mapy"}
    A, B = [], []
    for i in wybrane:      # dokładne dopasowanie na samych zgodnych napisach
        A += [[waga[i] * L[i], waga[i], 0], [-waga[i] * M[i], 0, waga[i]]]
        B += [waga[i] * X[i], waga[i] * Y[i]]
    s, tx, ty = np.linalg.lstsq(np.array(A), np.array(B), rcond=None)[0]
    if s <= 0:
        return {"kod": None, "pewny": False, "odleglosc_km": odleglosc, "miasta": 0, "powod": "nie udało się dopasować mapy"}
    ile_miast = int(sum(1 for i in wybrane if miasto[i]))
    lon = math.degrees((pin[0] - tx) / s)
    lat = math.degrees(2 * math.atan(math.exp((ty - pin[1]) / s)) - math.pi / 2)
    kod, odl = kraj_w_punkcie(lon, lat)
    znany = bool(kod) and silnik_lokalny.kraj(kod) is not None
    if not znany:
        return {"kod": None, "pewny": False, "lat": lat, "lon": lon, "odleglosc_km": odleglosc, "miasta": ile_miast, "powod": "miejsce poza krajami z bazy"}
    if odl == 0 and ile_miast >= 4:
        pewny, powod = True, f"pinezka w granicach kraju, {ile_miast} miast na mapie"
    elif kod in typy_modelu[:3] and odl < 8:
        pewny, powod = True, "zgodne z typem modelu"
    else:
        pewny, powod = False, "wynik przybliżony — potwierdź"
    return {"kod": kod, "pewny": pewny, "lat": lat, "lon": lon, "dokladne": ile_miast >= 4, "odleglosc_km": odleglosc, "miasta": ile_miast, "powod": powod}
