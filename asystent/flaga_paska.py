"""Flaga poprawnego kraju w dolnym pasku wyniku (nowszy układ zwykłej gry: przełącznik · FLAGA ✓/✗ · TIME · DISTANCE · SCORE).

Gra sama pokazuje flagę kraju, w którym była runda, i znaczek: ✓ gdy gracz wskazał ten kraj, ✗ gdy inny.
Porównujemy wycinek z flagami wszystkich krajów z listy (plik flagi.json, miniatury 20x15).
"""
from __future__ import annotations

import base64
import json

import silnik

_flagi: dict = {}


def _wzorce():
    if not _flagi:
        import numpy as np
        for kod, dane in json.loads((silnik.katalog_zasobow() / "flagi.json").read_text(encoding="utf-8")).items():
            _flagi[kod] = np.frombuffer(base64.b64decode(dane), dtype=np.uint8).reshape(15, 20, 3).astype(np.float32)
    return _flagi


def flaga(rgb):
    """Zwraca (kod kraju, przewaga nad drugim kandydatem, czy gracz trafił kraj: True/False/None) albo None, gdy flagi w pasku nie ma."""
    import numpy as np
    from PIL import Image
    w, h = rgb.size
    sk = h / 1080
    x0, y0, x1, y1 = round(w / 2 - 264 * sk), round(1003 * sk), round(w / 2 - 224 * sk), round(1034 * sk)
    wyc = np.asarray(rgb.crop((x0, y0, x1, y1)).convert("RGB")).astype(np.float32)
    r, g, b = wyc[..., 0], wyc[..., 1], wyc[..., 2]
    tlo = (r < 75) & (g < 60) & (b > 40) & (b < 150) & (b > r + 15)        # ciemny fiolet paska
    if tlo.mean() > 0.6 or wyc.std() < 12:
        return None                                                          # w tym miejscu nie ma flagi (starszy układ paska)
    mala = np.asarray(Image.fromarray(wyc.astype(np.uint8)).resize((20, 15), Image.LANCZOS)).astype(np.float32)
    waga = np.ones((15, 20), np.float32)
    waga[8:, 11:] = 0            # prawy dolny róg zasłania znaczek ✓/✗
    waga[0, 0] = waga[0, -1] = waga[-1, 0] = 0      # zaokrąglone rogi
    wyniki = []
    for kod, wz in _wzorce().items():
        roznica = (np.abs(mala - wz).mean(axis=2) * waga).sum() / waga.sum()
        wyniki.append((float(roznica), kod))
    wyniki.sort()
    najl, drugi = wyniki[0], wyniki[1]
    # Znaczek w prawym dolnym rogu flagi: zielony ptaszek albo czerwony krzyżyk. Wystaje poza flagę w prawo i w dół,
    # więc patrzymy tylko na tę wystającą część (na samej fladze czerwień i zieleń należą do flagi).
    zx0, zy0, zx1, zy1 = round(w / 2 - 244 * sk), round(1019 * sk), round(w / 2 - 216 * sk), round(1042 * sk)
    zn = np.asarray(rgb.crop((zx0, zy0, zx1, zy1)).convert("RGB")).astype(np.int16)
    poza = np.ones(zn.shape[:2], bool)
    poza[:max(0, y1 - zy0), :max(0, x1 - zx0)] = False          # część leżąca na fladze
    zr, zg, zb = zn[..., 0], zn[..., 1], zn[..., 2]
    zielone = int((poza & (zg > 170) & (zr < 200) & (zb < 130) & (zg > zr + 30)).sum())
    czerwone = int((poza & (zr > 190) & (zg < 140) & (zb < 150) & (zr > zg + 70)).sum())
    prog = 8 * sk * sk
    trafiony = True if zielone > prog and zielone > 2 * czerwone else (False if czerwone > prog and czerwone > 2 * zielone else None)
    # flagi bardzo podobne do najlepszej (Włochy/Irlandia, Indonezja/Monako) zwracamy jako dodatkowych kandydatów
    kandydaci = [kod for roznica, kod in wyniki if roznica <= najl[0] + 6]
    return {"kod": najl[1], "kandydaci": kandydaci, "roznica": round(najl[0], 1), "przewaga": round(drugi[0] - najl[0], 1), "trafiony": trafiony}
