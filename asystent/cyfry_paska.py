"""Odczyt odległości z dolnego paska wyniku w zwykłej grze (TIME · DISTANCE · SCORE).

Zwykłe czytanie tekstu myli się na tej czcionce (144 → 164, 8.3 → 83), więc cyfry rozpoznajemy sami:
porównujemy je piksel po pikselu z wzorcami wyciętymi z prawdziwych pasków (plik cyfry.json).
Wzorce są dla ekranu o wysokości 1080 px; przy innej rozdzielczości pasek jest najpierw przeskalowany.
"""
from __future__ import annotations

import json

import silnik

_wzorce: dict = {}
WYS = 15          # wysokość cyfr we wzorcach


def wzorce() -> dict:
    """Cyfra → lista wzorców (ta sama cyfra bywa narysowana o piksel inaczej, stąd po kilka)."""
    if not _wzorce:
        import numpy as np
        dane = json.loads((silnik.katalog_zasobow() / "cyfry.json").read_text(encoding="utf-8"))
        for cyfra, lista in dane.items():
            _wzorce[cyfra] = [np.array([[z == "1" for z in wiersz] for wiersz in t.split("/")], dtype=bool) for t in lista]
    return _wzorce


def _ocena(okno, t) -> float:
    """Zgodność wycinka z wzorcem cyfry: piksele wspólne minus różniące się."""
    return float((okno & t).sum() - 0.9 * (okno ^ t).sum())


def _grupa_cyfr(a):
    """Znajduje w wierszu z wartościami liczbę, po której stoi mały dopisek („km” albo „m”) — to odległość.
    Czas („0:41”) i punkty („4,502”, żółte, więc i tak niewidoczne w masce) dopisku nie mają.
    Zwraca (maska liczby: 15 wierszy cyfr + 4 pod linią, szerokość dopisku w wysokościach cyfry) albo None."""
    import numpy as np
    wys_paska = a.shape[0]
    znaki, start = [], None
    for x, jest in enumerate(list(a.any(axis=0)) + [False]):
        if jest and start is None:
            start = x
        elif not jest and start is not None:
            wiersze = np.nonzero(a[:, start:x].any(axis=1))[0]
            znaki.append((start, x, int(wiersze[0]), int(wiersze[-1]) + 1))
            start = None
    znaki = [z for z in znaki if 3 <= z[3] - z[2] < 0.8 * wys_paska and z[0] > 0 and z[1] < a.shape[1]]     # bez jasnej krawędzi paska
    wysokosci = [z[3] - z[2] for z in znaki if z[3] - z[2] <= 20]
    if not wysokosci:
        return None
    najw = max(wysokosci)

    def duzy(z):       # cyfra: wysoka jak inne cyfry, ale nie wyższa (flaga i przełącznik w nowszym pasku są wyższe)
        return 0.8 * najw <= z[3] - z[2] <= 20
    i = 0
    while i < len(znaki):
        if not duzy(znaki[i]):
            i += 1
            continue
        g, j = [znaki[i]], i + 1
        while j < len(znaki) and duzy(znaki[j]) and znaki[j][0] - g[-1][1] <= 0.5 * najw:
            g.append(znaki[j])
            j += 1
        male = []
        while j < len(znaki) and not duzy(znaki[j]) and znaki[j][0] - (male[-1][1] if male else g[-1][1]) <= 0.9 * najw:
            male.append(znaki[j])
            j += 1
        dalej = znaki[j][0] - male[-1][1] if male and j < len(znaki) else 999
        szer = (male[-1][1] - male[0][0]) / najw if male else 0
        if male and dalej > 1.2 * najw and szer >= 0.4:
            gora = min(z[2] for z in g)          # górna linia cyfr tej liczby (nie innych elementów paska)
            m = a[gora:gora + WYS + 4, g[0][0]:g[-1][1]]
            if m.shape[0] < WYS + 4:
                m = np.vstack([m, np.zeros((WYS + 4 - m.shape[0], m.shape[1]), bool)])
            return m, szer
        i = j
    return None


