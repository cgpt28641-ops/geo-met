"""Darmowy tryb lokalny: model StreetCLIP działa na tym komputerze (bez opłat, bez wysyłania zdjęć)."""
from __future__ import annotations

import json
import threading
from pathlib import Path

import silnik

MODEL = "geolocal/StreetCLIP"
_stan: dict = {}
_blokada = threading.RLock()      # model i czytnik napisów wczytuje naraz tylko jeden wątek
_pamiec_ocr: dict = {}            # napisy już odczytane z danego zrzutu (żeby nie czytać go drugi raz)


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


def przygotuj() -> None:
    """Wczytuje model i czytnik napisów zawczasu (w tle po starcie), żeby pierwsza analiza nie czekała."""
    try:
        _zaladuj()
        if napisy_dostepne():
            czytnik()
        silnik.log("model i czytnik napisów gotowe")
    except Exception:
        silnik.log("BŁĄD przy wczytywaniu modelu", blad=True)


def _zaladuj():
    if "model" in _stan:
        return
    with _blokada:
        _zaladuj_naprawde()


def _zaladuj_naprawde():
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
    try:
        karta = torch.cuda.get_device_name(0) if urz == "cuda" else "brak (procesor)"
        silnik.log(f"model wczytany · torch {torch.__version__} · urządzenie {urz} · karta: {karta} · czytanie napisów: {napisy_dostepne()}")
    except Exception:
        pass


def urzadzenie() -> str:
    _zaladuj()
    return "karta graficzna" if _stan["urz"] == "cuda" else "procesor"


