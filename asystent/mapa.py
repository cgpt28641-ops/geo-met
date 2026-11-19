"""Mapa w okienku asystenta: liczy, co i gdzie narysować (bez zależności od tkinter, więc da się to testować)."""
from __future__ import annotations

import json

import silnik

KOLORY = ["#22c47f", "#8fd9b3", "#c9ecd9"]   # 1., 2. i 3. typ
TLO, LAD, KRAWEDZ = "#0d1830", "#2a3654", "#4a5878"
_dane: dict = {}


def _wczytaj() -> dict:
    if not _dane:
        _dane.update(json.loads((silnik.katalog_zasobow() / "mapa.json").read_text(encoding="utf-8")))
        for wpis in _dane["kraje"]:
            nowe = []
            for ring in wpis[1]:
                xs, ys = [p[0] for p in ring], [p[1] for p in ring]
                if max(ys) < -60:
                    continue  # Antarktyda
                if max(xs) - min(xs) > 180:  # fragment przecina linię zmiany daty — rozwiń go na wschód
                    ring = [[p[0] + 360 if p[0] < 0 else p[0], p[1]] for p in ring]
                    xs = [p[0] for p in ring]
                nowe.append((ring, (min(xs), min(ys), max(xs), max(ys))))
            wpis[1] = nowe
    return _dane


def plan(kody: list[str], punkty: list[dict], szer: int, wys: int) -> dict:
    """kody: typowane kraje (od najlepszego). punkty: [{lat, lon, napis, kolor}]. Zwraca wielokąty i znaczniki w pikselach."""
    d = _wczytaj()
    ramki = []
    for kod in kody[:3]:
        ringi = [r for k, rs in d["kraje"] if k == kod for r in rs]
        if ringi:  # największy fragment kraju (bez zamorskich wysp)
            ramki.append(max(ringi, key=lambda r: (r[1][2] - r[1][0]) * (r[1][3] - r[1][1]))[1])
        elif kod in d.get("punkty", {}):
            x, y = d["punkty"][kod]
            ramki.append((x - 3, y - 3, x + 3, y + 3))
    dokladne = [p for p in punkty if p.get("dokladny")]
    if dokladne:  # znamy konkretne miejsce (pinezka z mapy wyniku albo miasto z napisu) — przybliżamy mapę na nie, a nie na cały kraj
        ramki = [(p["lon"] - 1.6, p["lat"] - 1.1, p["lon"] + 1.6, p["lat"] + 1.1) for p in dokladne]
    else:
        ramki += [(p["lon"] - 1, p["lat"] - 1, p["lon"] + 1, p["lat"] + 1) for p in punkty if not p.get("tlo")]
    if ramki:
        x0, y0 = min(r[0] for r in ramki), min(r[1] for r in ramki)
        x1, y1 = max(r[2] for r in ramki), max(r[3] for r in ramki)
    if not ramki or x1 - x0 > 200:
        x0, y0, x1, y1 = -170, -58, 180, 80
    mx, my = (max(0.4, (x1 - x0) * 0.15), max(0.3, (y1 - y0) * 0.15)) if dokladne else (max(4, (x1 - x0) * 0.25), max(3, (y1 - y0) * 0.25))
    x0, x1, y0, y1 = x0 - mx, x1 + mx, max(-85, y0 - my), min(85, y1 + my)
    # dopasuj proporcje do okna
    if (x1 - x0) / (y1 - y0) < szer / wys:
        dod = ((y1 - y0) * szer / wys - (x1 - x0)) / 2
        x0, x1 = x0 - dod, x1 + dod
    else:
        dod = ((x1 - x0) * wys / szer - (y1 - y0)) / 2
        y0, y1 = y0 - dod, y1 + dod
    sx, sy = szer / (x1 - x0), wys / (y1 - y0)
    na_ekran = lambda lon, lat: (round((lon - x0) * sx, 1), round((y1 - lat) * sy, 1))
    wielokaty = []
    for kod, ringi in d["kraje"]:
        kolor = KOLORY[kody.index(kod)] if kod in kody[:3] else LAD
        for ring, (a, b, c, e) in ringi:
            if c < x0 or a > x1 or e < y0 or b > y1:
                continue
            if (c - a) * sx < 1.5 and (e - b) * sy < 1.5 and kolor == LAD:
                continue  # za małe, żeby było widać
            wsp = [v for p in ring for v in na_ekran(p[0], p[1])]
            wielokaty.append((wsp, kolor))
    wielokaty.sort(key=lambda w: w[1] != LAD)  # typowane kraje na wierzchu
    znaczniki = []
    for i, p in enumerate(punkty):  # podpisy na przemian wyżej i niżej, żeby na siebie nie nachodziły
        x, y = na_ekran(p["lon"], p["lat"])
        if p.get("tlo") and not (0 <= x <= szer and 0 <= y <= wys):
            continue
        znaczniki.append((x, y, p["napis"], p.get("kolor", "#f2a516"), -9 if i % 2 else 9, bool(p.get("tlo"))))
    for kod in kody[:3]:  # małe terytoria bez wielokąta
        if kod in d.get("punkty", {}) and not any(k == kod for k, _ in d["kraje"]):
            x, y = d["punkty"][kod]
            znaczniki.append((*na_ekran(x, y), "", KOLORY[kody.index(kod)], 0, False))
    return {"wielokaty": wielokaty, "znaczniki": znaczniki}
