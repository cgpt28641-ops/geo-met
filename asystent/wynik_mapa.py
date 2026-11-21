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


def pinezka_czerwona(img):
    """Nowszy wygląd poprawnego miejsca: biała „łezka” z czerwoną obwódką i czerwoną kropką. Zwraca czubek (dół) łezki albo None."""
    try:
        import cv2
        import numpy as np
    except Exception:
        return None
    a = np.asarray(img.convert("RGB")).astype(np.int16)
    h, w = a.shape[:2]
    sk = h / 1080
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    czerw = ((r > 150) & (g < 75) & (b < 95) & (r > g + 90)).astype(np.uint8)
    czerw[int(h * 0.90):] = 0            # dolny pasek (flaga, krzyżyk)
    n, _, st, _ = cv2.connectedComponentsWithStats(czerw, connectivity=8)
    najl = None
    for i in range(1, n):
        x, y, bw, bh, pole = (int(v) for v in st[i])
        if not (26 * sk <= bw <= 46 * sk and 30 * sk <= bh <= 60 * sk and pole >= 250 * sk * sk):
            continue
        srodek = a[y + bh // 6:y + bh * 2 // 3, x + bw // 4:x + bw * 3 // 4]
        biale = float((srodek.min(axis=2) > 225).mean())
        if biale < 0.45:                 # w środku łezki musi być biało
            continue
        if najl is None or biale > najl[0]:
            najl = (biale, x + bw / 2, float(y + bh))
    return (najl[1], najl[2]) if najl else None


def _srodek_kraju(kod: str):
    ringi = [r for k, rs in mapa._wczytaj()["kraje"] if k == kod for r in rs]
    if not ringi:
        return None
    ring = max(ringi, key=lambda r: len(r[0]))[0]
    return sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring)


def blisko_kraju(kod: str, lon: float, lat: float, stopnie: float = 0.6) -> bool:
    """Czy punkt leży w danym kraju albo tuż przy jego granicy (kontury na mapie są uproszczone, więc punkt przy granicy bywa po złej stronie)."""
    skala = math.cos(math.radians(lat))
    for k, ringi in mapa._wczytaj()["kraje"]:
        if k != kod:
            continue
        for ring, (a, b, c, d) in ringi:
            if not (a - 1 <= lon <= c + 1 and b - 1 <= lat <= d + 1):
                continue
            wew, j = False, len(ring) - 1
            for i in range(len(ring)):
                xi, yi = ring[i]
                xj, yj = ring[j]
                if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi:
                    wew = not wew
                # odległość od odcinka granicy
                dx, dy = (xj - xi) * skala, yj - yi
                px, py = (lon - xi) * skala, lat - yi
                t = max(0.0, min(1.0, (px * dx + py * dy) / (dx * dx + dy * dy))) if dx or dy else 0.0
                if math.hypot(px - t * dx, py - t * dy) <= stopnie:
                    return True
                j = i
            if wew:
                return True
    return False


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
    """Zwykła gra: odległość z dolnego paska. Najpierw własne rozpoznawanie cyfr (wzorce czcionki, pewne i szybkie);
    gdy cyfry wyglądają inaczej niż wzorce albo ekran ma inną rozdzielczość — zwykłe czytanie tekstu."""
    try:
        if rgb.size[1] == 1080:
            import cyfry_paska
            wartosc, pewnosc, opis = cyfry_paska.odleglosc(rgb)
            silnik.log(f"dolny pasek (odległość, wzorce cyfr): {opis} · pewność {pewnosc:.2f}")
            if wartosc is not None and pewnosc >= 0.85 and wartosc <= 20100:
                return wartosc
            if wartosc is not None:
                silnik.log("cyfry wyglądają inaczej niż znane wzorce — próbuję zwykłego czytania tekstu")
    except Exception:
        silnik.log("BŁĄD rozpoznawania cyfr z paska", blad=True)
    return _odleglosc_z_paska_ocr(rgb, czyt)


