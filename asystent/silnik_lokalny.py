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


def _fragmenty(img) -> list:
    w, h = img.size
    img = img.convert("RGB").crop((0, int(h * 0.10), w, int(h * 0.90)))  # bez pasków interfejsu gry
    w, h = img.size
    cw = w // 2
    return [img] + [img.crop((x, 0, x + cw, h)) for x in (0, (w - cw) // 2, w - cw)]


# Reguły z napisów (poradniki GeoMeta: litery i słowa charakterystyczne dla krajów)
LITERY = {"ł": ["pl"], "ń": ["pl"], "ż": ["pl"], "ź": ["pl"], "ą": ["pl", "lt"], "ę": ["pl", "lt"],
          "ř": ["cz"], "ě": ["cz"], "ů": ["cz"], "ľ": ["sk"], "ĺ": ["sk"], "ŕ": ["sk"],
          "ő": ["hu"], "ű": ["hu"], "ș": ["ro"], "ț": ["ro"], "ă": ["ro", "vn"],
          "ğ": ["tr"], "ı": ["tr"], "ė": ["lt"], "į": ["lt"], "ų": ["lt"],
          "ā": ["lv"], "ē": ["lv"], "ī": ["lv"], "ķ": ["lv"], "ļ": ["lv"], "ņ": ["lv"],
          "þ": ["is"], "ð": ["is", "fo"], "ß": ["de", "at"], "ø": ["no", "dk", "fo"], "æ": ["no", "dk", "is", "fo"],
          "å": ["se", "no", "dk", "fi"], "õ": ["ee", "pt", "br"], "ã": ["pt", "br"],
          "ñ": ["es", "mx", "ar", "cl", "co", "pe", "ec", "bo", "uy", "gt", "cr", "pa", "do", "pr"]}
SLOWA = {"ulica": ["pl", "hr", "rs", "si", "me"], "straße": ["de", "at"], "strasse": ["de", "at", "ch", "li"],
         "rua": ["pt", "br"], "avenida": ["es", "pt", "br", "mx", "ar", "cl", "co", "pe", "ec", "bo", "uy"],
         "calle": ["es", "mx", "ar", "cl", "co", "pe", "ec", "bo", "uy", "gt", "cr", "pa", "do", "pr"],
         "pare": ["br", "ar", "cl", "co", "pe", "ec", "bo", "uy"], "alto": ["mx", "gt", "cr", "pa", "do"],
         "arrêt": ["ca"], "rue": ["fr", "be", "lu", "ch", "ca", "sn", "tn", "mg"], "utca": ["hu"], "jalan": ["id", "my", "sg"],
         "gatan": ["se"], "vägen": ["se"], "veien": ["no"], "vegen": ["no"], "katu": ["fi"], "straat": ["nl", "be"],
         "iela": ["lv"], "gatvė": ["lt"], "tänav": ["ee"], "cadde": ["tr"], "caddesi": ["tr"], "sokak": ["tr"],
         "strada": ["ro", "it"], "piazza": ["it"], "apteka": ["pl"], "sklep": ["pl"], "lekárna": ["cz"], "potraviny": ["cz", "sk"],
         "farmacia": ["es", "it", "mx", "ar", "cl", "co", "pe"], "boulangerie": ["fr", "be"], "bäckerei": ["de", "at", "ch"]}


def napisy_dostepne() -> bool:
    try:
        import easyocr  # noqa: F401
        return True
    except Exception:
        return False


def czytaj_napisy(obrazy: list) -> list[dict]:
    """Odczytuje napisy z widoku (bez interfejsu gry) i dopasowuje do nich reguły. Wymaga biblioteki easyocr."""
    if not obrazy or not napisy_dostepne():
        return []
    import re

    import numpy as np
    if "ocr" not in _stan:
        import easyocr
        import torch
        _stan["ocr"] = easyocr.Reader(["en", "pl", "cs", "sk", "hu", "ro", "tr", "es", "pt", "fr", "de", "lt", "lv", "et", "da", "no", "sv", "is", "it", "nl"],
                                      gpu=torch.cuda.is_available(), verbose=False)
    domeny = {k["domain"].lstrip("."): k["id"] for k in kraje() if k.get("domain")}
    if "miasta" not in _stan:
        _stan["miasta"] = json.loads((silnik.katalog_zasobow() / "miasta.json").read_text(encoding="utf-8"))
    import unicodedata
    uprosc = lambda t: "".join(c for c in unicodedata.normalize("NFD", t.lower().replace("ł", "l").replace("ø", "o").replace("đ", "d")) if unicodedata.category(c) != "Mn")
    wynik, widziane = [], set()
    for img in obrazy:
        w, h = img.size
        img = img.convert("RGB").copy()
        px = np.asarray(img).copy()
        px[: int(h * 0.12)] = 0                      # górny pasek gry
        px[int(h * 0.72):, int(w * 0.80):] = 0       # minimapa
        px[int(h * 0.50):, : int(w * 0.07)] = 0      # przyciski po lewej
        px[int(h * 0.95):] = 0                       # stopka Google
        for _, tekst, pewnosc in _stan["ocr"].readtext(px):
            t = tekst.strip().lower()
            if pewnosc < 0.55 or len(t) < 3 or t in widziane or "google" in t:
                continue
            kody, powod = [], ""
            miasto = _stan["miasta"].get(uprosc(t).strip(" .,-")) if pewnosc >= 0.6 and len(t) >= 5 else None
            if miasto:
                widziane.add(t)
                wynik.append({"napis": tekst.strip(), "powod": "nazwa miasta", "kody": [miasto[1]], "kraje": kraj(miasto[1])["pl"] if kraj(miasto[1]) else miasto[1],
                              "miasto": {"nazwa": miasto[0], "lat": miasto[2], "lon": miasto[3]}})
                continue
            m = re.search(r"\.([a-z]{2})\b", t)
            if m and m.group(1) in domeny and ("www" in t or "." in t[:-3]):
                kody, powod = [domeny[m.group(1)]], f"domena .{m.group(1)}"
            if not kody:
                for slowo in re.findall(r"[^\W\d_]+", t):
                    if slowo in SLOWA:
                        kody, powod = SLOWA[slowo], f"słowo „{slowo}”"
                        break
            if not kody and pewnosc >= 0.7 and len(t) >= 4:
                for lit, k in LITERY.items():
                    if lit in t:
                        kody, powod = k, f"litera „{lit}”"
                        break
            if kody:
                widziane.add(t)
                nazwy = ", ".join(kraj(k)["pl"] for k in kody[:6] if kraj(k)) + ("…" if len(kody) > 6 else "")
                wynik.append({"napis": tekst.strip(), "powod": powod, "kody": kody, "kraje": nazwy})
    return wynik[:5]


def ostatnie_napisy() -> list[dict]:
    return _stan.get("ostatnie_napisy", [])


def typuj(obrazy: list, ile: int = 5, uzyj_napisow: bool = True) -> list[dict]:
    """Zwraca najbardziej prawdopodobne kraje dla zrzutów (uśrednione)."""
    _zaladuj()
    torch, model, proc = _stan["torch"], _stan["model"], _stan["proc"]
    suma = None
    with torch.no_grad():
        for img in obrazy:
            # cały widok + trzy fragmenty (lewy, środek, prawy) — w teście dało to wyraźnie lepszą trafność
            wej = proc(images=_fragmenty(img), return_tensors="pt").to(_stan["urz"])
            o = model.visual_projection(model.vision_model(**wej).pooler_output)
            o = o / o.norm(dim=-1, keepdim=True)
            pr = (100 * o @ _stan["tekst"].T).softmax(-1)
            p = (pr[0] * 2 + pr[1:].sum(0)) / 5   # cały widok liczy się podwójnie
            suma = p if suma is None else suma + p
    p = (suma / len(obrazy)).cpu()
    napisy = czytaj_napisy(obrazy[-1:]) if uzyj_napisow else []
    if napisy:
        lista = kraje()
        for n in napisy:  # reguła z napisu podbija pasujące kraje
            for i, k in enumerate(lista):
                if k["id"] in n["kody"]:
                    p[i] = p[i] * 3 + 0.02
        p = p / p.sum()
    _stan["ostatnie_napisy"] = napisy
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


def _reguly_krajow(plik_danych: str = "reguly.json", klucz: str = "rk"):
    """Reguły rozpoznawania z GeoMeta (Plonk It) jako opisy dla modelu; liczone raz i zapisywane na dysku."""
    if klucz in _stan:
        return _stan[klucz]
    _zaladuj()
    torch, model, proc = _stan["torch"], _stan["model"], _stan["proc"]
    dane = json.loads((silnik.katalog_zasobow() / plik_danych).read_text(encoding="utf-8"))
    wpisy = [(kod, en, pl) for kod, lst in dane.items() for en, pl in lst]
    plik = silnik.katalog_aplikacji() / f"{klucz}-{len(wpisy)}.pt"
    emb = None
    if plik.exists():
        try:
            emb = torch.load(plik, map_location=_stan["urz"])
        except Exception:
            emb = None
    if emb is None or len(emb) != len(wpisy):
        czesci = []
        with torch.no_grad():
            for i in range(0, len(wpisy), 64):
                wej = proc(text=[w[1] for w in wpisy[i:i + 64]], return_tensors="pt", padding=True, truncation=True, max_length=77).to(_stan["urz"])
                t = model.text_projection(model.text_model(**wej).pooler_output)
                czesci.append(t / t.norm(dim=-1, keepdim=True))
        emb = torch.cat(czesci)
        try:
            torch.save(emb.cpu(), plik)
        except Exception:
            pass
    _stan[klucz] = (wpisy, emb.to(_stan["urz"]))
    return _stan[klucz]


def pasujace_reguly(obrazy: list, kod: str, ile: int = 3, regionalne: bool = False) -> list[str]:
    """Reguły danego kraju (albo jego regionów), które najlepiej pasują do zrzutów (po polsku)."""
    wpisy, emb = _reguly_krajow("reguly_regiony.json", "rr") if regionalne else _reguly_krajow()
    idx = [i for i, w in enumerate(wpisy) if w[0] == kod]
    if not idx or not obrazy:
        return []
    torch, model, proc = _stan["torch"], _stan["model"], _stan["proc"]
    with torch.no_grad():
        suma = 0
        for img in obrazy:
            wej = proc(images=img.convert("RGB"), return_tensors="pt").to(_stan["urz"])
            o = model.visual_projection(model.vision_model(**wej).pooler_output)
            suma = suma + (o / o.norm(dim=-1, keepdim=True)) @ emb[idx].T
        top = suma[0].topk(min(ile, len(idx))).indices.tolist()
    return [wpisy[idx[i]][2] for i in top]


def typuj_region(obrazy: list, kod: str, ile: int = 3) -> list[dict]:
    """Najbardziej prawdopodobne regiony (województwa, stany, prowincje) w danym kraju."""
    if "regiony" not in _stan:
        _stan["regiony"] = json.loads((silnik.katalog_zasobow() / "regiony.json").read_text(encoding="utf-8"))
    lista, k = _stan["regiony"].get(kod), kraj(kod)
    if not lista or not k or not obrazy:
        return []
    _zaladuj()
    torch, model, proc = _stan["torch"], _stan["model"], _stan["proc"]
    with torch.no_grad():
        wej = proc(text=[f"A Street View photo in {r[0]}, {k['en']}." for r in lista], return_tensors="pt", padding=True, truncation=True, max_length=77).to(_stan["urz"])
        t = model.text_projection(model.text_model(**wej).pooler_output)
        t = t / t.norm(dim=-1, keepdim=True)
        suma = 0
        for img in obrazy:
            w, h = img.size
            wej = proc(images=img.convert("RGB").crop((0, int(h * 0.06), w, int(h * 0.88))), return_tensors="pt").to(_stan["urz"])
            o = model.visual_projection(model.vision_model(**wej).pooler_output)
            suma = suma + (100 * (o / o.norm(dim=-1, keepdim=True)) @ t.T).softmax(-1)[0]
        p = (suma / len(obrazy)).cpu()
    top = p.topk(min(ile, len(lista)))
    return [{"region": lista[i][1], "pewnosc": round(float(v) * 100), "lat": lista[i][2], "lon": lista[i][3]} for v, i in zip(top.values, top.indices)]


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
        "napisy": ostatnie_napisy(),
        "pasujace": pasujace_reguly(ost, poprawny_kod),
        "regiony": typuj_region(ost, poprawny_kod),
        "pasujace_regionalne": pasujace_reguly(ost, poprawny_kod, 3, regionalne=True),
        "pasujace_pomylony": pasujace_reguly(ost, pomylony["id"], 2) if pomylony else [],
    }
