"""Darmowy tryb lokalny: model StreetCLIP działa na tym komputerze (bez opłat, bez wysyłania zdjęć)."""
from __future__ import annotations

import json
from pathlib import Path

import silnik

MODEL = "geolocal/StreetCLIP"
_stan: dict = {}


def kraje() -> list[dict]:
    if "kraje" not in _stan:
        _stan["kraje"] = json.loads((silnik.katalog_zasobow() / "kraje.json").read_text(encoding="utf-8"))
    return _stan["kraje"]


def kraj(kod: str) -> dict | None:
    return next((k for k in kraje() if k["id"] == kod), None)


def dostepny() -> tuple[bool, str]:
    try:
        import torch  # noqa: F401
        import transformers  # noqa: F401
        return True, ""
    except Exception as e:  # brak bibliotek (np. w wersji .exe)
        return False, f"Tryb darmowy wymaga bibliotek torch i transformers ({e}). Uruchom „zainstaluj_darmowy.bat”."


def _zaladuj():
    if "model" in _stan:
        return
    import torch
    from transformers import CLIPModel, CLIPProcessor

    urz = "cuda" if torch.cuda.is_available() else "cpu"
    model = CLIPModel.from_pretrained(MODEL).to(urz).eval()
    proc = CLIPProcessor.from_pretrained(MODEL)
    with torch.no_grad():
        wej = proc(text=[f"A Street View photo in {k['en']}." for k in kraje()], return_tensors="pt", padding=True).to(urz)
        t = model.text_projection(model.text_model(**wej).pooler_output)
        t = t / t.norm(dim=-1, keepdim=True)
    _stan.update(model=model, proc=proc, tekst=t, urz=urz, torch=torch)


def urzadzenie() -> str:
    _zaladuj()
    return "karta graficzna" if _stan["urz"] == "cuda" else "procesor"


def typuj(obrazy: list, ile: int = 5) -> list[dict]:
    """Zwraca najbardziej prawdopodobne kraje dla zrzutów (uśrednione)."""
    _zaladuj()
    torch, model, proc = _stan["torch"], _stan["model"], _stan["proc"]
    suma = None
    with torch.no_grad():
        for img in obrazy:
            w, h = img.size
            img = img.convert("RGB").crop((0, int(h * 0.06), w, int(h * 0.88)))  # bez pasków interfejsu gry
            wej = proc(images=img, return_tensors="pt").to(_stan["urz"])
            o = model.visual_projection(model.vision_model(**wej).pooler_output)
            o = o / o.norm(dim=-1, keepdim=True)
            p = (100 * o @ _stan["tekst"].T).softmax(-1)[0]
            suma = p if suma is None else suma + p
    p = (suma / len(obrazy)).cpu()
    top = p.topk(ile)
    lista = kraje()
    return [{"kod": lista[i]["id"], "kraj": lista[i]["pl"], "pewnosc": round(float(v) * 100)} for v, i in zip(top.values, top.indices)]


def lekcja(widoki: list, poprawny_kod: str, trafiony: bool) -> dict:
    """Lekcja po rundzie: co widział model + wskazówki z bazy GeoMeta dla poprawnego kraju."""
    k = kraj(poprawny_kod) or {"pl": poprawny_kod, "summary": "", "tips": [], "clues": []}
    typy = typuj(widoki[-3:], 3) if widoki else []
    poz = next((i for i, t in enumerate(typy) if t["kod"] == poprawny_kod), None)
    if not typy:
        ocena = "Brak zapisanych widoków z rundy."
    elif poz == 0:
        ocena = f"Model też wskazał ten kraj ({typy[0]['pewnosc']}%) — widok był dla niego typowy."
    else:
        ocena = "Model typował: " + ", ".join(f"{t['kraj']} {t['pewnosc']}%" for t in typy) + (". Poprawny kraj był w jego trójce." if poz else ". To była trudna runda — widok przypominał inne kraje.")
    return {
        "tryb_rankingowy": False, "poprawny_kod": poprawny_kod, "poprawny_kraj": k["pl"], "miejsce": "",
        "twoj_strzal": "trafiony" if trafiony else "inny kraj", "trafiony_kraj": trafiony,
        "lekcja": f"{k['summary']} {ocena}", "przeoczone": (k["tips"] + k["clues"])[:5],
        "zagadka": (k["clues"] or [""])[0], "model": typy,
    }
