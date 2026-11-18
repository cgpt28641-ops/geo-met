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


KATEGORIE = {"kamera": "Samochód Google", "tablice": "Tablice", "slupki": "Słupki", "linie": "Linie", "znaki": "Znaki",
             "jezyk": "Język", "slupy": "Słupy", "przyroda": "Przyroda", "inne": "Inne"}

# Ogólne reguły z poradników GeoMeta, które model sam sprawdza na zrzucie.
# Każda grupa: lista (opis po angielsku dla modelu, co widać po polsku, reguła); ostatnia pozycja z None = „nic z tych”.
REGULY = [
    [("a road with a yellow center line", "żółta linia środkowa", "Żółta linia środkowa: obie Ameryki, Norwegia, Finlandia, część Azji (Japonia, Korea, Tajlandia)."),
     ("a road with a white center line", "biała linia środkowa", "Biała linia środkowa: większość Europy, Chile, Australia."),
     ("a dirt road or a road without any painted lines", None, None)],
    [("signs with Cyrillic text", "cyrylica", "Cyrylica: Rosja (ы, э), Ukraina (і, ї, є), Bułgaria (ъ), Serbia (ј, ђ), Mongolia i Kirgistan (ө, ү), Kazachstan (ә, қ)."),
     ("signs with Arabic text", "pismo arabskie", "Pismo arabskie: Tunezja, Jordania, ZEA, Katar, Oman, Egipt, Liban."),
     ("signs with Chinese, Japanese or Korean characters", "pismo wschodnioazjatyckie", "Znaki wschodnioazjatyckie: Japonia (kana), Korea (kółka i kwadraty), Tajwan i Hongkong (tradycyjne chińskie)."),
     ("signs with Thai, Khmer or Indian script", "pismo Azji Płd. i Płd.-Wsch.", "Pisma z pętelkami lub poziomą kreską: Tajlandia, Kambodża, Laos, Indie, Bangladesz, Sri Lanka."),
     ("signs with Greek or Hebrew text", "alfabet grecki lub hebrajski", "Alfabet grecki: Grecja, Cypr. Hebrajski: Izrael."),
     ("signs with Latin alphabet text or no text at all", None, None)],
    [("a desert or very dry landscape", "pustynia / sucho", "Sucho i pusto: Bliski Wschód, Afryka Płn., Australia, Chile, Peru, Meksyk, Mongolia, Kazachstan."),
     ("a tropical landscape with palm trees", "tropiki, palmy", "Tropiki: Azja Płd.-Wsch., Brazylia, Kolumbia, Afryka Zach. i Wsch., Sri Lanka."),
     ("a snowy landscape", "śnieg", "Śnieg: Rosja, Skandynawia, Kanada, Islandia, Grenlandia, Alaska."),
     ("an African savanna with red soil", "sawanna / czerwona ziemia", "Czerwona ziemia i sawanna: Kenia, Uganda, Ghana, Nigeria, Senegal, też Brazylia, Kambodża i Australia."),
     ("a temperate green landscape with fields and forests", None, None)],
    [("cars driving on the left side of the road", "ruch lewostronny", "Ruch lewostronny: Wielka Brytania, Irlandia, Japonia, Australia, NZ, RPA, Indie, Tajlandia, Indonezja, Malezja, Kenia i sąsiedzi."),
     ("cars driving on the right side of the road", None, None),
     ("an empty road without cars", None, None)],
]


def sprawdz_reguly(obrazy: list, prog: float = 0.8) -> list[dict]:
    """Sprawdza na zrzutach ogólne reguły (linie, pismo, krajobraz, ruch)."""
    _zaladuj()
    torch, model, proc = _stan["torch"], _stan["model"], _stan["proc"]
    if "reguly" not in _stan:
        with torch.no_grad():
            emb = []
            for grupa in REGULY:
                wej = proc(text=[f"A Street View photo showing {g[0]}." for g in grupa], return_tensors="pt", padding=True).to(_stan["urz"])
                t = model.text_projection(model.text_model(**wej).pooler_output)
                emb.append(t / t.norm(dim=-1, keepdim=True))
        _stan["reguly"] = emb
    wynik = []
    with torch.no_grad():
        obr = []
        for img in obrazy:
            wej = proc(images=img.convert("RGB"), return_tensors="pt").to(_stan["urz"])
            o = model.visual_projection(model.vision_model(**wej).pooler_output)
            obr.append(o / o.norm(dim=-1, keepdim=True))
        for grupa, emb in zip(REGULY, _stan["reguly"]):
            p = sum((100 * o @ emb.T).softmax(-1)[0] for o in obr) / len(obr)
            i = int(p.argmax())
            if grupa[i][1] and float(p[i]) >= prog:
                wynik.append({"widac": grupa[i][1], "regula": grupa[i][2], "pewnosc": round(float(p[i]) * 100)})
    return wynik


def roznice(a: dict, b: dict, ile: int = 4) -> list[str]:
    """Kategorie, w których oba kraje mają wskazówki — do odróżniania pomylonych krajów."""
    out = []
    for kat in ("slupki", "tablice", "linie", "znaki", "jezyk", "slupy"):
        ca, cb = a.get("clues", {}).get(kat), b.get("clues", {}).get(kat)
        if ca and cb:
            out.append(f"{KATEGORIE[kat]} — {a['pl']}: {ca[0]} ⟷ {b['pl']}: {cb[0]}")
    return out[:ile]


def lekcja(widoki: list, poprawny_kod: str, trafiony: bool) -> dict:
    """Lekcja po rundzie: typy modelu, reguły sprawdzone na zrzutach i wskazówki GeoMeta dla poprawnego kraju."""
    k = kraj(poprawny_kod) or {"pl": poprawny_kod, "summary": "", "tips": [], "clues": {}}
    ost = widoki[-3:]
    typy = typuj(ost, 3) if ost else []
    widziane = sprawdz_reguly(ost) if ost else []
    poz = next((i for i, t in enumerate(typy) if t["kod"] == poprawny_kod), None)
    if not typy:
        ocena = "Brak zapisanych widoków z rundy."
    elif poz == 0:
        ocena = f"Model też wskazał ten kraj ({typy[0]['pewnosc']}%) — widok był dla niego typowy."
    else:
        ocena = "Model typował: " + ", ".join(f"{t['kraj']} {t['pewnosc']}%" for t in typy) + (". Poprawny kraj był w jego trójce." if poz else ". To była trudna runda — widok przypominał inne kraje.")
    pomylony = kraj(typy[0]["kod"]) if typy and poz != 0 else None
    wskazowki = {KATEGORIE[kat]: lst[:3] for kat, lst in k.get("clues", {}).items() if lst}
    pierwsza = next((lst[0] for lst in k.get("clues", {}).values() if lst), "")
    return {
        "tryb_rankingowy": False, "poprawny_kod": poprawny_kod, "poprawny_kraj": k["pl"], "miejsce": "",
        "twoj_strzal": "trafiony" if trafiony else "inny kraj", "trafiony_kraj": trafiony,
        "lekcja": f"{k['summary']} {ocena}", "przeoczone": k["tips"][:3],
        "zagadka": pierwsza, "model": typy, "widziane": widziane, "wskazowki": wskazowki,
        "pomylony": pomylony["pl"] if pomylony else "", "roznice": roznice(k, pomylony) if pomylony else [],
    }