def _kawalki(m):
    """Dzieli liczbę na kawałki cyfr rozdzielone kropką dziesiętną („5.8”) albo przecinkiem tysięcy („1,448”).
    Zwraca listę (maska kawałka, znak po nim: "." / "," / None)."""
    import numpy as np
    rozdz, start = [], None
    # przecinek tysięcy: jedyny znak z ogonkiem pod dolną linią cyfr (bywa zrośnięty z sąsiednią cyfrą, więc szukamy po ogonku)
    ogonek = m[WYS:].any(axis=0)
    for x, jest in enumerate(list(ogonek) + [False]):
        if jest and start is None:
            start = x
        elif not jest and start is not None:
            if start >= 6:
                rozdz.append((max(0, start - 1), min(m.shape[1], x + 3), ","))
            start = None
    # kropka dziesiętna: kolumny, w których biel jest tylko przy dolnej linii cyfr (i nie ma ogonka)
    tylko_dol = m[10:].any(axis=0) & ~m[:10].any(axis=0)
    start = None
    for x, jest in enumerate(list(tylko_dol) + [False]):
        if jest and start is None:
            start = x
        elif not jest and start is not None:
            if 3 <= x - start <= 7 and start >= 7 and not any(s0 < x and start < s1 for s0, s1, _ in rozdz):
                rozdz.append((start, x, "."))
            start = None
    rozdz.sort()
    wynik, poz = [], 0
    for s0, s1, znak in rozdz + [(m.shape[1], m.shape[1], None)]:
        kaw = m[:WYS, poz:s0]
        kol = np.nonzero(kaw.any(axis=0))[0]
        if len(kol):
            wynik.append((kaw[:, kol[0]:kol[-1] + 1], znak))
        poz = s1
    return wynik


def _dopasuj(kaw):
    """Najlepszy ciąg cyfr pokrywający kawałek (sąsiednie cyfry często się stykają, więc nie da się ich pociąć na ślepo).
    Zwraca (tekst, ile pikseli wspólnych, ile w sumie) albo None."""
    import numpy as np
    szer = kaw.shape[1]
    najl = {0: (0.0, "", [])}
    for x in range(szer + 1):
        if x not in najl:
            continue
        pkt, txt, uzyte = najl[x]
        for cyfra, lista in wzorce().items():
            for t in lista:
                w = t.shape[1]
                for nak in (0, 1, -1, 2):          # cyfry mogą nachodzić na siebie o piksel–dwa albo mieć piksel odstępu
                    xs = x - nak
                    if xs < 0 or (x == 0 and nak != 0) or xs + w > szer + 1:
                        continue
                    okno = np.zeros_like(t)
                    wyc = kaw[:, xs:xs + w]
                    okno[:, :wyc.shape[1]] = wyc
                    kon = min(szer, xs + w)
                    kand = (pkt + _ocena(okno, t), txt + cyfra, uzyte + [(xs, t)])
                    if kon not in najl or kand[0] > najl[kon][0]:
                        najl[kon] = kand
    if szer not in najl:
        return None
    _, txt, uzyte = najl[szer]
    pokrycie = np.zeros_like(kaw)
    for xs, t in uzyte:
        kon = min(szer, xs + t.shape[1])
        pokrycie[:, xs:kon] |= t[:, :kon - xs]
    return txt, int((pokrycie & kaw).sum()), int((pokrycie | kaw).sum())


def odleglosc(rgb):
    """Odległość w kilometrach z dolnego paska zwykłej gry.

    Zwraca (wartość, pewność 0–1, opis). Wartość to liczba całkowita albo ułamek (np. 5.8); None, gdy paska nie ma.
    Pewność poniżej ok. 0,85 znaczy, że cyfry wyglądają inaczej niż znane wzorce i wyniku nie należy brać na wiarę.
    """
    import numpy as np
    from PIL import Image
    w, h = rgb.size
    wyc = rgb.crop((int(w * 0.30), int(h * 0.934), int(w * 0.56), int(h * 0.968)))      # sam wiersz z wartościami, bez podpisów nad nimi
    if h != 1080:
        wyc = wyc.resize((round(wyc.width * 1080 / h), round(wyc.height * 1080 / h)), Image.LANCZOS)
    a = np.asarray(wyc.convert("RGB")).min(axis=2) > 190           # białe znaki; żółte punkty SCORE tu nie wchodzą
    g = _grupa_cyfr(a)
    if g is None:
        return None, 0.0, "nie znalazłem liczby z dopiskiem km"
    m, szer_dopisku = g
    tekst, wspolne, razem = "", 0, 0
    for kaw, znak in _kawalki(m):
        r = _dopasuj(kaw)
        if r is None:
            return None, 0.0, "cyfry nie dały się dopasować do wzorców"
        tekst += r[0] + (znak or "")
        wspolne += r[1]
        razem += r[2]
    pewnosc = wspolne / max(1, razem)
    metry = szer_dopisku < 0.85            # samo „m” jest wąskie, „km” szerokie
    try:
        liczba = float(tekst.replace(",", ""))
    except ValueError:
        return None, 0.0, f"dziwny odczyt {tekst!r}"
    if metry:
        liczba = round(liczba / 1000, 3)
    wartosc = int(liczba) if liczba == int(liczba) and "." not in tekst and not metry else liczba
    return wartosc, pewnosc, f"{tekst} {'m' if metry else 'km'}"