def _odleglosc_z_paska_ocr(rgb, czyt):
    """Zwykła gra: odległość z dolnego paska (TIME · DISTANCE · SCORE), np. „498 km”. Zwraca kilometry albo None.

    W pasku są trzy liczby, a ich położenie zmienia się z długością napisów. Odległość poznajemy po tym, że jako jedyna
    ma za sobą mały dopisek („km” albo „m”): cyfry są wysokie, dopisek niski. Czas („3:16”) i punkty („4,502”) go nie mają.
    """
    import numpy as np
    from PIL import Image
    try:
        w, h = rgb.size
        wyc = rgb.crop((int(w * 0.30), int(h * 0.934), int(w * 0.56), int(h * 0.968)))     # sam wiersz z wartościami, bez podpisów nad nimi
        px = np.asarray(wyc).astype(np.int16)
        a = (px.min(axis=2) > 190)                      # białe znaki (żółte punkty SCORE tu nie wchodzą)
        kolumny = a.any(axis=0)
        znaki, start = [], None                          # (x0, x1, góra, dół)
        for x, jest in enumerate(list(kolumny) + [False]):
            if jest and start is None:
                start = x
            elif not jest and start is not None:
                wiersze = np.nonzero(a[:, start:x].any(axis=1))[0]
                znaki.append((start, x, int(wiersze[0]), int(wiersze[-1]) + 1))
                start = None
        znaki = [z for z in znaki if 3 <= z[3] - z[2] < 0.8 * wyc.height and z[0] > 0 and z[1] < wyc.width]     # bez jasnej krawędzi paska
        if not znaki:
            return None
        najw = max(z[3] - z[2] for z in znaki)
        gora = min(z[2] for z in znaki if z[3] - z[2] >= 0.8 * najw)

        def duzy(z):
            return z[3] - z[2] >= 0.8 * najw

        def przecinek(z):       # mały znak przy dolnej linii cyfr (przecinek lub kropka tysięcy); dwukropek czasu sięga wyżej
            return not duzy(z) and z[2] >= gora + 0.6 * najw and z[1] - z[0] <= 0.5 * najw

        # sklejamy znaki w grupy: cyfry stojące blisko siebie, ewentualnie rozdzielone przecinkiem tysięcy
        grupy, i = [], 0
        while i < len(znaki):
            if not duzy(znaki[i]):
                i += 1
                continue
            g = [znaki[i]]
            j = i + 1
            while j < len(znaki):
                z = znaki[j]
                if duzy(z) and z[0] - g[-1][1] <= 0.35 * najw:
                    g.append(z)
                elif przecinek(z) and z[0] - g[-1][1] <= 0.35 * najw and j + 1 < len(znaki) and duzy(znaki[j + 1]) and znaki[j + 1][0] - z[1] <= 0.35 * najw:
                    g.append(z)
                else:
                    break
                j += 1
            grupy.append((g, j))
            i = j
        wybrana = None
        for g, j in grupy:      # odległość = grupa cyfr, po której stoi mały dopisek, a za nim długo nic
            male = []
            while j < len(znaki) and not duzy(znaki[j]) and znaki[j][0] - (male[-1][1] if male else g[-1][1]) <= 0.9 * najw:
                male.append(znaki[j])
                j += 1
            dalej = znaki[j][0] - male[-1][1] if male and j < len(znaki) else 999
            if male and dalej > 1.2 * najw and not (len(male) == 1 and not przecinek(male[0]) and male[0][3] - male[0][2] < 0.75 * najw and male[0][2] < gora + 0.5 * najw and male[0][1] - male[0][0] < 0.35 * najw):
                wybrana = (g, male)
                break
        opis = " ".join(f"{z[0]}-{z[1]}:{z[3] - z[2]}" for z in znaki)
        if not wybrana:
            silnik.log(f"dolny pasek (odległość): nie znalazłem liczby z dopiskiem km · znaki {opis}")
            return None
        g, male = wybrana
        prawa = g[-1][1] + max(1, (male[0][0] - g[-1][1]) // 2)       # nie zahaczamy o literę „k”
        lewa = max(0, g[0][0] - 6)
        cyfry = Image.new("RGB", (prawa - lewa + 18, wyc.height), (30, 20, 70))
        cyfry.paste(wyc.crop((lewa, 0, prawa, wyc.height)), (9, 0))
        cyfry = cyfry.resize((cyfry.width * 4, cyfry.height * 4), Image.LANCZOS)
        # przecinek tysięcy („7,686”) dopuszczamy przy czytaniu i potem wyrzucamy; kawałki czytamy od lewej do prawej
        odczyt = sorted(czyt.readtext(np.asarray(cyfry), allowlist="0123456789,"), key=lambda o: o[0][0][0])
        tekst = re.sub(r"\D", "", "".join(t for _, t, _ in odczyt))
        szer_jedn = male[-1][1] - male[0][0]
        metry = szer_jedn < 1.5 * max(z[3] - z[2] for z in male)      # samo „m” jest wąskie, „km” szerokie
        silnik.log(f"dolny pasek (odległość): cyfry {tekst!r} · jednostka {'m' if metry else 'km'} · znaki {opis}")
        if not tekst:
            return None
        wynik = round(int(tekst) / 1000) if metry else int(tekst)
        if wynik > 20100:      # dalej niż pół obwodu Ziemi się nie da
            silnik.log(f"dolny pasek (odległość): odczyt {tekst!r} odrzucony jako niewiarygodny")
            return None
        return wynik
    except Exception:
        silnik.log("BŁĄD odczytu odległości z dolnego paska", blad=True)
        return None


def odczytaj(img, typy_modelu: list[str] | None = None) -> dict | None:
    """Jak _odczytaj, ale pilnuje, żeby w tym samym czasie nie działała analiza w tle."""
    with silnik_lokalny._gpu:
        return _odczytaj(img, typy_modelu)


_duze: dict = {}
_ostatnie: dict = {}
ULICE = {"r", "rua", "av", "ave", "avenida", "avenue", "calle", "c", "cl", "rue", "via", "viale", "ul", "ulica", "str", "strasse", "street", "st", "road", "rd", "blvd",
         "boulevard", "carrer", "strada", "leof", "odos", "jalan", "jl", "calea", "bulevardul", "rodovia", "carretera", "ruta", "highway", "hwy"}


def _duze_miasto(odczyty, typy_modelu: list[str]):
    """Mapa przybliżona do poziomu ulic nie ma nazw miast, ale nazwa dużego miasta zwykle siedzi w innych napisach
    („Museu de Arte de São Paulo”, „Athens Customs Office”). Szukamy takich nazw w środku napisów.
    Zwraca (kraj, szerokość, długość, nazwa, ile razy) albo None."""
    baza_miast()
    if not _surowa:
        return None
    if not _duze:      # nazwy ok. 5 tys. największych miast świata (baza jest ułożona od największych)
        for klucz, ids in _surowa["k"].items():
            if len(klucz) >= 5 and ids[0] < 5000 and klucz not in silnik_lokalny.NIE_MIASTA:
                _duze[klucz] = ids[0]
    licznik: dict = {}
    for pole, tekst, pw in odczyty:
        if pw < 0.4:
            continue
        slowa = [x for x in re.split(r"[^\w]+", silnik_lokalny._uprosc(tekst)) if x]
        if not slowa or slowa[0] in ULICE:          # nazwy ulic często noszą nazwy miast („Rua Lisboa”) — pomijamy
            continue
        trafione = set()
        for n in (3, 2, 1):
            for i in range(len(slowa) - n + 1):
                fraza = " ".join(slowa[i:i + n])
                if fraza in _duze:
                    trafione.add(_duze[fraza])
        for idx in trafione:
            licznik[idx] = licznik.get(idx, 0) + 1
    if not licznik:
        return None
    kolejnosc = sorted(licznik.items(), key=lambda kv: (-kv[1], kv[0]))
    idx, ile = kolejnosc[0]
    drugi = kolejnosc[1][1] if len(kolejnosc) > 1 else 0
    kod, lat, lon = _surowa["m"][idx]
    if silnik_lokalny.kraj(kod) is None:
        return None
    if ile >= 2 or kod in typy_modelu[:3]:
        nazwa = next((k for k, ids in _surowa["k"].items() if ids and ids[0] == idx), "").title()
        # miejsce podajemy tylko wtedy, gdy jedno miasto wyraźnie wygrywa (dzielnice bywają imiennikami innych miast, np. Belém w São Paulo)
        return kod, lat, lon, nazwa, ile, ile >= drugi + 2 or (ile >= 2 and drugi == 0) or (ile == 1 and drugi == 0)
    return None


def _odczytaj(img, typy_modelu: list[str] | None = None) -> dict | None:
    """Kolejno: flaga kraju z dolnego paska (nowszy układ — gra sama podaje kraj), dokładne dopasowanie mapy po nazwach
    miejscowości, a gdy strzał był blisko i mapa pokazuje ulice — nazwa dużego miasta w napisach."""
    typy_modelu = typy_modelu or []
    wynik = _odczytaj_z_ulozenia(img, typy_modelu)
    fl = None
    try:
        if silnik.pasek_wyniku(img):
            import flaga_paska
            fl = flaga_paska.flaga(img.convert("RGB"))
            if fl:
                silnik.log(f"flaga w pasku wyniku: {fl}")
    except Exception:
        silnik.log("BŁĄD odczytu flagi z paska", blad=True)
    odl = wynik.get("odleglosc_km") if wynik else None
    if not (wynik is not None and wynik.get("pewny") and (not fl or wynik.get("kod") in fl["kandydaci"])):
        # mapy nie udało się pewnie dopasować (albo wyszedł inny kraj niż na fladze) — przy bliskim strzale szukamy nazwy dużego miasta
        if _ostatnie.get("odczyty") is not None and (fl is not None or odl is None or odl <= 100):
            try:
                import numpy as np
                # do tego czytamy cały ekran (nie tylko okolicę pinezki), bo nazwa miasta może być w dowolnym napisie
                with_all = silnik_lokalny.czytnik().readtext(np.asarray(img.convert("RGB")))
                m = _duze_miasto(with_all, fl["kandydaci"] if fl else typy_modelu)
            except Exception:
                silnik.log("BŁĄD szukania nazwy miasta w napisach mapy", blad=True)
                m = None
            if m and (not fl or m[0] in fl["kandydaci"]) and (fl is not None or odl is not None):
                kod, lat, lon, nazwa, ile, pewne_miejsce = m
                silnik.log(f"mapa przybliżona do ulic: w napisach {ile}× nazwa miasta {nazwa} ({kod}), miejsce pewne: {pewne_miejsce}")
                if pewne_miejsce:
                    wynik = {"kod": kod, "pewny": True, "lat": lat, "lon": lon, "dokladne": True, "odleglosc_km": odl, "miasta": 0,
                             "powod": f"mapa pokazuje ulice; w napisach {ile}× nazwa miasta {nazwa}"}
                else:
                    wynik = {"kod": kod, "pewny": True, "dokladne": False, "odleglosc_km": odl, "miasta": 0, "powod": "mapa pokazuje ulice; kraj z nazw w napisach"}
    if fl:
        # Flaga to odpowiedź samej gry, więc kraj bierzemy z niej. Przy bardzo podobnych flagach (Włochy/Irlandia)
        # rozstrzyga dopasowanie mapy, potem typ modelu.
        z_mapy = wynik.get("kod") if wynik else None
        if z_mapy not in fl["kandydaci"] and wynik and wynik.get("lat") is not None and wynik.get("miasta", 0) >= 4:
            # mapa dała punkt w sąsiednim kraju, ale tuż przy granicy kraju z flagi — to ten sam punkt, kraj bierzemy z flagi
            przy = [k for k in fl["kandydaci"] if blisko_kraju(k, wynik["lon"], wynik["lat"])]
            if przy:
                wynik["kod"] = z_mapy = przy[0]
                wynik["dokladne"] = True
                wynik["powod"] = f"punkt przy granicy, {wynik['miasta']} miast na mapie"
        if z_mapy in fl["kandydaci"]:
            kod = z_mapy
        else:
            kod = next((k for k in typy_modelu[:3] if k in fl["kandydaci"]), fl["kod"])
        if wynik is None or z_mapy != kod:       # miejsce z mapy nie zgadza się z flagą — zostawiamy sam kraj
            wynik = {"kod": kod, "dokladne": False, "odleglosc_km": odl, "miasta": 0}
        wynik["pewny"] = len(fl["kandydaci"]) == 1 or z_mapy == kod or kod in typy_modelu[:3]
        wynik["powod"] = "flaga kraju w pasku wyniku" + (f"; {wynik['powod']}" if wynik.get("powod") and wynik.get("lat") is not None else "")
        wynik["trafiony"] = fl["trafiony"]
    return wynik


def _odczytaj_z_ulozenia(img, typy_modelu: list[str] | None = None) -> dict | None:
    """Zwraca {kod, pewny, lat, lon, miasta, odleglosc_km, powod} albo None, gdy nie da się nic ustalić."""
    import numpy as np
    typy_modelu = typy_modelu or []
    miasta = baza_miast()
    nazwy_krajow = {silnik_lokalny._uprosc(k[j]): k["id"] for k in silnik_lokalny.kraje() for j in ("en", "pl") if k.get(j)}     # mapa bywa po polsku albo po angielsku
    w, h = img.size
    # układ pojedynku: fioletowy pasek u góry (czasem nierozpoznany przez kolorowe paski życia — wtedy poznajemy go po samych paskach)
    pojedynek = silnik.rodzaj_ekranu(img) == "wynik" or silnik.czy_pojedynek(img)
    gora = 0.22 if pojedynek else 0.06
    pin = pinezka(img)
    if pin and not (h * gora < pin[1] < h * 0.97 and w * 0.02 < pin[0] < w * 0.98):
        pin = None
    if not pin and not pojedynek:
        pin = pinezka_czerwona(img)      # nowszy układ zwykłej gry: czerwona „łezka” zamiast czarnego kółka z flagą
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
    _ostatnie["odczyty"] = odczyty
    silnik.log(f"mapa wyniku: zrzut {w}x{h} · pinezka {pin} · czytany obszar {x0},{y0}–{x1},{y1} · odczytane napisy ({len(odczyty)}): "
               + " | ".join(f"{t} [{int(pole[0][0])},{int(pole[0][1])}]" for pole, t, pw in odczyty[:60]))

    # odległość gracza: pierwszy od lewej napis „… km” w górnej części ekranu (pojedynek) albo w dolnym panelu (zwykła gra)
    km = []
    for pole, tekst, pw in odczyty:
        m = re.search(r"(\d[\d  .,]*)\s*km\b", tekst.lower())
        if not m or not re.sub(r"\D", "", m.group(1)):
            continue
        wartosc = int(re.sub(r"\D", "", m.group(1)))
        if pole[0][1] < h * 0.35:
            km.append((pole[0][0], wartosc))
    if pojedynek:
        # Pojedynek: odległość gracza jest w lewym (zielonym) polu pod wynikiem rundy; prawe pole to przeciwnik — jego nie bierzemy.
        odleglosc = None
        try:
            from PIL import Image
            wyc = rgb.crop((int(w * 0.428), int(h * 0.196), int(w * 0.497), int(h * 0.246)))
            wyc = wyc.resize((wyc.width * 3, wyc.height * 3), Image.LANCZOS)
            tekst = " ".join(t for _, t, _ in sorted(czyt.readtext(np.asarray(wyc), allowlist="0123456789,. km"), key=lambda o: o[0][0][0]))
            m = re.search(r"(\d[\d ,.]*?)\s*(km|k|m)\b", tekst.lower())
            silnik.log(f"pole odległości gracza (pojedynek): {tekst!r}")
            if m and re.sub(r"\D", "", m.group(1)):
                liczba = int(re.sub(r"\D", "", m.group(1)))
                odleglosc = round(liczba / 1000) if m.group(2) == "m" else liczba
        except Exception:
            silnik.log("BŁĄD odczytu odległości (pojedynek)", blad=True)
        if odleglosc is None:
            lewe = [k for k in km if k[0] < w * 0.5 - 20]
            odleglosc = min(lewe)[1] if lewe else None
        if odleglosc is not None and odleglosc > 20100:
            odleglosc = None
    else:
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
    prog = np.where(miasto, 24.0, 160.0) * (h / 1080)
    waga = np.where(miasto, 1.0, 0.3)
    import random

    def szukaj(X, Y, ile_par):
        """Najlepsze ułożenie mapy (skala i przesunięcie): próbujemy pary napisów i liczymy, ile pozostałych do nich pasuje."""
        pary = [(i, j) for i in range(len(kotwice)) for j in range(i + 1, len(kotwice)) if napis[i] != napis[j]]
        if len(pary) > ile_par:
            pary = random.Random(1).sample(pary, ile_par)
        najl = None
        for i, j in pary:
            dx, dl = X[j] - X[i], L[j] - L[i]
            dy, dm = Y[j] - Y[i], M[j] - M[i]
            if abs(dx) >= abs(dy):
                if abs(dl) < 1e-6 or abs(dx) < 40:
                    continue
                sk = dx / dl
            else:
                if abs(dm) < 1e-6 or abs(dy) < 40:
                    continue
                sk = -dy / dm
            if not (150 < sk < 5e6):
                continue
            tx, ty = X[i] - sk * L[i], Y[i] + sk * M[i]
            ok = np.nonzero(np.hypot(sk * L + tx - X, -sk * M + ty - Y) <= prog)[0]
            jedne = {napis[k]: k for k in ok}.values()         # jeden napis liczy się raz
            ocena = sum(waga[k] for k in jedne)
            if najl is None or ocena > najl[0]:
                najl = (ocena, sk, tx, ty, sum(1 for k in jedne if miasto[k]))
        return najl

    najl = szukaj(X, Y, 5000)
    if najl is None:
        return {"kod": None, "pewny": False, "odleglosc_km": odleglosc, "miasta": 0, "powod": "nie udało się dopasować mapy"}
    # Próba kontrolna: te same nazwy z pomieszanymi położeniami na ekranie. Pokazuje, ile napisów „zgadza się” przez czysty przypadek
    # (baza ma ponad 200 tys. miejscowości, więc kilka zawsze się znajdzie) — prawdziwy wynik musi być wyraźnie lepszy.
    kolejnosc = sorted(set(napis.tolist()))
    pomieszane = kolejnosc[:]
    random.Random(7).shuffle(pomieszane)
    gdzie = {a: b for a, b in zip(kolejnosc, pomieszane)}
    pierwszy = {n: int(np.nonzero(napis == n)[0][0]) for n in kolejnosc}
    Xp = np.array([X[pierwszy[gdzie[n]]] for n in napis.tolist()])
    Yp = np.array([Y[pierwszy[gdzie[n]]] for n in napis.tolist()])
    kontrola = szukaj(Xp, Yp, 2500)
    szum = kontrola[4] if kontrola else 0

    def zgodne(sk, tx, ty):
        """Dla każdego napisu najwyżej jedno miejsce: to, które najlepiej pasuje do ułożenia mapy."""
        blad = np.hypot(sk * L + tx - X, -sk * M + ty - Y)
        naj = {}
        for i in np.nonzero(blad <= prog)[0]:
            if napis[i] not in naj or blad[i] < blad[naj[napis[i]]]:
                naj[napis[i]] = i
        return list(naj.values())

    wybrane = zgodne(*najl[1:4])
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
    silnik.log(f"dopasowanie mapy: zgodnych miast {ile_miast}, w próbie kontrolnej {szum}, punkt {lat:.2f}, {lon:.2f}")
    if not (-85 <= lat <= 85 and -180 <= lon <= 180):
        return {"kod": None, "pewny": False, "odleglosc_km": odleglosc, "miasta": ile_miast, "powod": "nie udało się dopasować mapy"}
    kod, odl = kraj_w_punkcie(lon, lat)
    znany = bool(kod) and silnik_lokalny.kraj(kod) is not None
    if not znany:
        return {"kod": None, "pewny": False, "lat": lat, "lon": lon, "odleglosc_km": odleglosc, "miasta": ile_miast, "powod": "miejsce poza krajami z bazy"}
    pewne_miasta = ile_miast >= max(4, szum + 3)        # wyraźnie więcej zgodnych miast, niż wychodzi z przypadku
    if odl == 0 and pewne_miasta:
        pewny, powod = True, f"pinezka w granicach kraju, {ile_miast} miast na mapie"
    elif kod in typy_modelu[:3] and odl < 8 and (ile_miast > szum or ile_miast <= 1):
        pewny, powod = True, "zgodne z typem modelu"
    else:
        pewny, powod = False, "wynik przybliżony — potwierdź"
    return {"kod": kod, "pewny": pewny, "lat": lat, "lon": lon, "dokladne": pewne_miasta, "odleglosc_km": odleglosc, "miasta": ile_miast, "powod": powod}