def pamiec_karty_mb():
    """(zajęte na całej karcie, cała pamięć, ile bierze asystent) w MB albo None, gdy brak karty NVIDIA."""
    import subprocess
    try:
        wyn = subprocess.run(["nvidia-smi", "--query-gpu=memory.used,memory.total", "--format=csv,noheader,nounits"],
                             capture_output=True, text=True, timeout=5, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        zajete, cala = [int(x) for x in wyn.stdout.strip().splitlines()[0].split(",")]
    except Exception:
        return None
    nasze = 0
    try:
        torch = _stan.get("torch")
        if torch is not None and _stan.get("urz") == "cuda":
            nasze = round(torch.cuda.memory_reserved() / 1024 ** 2)
    except Exception:
        pass
    return zajete, cala, nasze


def pamiec_karty() -> str:
    """Opis zajętej pamięci karty graficznej do pokazania w okienku. Pusty napis, gdy brak karty NVIDIA."""
    m = pamiec_karty_mb()
    if not m:
        return ""
    return f"karta: {m[0] / 1024:.1f} z {m[1] / 1024:.1f} GB" + (f" (asystent {m[2] / 1024:.1f} GB)" if m[2] else "")


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


def _odleglosc1(a: str, b: str) -> bool:
    """Czy napisy różnią się najwyżej jedną literą (zamiana, brak albo nadmiar)."""
    if a == b:
        return True
    if abs(len(a) - len(b)) > 1:
        return False
    if len(a) > len(b):
        a, b = b, a
    for i in range(len(b)):
        if len(a) == len(b):
            if a[:i] + a[i + 1:] == b[:i] + b[i + 1:]:
                return True
        elif a == b[:i] + b[i + 1:]:
            return True
    return False


def _uprosc(t: str) -> str:
    import unicodedata
    return "".join(c for c in unicodedata.normalize("NFD", t.lower().replace("ł", "l").replace("ø", "o").replace("đ", "d")) if unicodedata.category(c) != "Mn")


def miasta() -> dict:
    """Lista miast: uproszczona nazwa → [nazwa, kod kraju, szerokość, długość]."""
    if "miasta" not in _stan:
        _stan["miasta"] = json.loads((silnik.katalog_zasobow() / "miasta.json").read_text(encoding="utf-8"))
        wg = {}
        for klucz, m in _stan["miasta"].items():
            wg.setdefault(m[1], []).append(klucz)
        _stan["miasta_wg_kraju"] = wg
    return _stan["miasta"]


def czytnik():
    """Wspólny program do czytania napisów (ładowany przy pierwszym użyciu)."""
    if "ocr" in _stan:
        return _stan["ocr"]
    with _blokada:
      if "ocr" not in _stan:
        import easyocr
        import torch
        _stan["ocr"] = easyocr.Reader(["en", "pl", "cs", "sk", "hu", "ro", "tr", "es", "pt", "fr", "de", "lt", "lv", "et", "da", "no", "sv", "is", "it", "nl"],
                                        gpu=torch.cuda.is_available(), verbose=False)
    return _stan["ocr"]


# napisy, które są też nazwami miast, ale na ulicy prawie zawsze znaczą coś innego (marki aut, sieci stacji i sklepów)
NIE_MIASTA = {"toyota", "honda", "suzuki", "nissan", "mazda", "ford", "fiat", "opel", "seat", "volvo", "kia", "hyundai", "isuzu", "hino", "scania",
              "shell", "total", "orange", "victoria", "union", "central", "google", "taxi", "bus", "stop", "hotel", "market", "bar", "cafe"}


def czytaj_napisy(obrazy: list, kandydaci: list | None = None) -> list[dict]:
    """Odczytuje napisy z widoku (bez interfejsu gry) i dopasowuje do nich reguły. Wymaga biblioteki easyocr.

    Małe napisy (tabliczki, drogowskazy) są wycinane, powiększane 4x i czytane drugi raz.
    kandydaci: kody krajów typowanych przez model — w nich nazwy miast dopasowuje się też w przybliżeniu.
    """
    if not obrazy or not napisy_dostepne():
        return []
    import re

    import numpy as np
    from PIL import Image
    ocr = czytnik()
    domeny = {k["domain"].lstrip("."): k["id"] for k in kraje() if k.get("domain")}
    miasta()
    wynik, widziane = [], set()
    for img in obrazy:
        img0 = img
        w, h = img.size
        img = img.convert("RGB")
        px = np.asarray(img).copy()
        px[: int(h * 0.12)] = 0                      # górny pasek gry
        px[int(h * 0.72):, int(w * 0.80):] = 0       # minimapa
        px[int(h * 0.50):, : int(w * 0.07)] = 0      # przyciski po lewej
        px[int(h * 0.95):] = 0                       # stopka Google
        try:  # powiększona minimapa (prawa dolna część ekranu): nazwy z mapy to nie napisy z ulicy
            pl = silnik.plaskie_pola(img)
            for wy in range(9, 27, 3):
                for kx in range(24, 48, 3):
                    if pl[wy:wy + 3, kx:kx + 3].mean() >= 0.5:
                        px[int(h * wy / 27):int(h * (wy + 3) / 27), int(w * kx / 48):int(w * (kx + 3) / 48)] = 0
        except Exception:
            pass
        zapamietane = _pamiec_ocr.get(id(img0))
        if zapamietane is not None and zapamietane[0] is img0:
            odczyty = zapamietane[1]
        else:
            pierwsze = ocr.readtext(px, text_threshold=0.5, low_text=0.3)
            odczyty = [(t, float(pw)) for _, t, pw in pierwsze]
            try:  # drugi etap: małe napisy powiększone 4x i sklejone w jeden obraz, czytane za jednym razem (szybciej niż każdy osobno)
                czyste = Image.fromarray(px)
                wycinki = []
                for ramka, _, _ in pierwsze:
                    x0, x1 = min(q[0] for q in ramka), max(q[0] for q in ramka)
                    y0, y1 = min(q[1] for q in ramka), max(q[1] for q in ramka)
                    if y1 - y0 <= 34 and x1 - x0 >= 14:
                        c = czyste.crop((max(0, int(x0) - 8), max(0, int(y0) - 8), int(x1) + 8, int(y1) + 8))
                        wycinki.append(c.resize((c.width * 4, c.height * 4), Image.LANCZOS))
                wycinki = wycinki[:24]
                if wycinki:
                    szer = max(c.width for c in wycinki) + 40
                    arkusz = Image.new("RGB", (szer, sum(c.height + 40 for c in wycinki) + 40), (0, 0, 0))
                    y = 40
                    for c in wycinki:
                        arkusz.paste(c, (20, y))
                        y += c.height + 40
                    odczyty += [(t, float(pw) * 0.9) for _, t, pw in ocr.readtext(np.asarray(arkusz))]
            except Exception:
                silnik.log("BŁĄD przy powiększaniu napisów", blad=True)
            if len(_pamiec_ocr) > 60:
                _pamiec_ocr.clear()
            _pamiec_ocr[id(img0)] = (img0, odczyty)
        for tekst, pewnosc in odczyty:
            t = tekst.strip().lower()
            if len(t) < 3 or t in widziane or "google" in t:
                continue
            kody, powod, miasto = [], "", None
            klucz = _uprosc(t).strip(" .,-")
            if pewnosc >= 0.6 and len(klucz) >= 5:
                miasto = _stan["miasta"].get(klucz) if klucz not in NIE_MIASTA else None
                if miasto:
                    powod = "nazwa miasta"
            if not miasto and kandydaci and pewnosc >= 0.25 and len(klucz) >= 6 and klucz.isalpha():
                for kod in kandydaci:  # przybliżone dopasowanie tylko w typowanych krajach
                    traf = next((m for m in _stan["miasta_wg_kraju"].get(kod, []) if _odleglosc1(klucz, m)), None)
                    if traf:
                        miasto, powod = _stan["miasta"][traf], "nazwa miasta (odczyt przybliżony)"
                        break
            if miasto:
                widziane.add(t)
                wynik.append({"napis": tekst.strip(), "powod": powod, "kody": [miasto[1]], "kraje": kraj(miasto[1])["pl"] if kraj(miasto[1]) else miasto[1],
                              "miasto": {"nazwa": miasto[0], "kod": miasto[1], "lat": miasto[2], "lon": miasto[3]}})
                continue
            if pewnosc < 0.55:
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
    wynik.sort(key=lambda n: "miasto" not in n)
    return wynik[:5]


def ostatnie_napisy() -> list[dict]:
    return _stan.get("ostatnie_napisy", [])


# ── uczenie się na rundach gracza ──
UCZENIE_MIN = 100      # od tylu zapisanych rund asystent sprawdza, czy uczenie pomaga
UCZENIE_ALFA, UCZENIE_BETA = 3.0, 20.0


def _plik_uczenia():
    return silnik.katalog_aplikacji() / "uczenie.pt"


def _dane_uczenia():
    if "ucz" not in _stan:
        _zaladuj()
        torch = _stan["torch"]
        try:
            d = torch.load(_plik_uczenia(), map_location="cpu")
            _stan["ucz"] = {"X": d["X"].float(), "y": list(d["y"])}
        except Exception:
            _stan["ucz"] = {"X": torch.zeros((0, _stan["tekst"].shape[1])), "y": []}
    return _stan["ucz"]


def _osadz(obrazy: list):
    """Średni opis (wektor) całych widoków z rundy."""
    torch, model, proc = _stan["torch"], _stan["model"], _stan["proc"]
    with torch.no_grad():
        wej = proc(images=[_fragmenty(i)[0] for i in obrazy], return_tensors="pt").to(_stan["urz"])
        o = model.visual_projection(model.vision_model(**wej).pooler_output)
        o = (o / o.norm(dim=-1, keepdim=True)).mean(0)
        return (o / o.norm()).cpu()


def zapisz_przyklad(obrazy: list, kod: str) -> None:
    """Zapamiętuje widoki z rundy razem z poprawnym krajem — materiał do uczenia."""
    if not obrazy or not kraj(kod):
        return
    _zaladuj()
    torch, d = _stan["torch"], _dane_uczenia()
    nowy = _osadz(obrazy)
    if d["y"] and d["y"][-1] == kod and float(d["X"][-1] @ nowy) > 0.985:
        return  # ta sama runda analizowana ponownie — nie dublujemy przykładu
    d["X"] = torch.cat([d["X"], nowy[None]])
    d["y"].append(kod)
    try:
        torch.save({"X": d["X"], "y": d["y"]}, _plik_uczenia())
    except Exception:
        pass
    _stan.pop("ucz_ocena", None)


def _poprawka(zapytanie, bez: int | None = None):
    """Poprawka do oceny krajów z podobnych rund gracza (bez = pomiń ten przykład przy ocenie)."""
    torch, d = _stan["torch"], _dane_uczenia()
    kody = [k["id"] for k in kraje()]
    pod = torch.exp(-UCZENIE_BETA * (1 - d["X"] @ zapytanie))
    if bez is not None:
        pod[bez] = 0
    popr = torch.zeros(len(kody))
    for waga, kod in zip(pod.tolist(), d["y"]):
        popr[kody.index(kod)] += waga
    return UCZENIE_ALFA * popr


def ocena_uczenia() -> dict:
    """Sprawdza na rundach gracza (każdą rundę oceniając bez niej samej), czy uczenie poprawia trafność."""
    d = _dane_uczenia()
    n = len(d["y"])
    if n < UCZENIE_MIN:
        return {"rundy": n, "aktywne": False, "bez": None, "z": None}
    if _stan.get("ucz_ocena", {}).get("rundy") == n:
        return _stan["ucz_ocena"]
    torch = _stan["torch"]
    kody = [k["id"] for k in kraje()]
    tekst = _stan["tekst"].cpu()
    bez = z = 0
    for i in range(n):
        log = 100 * tekst @ d["X"][i]
        cel = kody.index(d["y"][i])
        bez += int(log.argmax()) == cel
        z += int((log + _poprawka(d["X"][i], bez=i)).argmax()) == cel
    _stan["ucz_ocena"] = {"rundy": n, "aktywne": z > bez, "bez": round(bez / n * 100), "z": round(z / n * 100)}
    return _stan["ucz_ocena"]


def opis_uczenia() -> str:
    try:
        o = ocena_uczenia()
    except Exception:
        return ""
    if o["rundy"] < UCZENIE_MIN:
        return f"uczenie: {o['rundy']}/{UCZENIE_MIN} rund"
    return f"uczenie {'włączone' if o['aktywne'] else 'wyłączone (nie pomaga)'}: {o['bez']}% → {o['z']}% na {o['rundy']} rundach"


def typuj(obrazy: list, ile: int = 5, uzyj_napisow: bool = True) -> list[dict]:
    """Zwraca najbardziej prawdopodobne kraje dla zrzutów (uśrednione)."""
    import time as _t
    t_start = _t.time()
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
    lista = kraje()
    try:  # uczenie na rundach gracza — tylko gdy sprawdzone, że pomaga
        if ocena_uczenia()["aktywne"]:
            p = p * torch.exp(_poprawka(_osadz(obrazy)))
            p = p / p.sum()
    except Exception:
        silnik.log("BŁĄD w typowaniu (pomijam ten krok)", blad=True)
    import time
    t_model = time.time()
    napisy = czytaj_napisy(obrazy[-3:], [lista[i]["id"] for i in p.topk(6).indices.tolist()]) if uzyj_napisow else []
    t_napisy = time.time()
    if napisy:
        for n in napisy:  # reguła z napisu podbija pasujące kraje (miasto najmocniej)
            for i, k in enumerate(lista):
                if k["id"] in n["kody"]:
                    p[i] = p[i] * (8 if n.get("miasto") else 3) + 0.02
        p = p / p.sum()
    _stan["ostatnie_napisy"] = napisy
    dodatki = []
    try:  # półkula ze słońca i kompasu: kraje z drugiej półkuli (poza tropikami) dostają połowę wagi
        pk = polkula(obrazy) if uzyj_napisow else None
        if pk:
            for i, k in enumerate(lista):
                sz = _szerokosc(k["id"])
                if sz is not None and ((pk["polkula"] == "N" and sz < -23.5) or (pk["polkula"] == "S" and sz > 23.5)):
                    p[i] = p[i] * 0.5
            p = p / p.sum()
            dodatki.append(pk["opis"])
    except Exception:
        silnik.log("BŁĄD w typowaniu (pomijam ten krok)", blad=True)
    try:  # samochód Google widoczny na dole zrzutu
        auto = samochod(obrazy)
        for a in auto:
            if WAGA_AUTA != 1.0:
                for i, k in enumerate(lista):
                    if k["id"] in a["kody"]:
                        p[i] = p[i] * WAGA_AUTA
                p = p / p.sum()
            dodatki.append(f"Na dole zrzutu widać: {a['widac']} ({a['pewnosc']}%). Takie auto jeździło m.in. w: {a['kraje']}.")
    except Exception:
        silnik.log("BŁĄD w typowaniu (pomijam ten krok)", blad=True)
    _stan["ostatnie_dodatki"] = dodatki
    top = p.topk(ile)
    wynik = [{"kod": lista[i]["id"], "kraj": lista[i]["pl"], "pewnosc": round(float(v) * 100)} for v, i in zip(top.values, top.indices)]
    silnik.log(f"typuj: {len(obrazy)} widoków · {_stan['urz']} · model {t_model - t_start:.1f} s, napisy {t_napisy - t_model:.1f} s, reszta {time.time() - t_napisy:.1f} s · " + ", ".join(f"{t['kod']} {t['pewnosc']}%" for t in wynik)
               + f" · napisy {[(n['napis'], n['powod'], n['kody'][:4]) for n in napisy]} · dodatki {dodatki}")
    return wynik


def ostatnie_dodatki() -> list[str]:
    """Opisy dodatkowych reguł (półkula, samochód Google) z ostatniego typowania."""
    return _stan.get("ostatnie_dodatki", [])


def _szerokosc(kod: str):
    """Szerokość geograficzna środka kraju (do reguły półkuli)."""
    pam = _stan.setdefault("szer", {})
    if kod not in pam:
        try:
            import wynik_mapa
            sr = wynik_mapa._srodek_kraju(kod)
            pam[kod] = sr[1] if sr else None
        except Exception:
            pam[kod] = None
    return pam[kod]


KIERUNKI = {"N": 0, "NE": 45, "E": 90, "SE": 135, "S": 180, "SW": 225, "W": 270, "NW": 315}


def kompas(img):
    """Kierunek patrzenia (0 = północ, 90 = wschód) odczytany z paska kompasu u góry ekranu; None, gdy się nie da."""
    if not napisy_dostepne():
        return None
    import numpy as np
    w, h = img.size
    x0, x1 = int(w * 0.42), int(w * 0.58)
    wyc = img.convert("RGB").crop((x0, int(h * 0.01), x1, int(h * 0.10)))
    wyc = wyc.resize((wyc.width * 3, wyc.height * 3))
    litery = []
    for ramka, tekst, pewn in czytnik().readtext(np.array(wyc), allowlist="NESW"):
        t = tekst.strip().upper()
        if t in KIERUNKI and pewn > 0.3:
            litery.append((sum(pt[0] for pt in ramka) / 4 / 3 + x0, t))
    if not litery:
        return None
    srodek = w / 2
    co45 = w * 0.0573   # odstęp między sąsiednimi kierunkami na pasku
    litery.sort()
    for (xa, a), (xb, b) in zip(litery, litery[1:]):
        if (KIERUNKI[b] - KIERUNKI[a]) % 360 == 45 and xb - xa > w * 0.03:
            co45 = xb - xa
            break
    x, t = min(litery, key=lambda l: abs(l[0] - srodek))
    return (KIERUNKI[t] + (srodek - x) / co45 * 45) % 360


def slonce(img):
    """Położenie tarczy słońca na zrzucie (ułamek szerokości, 0–1) albo None.

    Celowo ostrożne: szukamy małej, okrągłej, prześwietlonej plamy z równą poświatą dookoła, która słabnie z odległością.
    Białe chmury i ściany mają ostre, nierówne brzegi, więc odpadają.
    """
    try:
        import cv2
        import numpy as np
    except Exception:
        return None
    w, h = img.size
    m = img.convert("RGB").crop((0, int(h * 0.10), w, int(h * 0.62))).resize((480, 140))
    a = np.asarray(m).astype(np.float32)
    jasne = (a.min(axis=2) >= 252).astype(np.uint8)
    if jasne.mean() > 0.10:      # duża część nieba prześwietlona (chmury, mgła) — nie da się wskazać słońca
        return None
    lum = a.mean(axis=2)
    yy, xx = np.mgrid[0:140, 0:480]
    n, _, st, sr = cv2.connectedComponentsWithStats(jasne, connectivity=8)
    najl = None
    for i in range(1, n):
        x, y, bw, bh, pole = st[i]
        if not (12 <= pole <= 1200) or not (0.65 <= bw / bh <= 1.55) or pole / (bw * bh) < 0.65:
            continue
        r = max(2.5, (pole / 3.14159) ** 0.5)
        cx, cy = sr[i]
        if cy - 2.5 * r < 0 or cx - 4 * r < 0 or cx + 4 * r > 480:
            continue
        d = np.hypot(xx - cx, yy - cy)
        kat = np.arctan2(yy - cy, xx - cx)
        gora = yy <= cy + r          # poświatę oceniamy na niebie, czyli obok i nad tarczą
        p1, p2, p3 = [(d > r * lo) & (d <= r * hi) & gora for lo, hi in ((1.15, 1.8), (1.8, 2.8), (2.8, 4.0))]
        if p1.sum() < 6 or p2.sum() < 10 or p3.sum() < 10:
            continue
        l1, l2, l3 = lum[p1].mean(), lum[p2].mean(), lum[p3].mean()
        if not (l1 >= 205 and l1 > l2 + 3 and l2 > l3 + 3):
            continue
        # poświata musi być równa we wszystkich kierunkach (chmura ma jasną jedną stronę i niebieską drugą)
        sektory = [lum[p2 & (kat >= k0) & (kat < k0 + 0.7854)] for k0 in (-3.1416, -2.3562, -1.5708, -0.7854)]
        srednie = [x.mean() for x in sektory if len(x) >= 2]
        if len(srednie) < 3 or max(srednie) - min(srednie) > 22 or min(srednie) < l3 - 6:
            continue
        if najl is None or pole > najl[0]:
            najl = (pole, float(cx) / 480)
    return najl[1] if najl else None


def polkula(obrazy: list):
    """Półkula ze słońca i kompasu: słońce po stronie południowej = półkula północna (i odwrotnie)."""
    glosy = []
    for img in obrazy:
        x = slonce(img)
        if x is None:
            continue
        kier = kompas(img)
        if kier is None:
            continue
        azymut = (kier + (x - 0.5) * 100) % 360     # pole widzenia ok. 100°
        if 120 <= azymut <= 240:
            glosy.append("N")
        elif azymut >= 300 or azymut <= 60:
            glosy.append("S")
    if not glosy or len(set(glosy)) > 1:
        return None
    if glosy[0] == "N":
        return {"polkula": "N", "opis": "Słońce widać po stronie południowej → półkula północna (kraje dalekiego południa dostały mniejszą wagę)."}
    return {"polkula": "S", "opis": "Słońce widać po stronie północnej → półkula południowa (kraje dalekiej północy dostały mniejszą wagę)."}


WAGA_AUTA = 1.0       # o ile podbić kraje pasujące do samochodu Google (1.0 = tylko informacja)
PROG_AUTA = 0.75
# (opis dla modelu, co widać po polsku, wzorzec szukany we wskazówkach „Samochód Google” krajów); None = nic szczególnego
AUTA = [
    ("the hood of a black car at the bottom of a street view photo", "czarny samochód Google", r"czarn\w+ (samoch|aut)"),
    ("the hood of a white car at the bottom of a street view photo", "biały samochód Google", r"biał\w+ (samoch|aut)"),
    ("the back of a pickup truck bed at the bottom of a street view photo", "pickup", r"pickup"),
    ("black roof rack bars of a car at the bottom of a street view photo", "relingi dachowe", r"reling|bagażnik dachow"),
    ("a road surface with no vehicle visible", None, None),
    ("a round blurred patch on the road", None, None),
    ("grass, soil or a sidewalk", None, None),
]


def samochod(obrazy: list) -> list[dict]:
    """Sprawdza, czy na dole zrzutów widać samochód Google (czarny, biały, pickup, relingi), i podaje kraje z takim autem."""
    if not obrazy:
        return []
    import re
    _zaladuj()
    torch, model, proc = _stan["torch"], _stan["model"], _stan["proc"]
    with torch.no_grad():
        if "auta" not in _stan:
            wej = proc(text=[x[0] for x in AUTA], return_tensors="pt", padding=True).to(_stan["urz"])
            t = model.text_projection(model.text_model(**wej).pooler_output)
            _stan["auta"] = t / t.norm(dim=-1, keepdim=True)
        suma = 0
        for img in obrazy[-3:]:
            w, h = img.size
            dol = img.convert("RGB").crop((int(w * 0.25), int(h * 0.72), int(w * 0.75), int(h * 0.97)))
            wej = proc(images=dol, return_tensors="pt").to(_stan["urz"])
            o = model.visual_projection(model.vision_model(**wej).pooler_output)
            suma = suma + (100 * (o / o.norm(dim=-1, keepdim=True)) @ _stan["auta"].T).softmax(-1)[0]
        pr = (suma / len(obrazy[-3:])).cpu()
    i = int(pr.argmax())
    if AUTA[i][1] is None or float(pr[i]) < PROG_AUTA:
        return []
    pas = [k for k in kraje() if any(re.search(AUTA[i][2], c.lower()) for c in k.get("clues", {}).get("kamera", []))]
    return [{"widac": AUTA[i][1], "pewnosc": round(float(pr[i]) * 100), "kody": [k["id"] for k in pas], "kraje": ", ".join(k["pl"] for k in pas)}] if pas else []


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
            wej = proc(images=_fragmenty(img), return_tensors="pt").to(_stan["urz"])
            o = model.visual_projection(model.vision_model(**wej).pooler_output)
            pr = (100 * (o / o.norm(dim=-1, keepdim=True)) @ t.T).softmax(-1)
            suma = suma + (pr[0] * 2 + pr[1:].sum(0)) / 5
        p = (suma / len(obrazy)).cpu()
    top = p.topk(min(ile, len(lista)))
    wynik = [{"region": lista[i][1], "pewnosc": round(float(v) * 100), "lat": lista[i][2], "lon": lista[i][3]} for v, i in zip(top.values, top.indices)]
    # miasto odczytane z napisu rozstrzyga region: bierzemy region najbliższy temu miastu
    m = next((n["miasto"] for n in ostatnie_napisy() if n.get("miasto") and n["miasto"].get("kod") == kod), None)
    if m:
        r = min(lista, key=lambda r: (r[2] - m["lat"]) ** 2 + (r[3] - m["lon"]) ** 2)
        wynik = [{"region": f"{r[1]} (z napisu „{m['nazwa']}”)", "pewnosc": 90, "lat": m["lat"], "lon": m["lon"]}] + [x for x in wynik if x["region"] != r[1]][: ile - 1]
    return wynik


def roznice(a: dict, b: dict, ile: int = 4) -> list[str]:
    """Kategorie, w których oba kraje mają wskazówki — do odróżniania pomylonych krajów."""
    out = []
    for kat in ("slupki", "tablice", "linie", "znaki", "jezyk", "slupy"):
        ca, cb = a.get("clues", {}).get(kat), b.get("clues", {}).get(kat)
        if ca and cb:
            out.append(f"{KATEGORIE[kat]} — {a['pl']}: {ca[0]} ⟷ {b['pl']}: {cb[0]}")
    return out[:ile]


def _najblizsze_miasto(kod: str, lat: float, lon: float):
    try:
        lista = [m for m in miasta().values() if m[1] == kod]
        m = min(lista, key=lambda m: (m[2] - lat) ** 2 + ((m[3] - lon) * 0.7) ** 2) if lista else None
        return {"nazwa": m[0]} if m else None
    except Exception:
        return None


def lekcja(widoki: list, poprawny_kod: str, trafiony: bool | None, odczyt: dict | None = None, typy: list | None = None, porady: bool = False) -> dict:
    """Lekcja po rundzie: typy modelu, reguły sprawdzone na zrzutach i wskazówki GeoMeta dla poprawnego kraju.

    odczyt — wynik wynik_mapa.odczytaj (miejsce i odległość gracza z ekranu wyniku); typy — typy modelu policzone wcześniej.
    """
    k = kraj(poprawny_kod) or {"pl": poprawny_kod, "summary": "", "tips": [], "clues": {}}
    ost = widoki
    if typy is None:
        typy = typuj(ost, 3) if ost else []
    dodatki, napisy = ostatnie_dodatki(), ostatnie_napisy()
    try:
        zapisz_przyklad(ost[-3:], poprawny_kod)
    except Exception:
        pass
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
    odl = odczyt.get("odleglosc_km") if odczyt else None
    regiony = typuj_region(ost, poprawny_kod)
    miejsce, punkt = "", None
    if odczyt and odczyt.get("dokladne") and odczyt.get("lat") is not None:
        punkt = [round(odczyt["lat"], 3), round(odczyt["lon"], 3)]
        m = _najblizsze_miasto(poprawny_kod, odczyt["lat"], odczyt["lon"])
        lista = _stan.get("regiony", {}).get(poprawny_kod) or []
        if lista:  # region z mapy wyniku jest pewniejszy niż typ modelu
            r = min(lista, key=lambda r: (r[2] - odczyt["lat"]) ** 2 + (r[3] - odczyt["lon"]) ** 2)
            typ_modelu = regiony[0]["region"].split(" (")[0] if regiony else ""
            regiony = [{"region": f"{r[1]} (z mapy wyniku)", "pewnosc": 95, "lat": r[2], "lon": r[3]}]
            if typ_modelu and typ_modelu != r[1]:
                ocena += f" Region: model typował {typ_modelu}, a było to {r[1]}."
            miejsce = r[1]
        if m:
            miejsce = f"okolice: {m['nazwa']}" + (f", {miejsce}" if miejsce else "")
    if odl is not None:
        strzal = f"{odl} km od celu"
    else:
        strzal = "" if trafiony is None else ("trafiony" if trafiony else "inny kraj")
    return {
        "tryb_rankingowy": False, "poprawny_kod": poprawny_kod, "poprawny_kraj": k["pl"], "miejsce": miejsce, "punkt": punkt,
        "twoj_strzal": strzal, "trafiony_kraj": trafiony, "odleglosc_km": odl,
        "lekcja": f"{k['summary']} {ocena}" if porady else ocena, "przeoczone": k["tips"][:3],
        "zagadka": pierwsza, "model": typy, "widziane": widziane, "wskazowki": wskazowki,
        "pomylony": pomylony["pl"] if pomylony else "", "roznice": roznice(k, pomylony) if pomylony else [],
        "napisy": napisy, "dodatki": dodatki,
        "uczenie": opis_uczenia(),
        "pasujace": pasujace_reguly(ost, poprawny_kod) if porady else [],
        "regiony": regiony,
        "pasujace_regionalne": pasujace_reguly(ost, poprawny_kod, 3, regionalne=True) if porady else [],
        "pasujace_pomylony": pasujace_reguly(ost, pomylony["id"], 2) if pomylony and porady else [],
    }
