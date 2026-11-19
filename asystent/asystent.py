"""GeoMeta Asystent — małe okienko obok GeoGuessra.

Skróty (domyślnie):
  F8  — analiza bieżącego widoku (tylko gdy podpowiedzi są włączone; drugie naciśnięcie pokazuje kraje)
  F9  — włącz / wyłącz podpowiedzi
  F10 — koniec rundy: nauka na podstawie poprawnego miejsca (zawsze działa)
"""
from __future__ import annotations

import queue
import re
import threading
import time
import tkinter as tk
import traceback
import webbrowser
from collections import deque
from tkinter import messagebox, ttk

import mapa
import silnik
import silnik_lokalny
import wynik_mapa
import synchronizacja

KOLOR_TLA = "#0f172a"
KOLOR_TEKSTU = "#e8edf7"
KOLOR_AKCENT = "#22c47f"
# skróty do wyboru w ustawieniach: nazwa → wartość zapisywana w ustawieniach
SKROTY = {**{f"F{i}": f"f{i}" for i in range(1, 13)},
          "Mysz: boczny 1 (wstecz)": "mysz:x", "Mysz: boczny 2 (dalej)": "mysz:x2", "Mysz: środkowy (kółko)": "mysz:middle",
          "Insert": "insert", "Home": "home", "End": "end", "Page Up": "page up", "Page Down": "page down", "Pause": "pause", "Brak": ""}
KOLOR_SZARY = "#95a0b8"


class Asystent:
    def __init__(self) -> None:
        self.cfg = silnik.wczytaj_ustawienia()
        try:
            import platform
            import sys
            jawne = {k: v for k, v in self.cfg.items() if k not in ("api_key", "sync_token", "sync_url")}
            silnik.log(f"════ START · Python {sys.version.split()[0]} · {platform.platform()} · folder danych: {silnik.katalog_aplikacji()}")
            silnik.log(f"ustawienia: {jawne}")
        except Exception:
            pass
        self.silnik = silnik.Silnik(self.cfg)
        self.widoki: deque = deque(maxlen=30)      # różniące się widoki z rundy: (obraz, odcisk)
        self.kolejka: queue.Queue = queue.Queue()  # wyniki z wątków roboczych → okno
        self.ostatnia_analiza: dict | None = None
        self.odkryte = False
        self.zajety = False
        self.ostatni_ekran = "runda"
        self.zrzuty_wyniku: list = []  # zrzuty ekranu wyniku złapane przez pętlę (ostatni element None = komplet)
        self.runda_zamknieta = False   # po wyniku/lekcji: kolejny widok z ulicy zaczyna nową rundę
        self.okno_rundy = None

        self.root = tk.Tk()
        self.root.title("GeoMeta Asystent")
        self.root.attributes("-topmost", True)
        try:
            self.root.attributes("-alpha", 0.93)
        except tk.TclError:
            pass
        self.root.configure(bg=KOLOR_TLA)
        self.wys_pelna = 600
        self.pamiec = ""
        self.pelny_widok = True
        self.root.geometry("400x600-20+60")
        self.root.minsize(300, 200)
        self._buduj_okno()
        try:  # zapamiętane położenie i rozmiar okienka
            if self.cfg.get("okno"):
                self.root.geometry(self.cfg["okno"])
                self.wys_pelna = int(re.match(r"\d+x(\d+)", self.cfg["okno"]).group(1))
        except Exception:
            pass
        self.root.protocol("WM_DELETE_WINDOW", self._zamknij)
        self.niewidoczne = False      # czy system pomija okienko asystenta przy zrzutach ekranu
        self.prostokaty: list = []    # położenie okienek asystenta (do zamalowania, gdy powyższe nie działa)
        self.root.after(400, lambda: self._ukryj_przed_zrzutem(self.root, True))
        self.root.after(500, self._sledz_okno)
        self._podepnij_skroty()
        self.root.after(200, self._obsluz_kolejke)
        threading.Thread(target=self._petla_pamieci, daemon=True).start()
        threading.Thread(target=self._petla_w_tle, daemon=True).start()
        if self.cfg.get("auto_zrzuty"):
            threading.Thread(target=self._petla_zrzutow, daemon=True).start()
        if self.cfg.get("tryb") == "lokalny":
            ok, powod = silnik_lokalny.dostepny()
            if not ok:
                self.cfg["tryb"] = "claude"
                self.root.after(600, lambda: self.pisz([("Tryb darmowy niedostępny. ", "b"), (powod + "\nPrzełączono na tryb Claude (płatny).", "")]))
            else:   # model wczytujemy od razu w tle, żeby pierwsza analiza nie czekała kilkunastu sekund
                threading.Thread(target=silnik_lokalny.przygotuj, daemon=True).start()
        if self.cfg.get("tryb") == "claude" and not (self.cfg.get("api_key") or "").strip():
            self.root.after(400, self.ustawienia)

    @property
    def lokalny(self) -> bool:
        return self.cfg.get("tryb") == "lokalny"

    # ───────────── okno ─────────────
    def _buduj_okno(self) -> None:
        gora = tk.Frame(self.root, bg=KOLOR_TLA)
        gora.pack(fill="x", padx=10, pady=(8, 4))
        tk.Label(gora, text="🌍 GeoMeta", fg=KOLOR_AKCENT, bg=KOLOR_TLA, font=("Segoe UI", 12, "bold")).pack(side="left")
        self.lbl_tryb = tk.Label(gora, fg=KOLOR_SZARY, bg=KOLOR_TLA, font=("Segoe UI", 9))
        self.lbl_tryb.pack(side="left", padx=8)
        tk.Button(gora, text="⚙", command=self.ustawienia, bg=KOLOR_TLA, fg=KOLOR_TEKSTU, bd=0, font=("Segoe UI", 11)).pack(side="right")
        tk.Button(gora, text="📄", command=self._otworz_log, bg=KOLOR_TLA, fg=KOLOR_TEKSTU, bd=0, font=("Segoe UI", 11)).pack(side="right")
        tk.Button(gora, text="📊", command=self.raport, bg=KOLOR_TLA, fg=KOLOR_TEKSTU, bd=0, font=("Segoe UI", 11)).pack(side="right")
        tk.Button(gora, text="↕", command=lambda: self.ustaw_widok(not self.pelny_widok), bg=KOLOR_TLA, fg=KOLOR_TEKSTU, bd=0, font=("Segoe UI", 11)).pack(side="right")

        self.txt = tk.Text(self.root, bg="#18223a", fg=KOLOR_TEKSTU, wrap="word", bd=0, padx=10, pady=8,
                           font=("Segoe UI", 10), height=10, insertbackground=KOLOR_TEKSTU)
        self.txt.pack(fill="both", expand=True, padx=10)
        self.txt.tag_configure("b", font=("Segoe UI", 10, "bold"))
        self.txt.tag_configure("akc", foreground=KOLOR_AKCENT, font=("Segoe UI", 11, "bold"))
        self.txt.tag_configure("szary", foreground=KOLOR_SZARY)

        self.belka = tk.Label(self.root, text="", anchor="w", justify="left", bg=KOLOR_TLA, fg=KOLOR_AKCENT, font=("Segoe UI", 10, "bold"), wraplength=370)
        self.belka.pack(fill="x", padx=10, pady=(4, 0))
        self.plotno = tk.Canvas(self.root, height=190, bg=mapa.TLO, highlightthickness=0)
        self.plotno.pack(fill="x", padx=10, pady=(6, 0))
        self.ostatnia_mapa = None
        self.plotno.bind("<Configure>", lambda e: self.rysuj_mape(*self.ostatnia_mapa) if self.ostatnia_mapa else None)

        dol = tk.Frame(self.root, bg=KOLOR_TLA)
        dol.pack(fill="x", padx=10, pady=8)
        self.btn_analiza = tk.Button(dol, text="🔍 Analiza", command=self.analiza)
        self.btn_analiza.pack(side="left")
        tk.Button(dol, text="🏁 Koniec rundy", command=self.koniec_rundy).pack(side="left", padx=6)
        self.lbl_koszt = tk.Label(dol, fg=KOLOR_SZARY, bg=KOLOR_TLA, font=("Segoe UI", 8))
        self.lbl_koszt.pack(side="right")
        self.lbl_koszt.bind("<Button-1>", lambda _: self._otworz_pamiec())   # klik otwiera plik z zapisem pamięci karty
        self._odswiez_status()
        self.pisz([("Gotowy. ", "akc"), (f"{self.nazwa_skrotu('skrot_koniec_rundy')} po każdej rundzie = nauka na poprawnym miejscu.\n", ""),
                   (f"{self.nazwa_skrotu('skrot_podpowiedzi')} włącza podpowiedzi (tylko gra pojedyncza / trening).", "szary")])

    def ustaw_widok(self, pelny: bool) -> None:
        """Pełny widok (z tekstem lekcji) albo kompaktowy (sama belka z typami i mapa)."""
        try:
            if pelny == self.pelny_widok:
                return
            szer = self.root.winfo_width()
            if pelny:
                self.txt.pack(fill="both", expand=True, padx=10, before=self.belka)
                self.root.geometry(f"{szer}x{self.wys_pelna}")
            else:
                self.wys_pelna = max(360, self.root.winfo_height())
                self.txt.pack_forget()
                self.root.geometry(f"{szer}x330")
            self.pelny_widok = pelny
        except Exception:
            pass

    def _zamknij(self) -> None:
        try:
            g = self.root.geometry()            # np. 400x600+1500+60
            if not self.pelny_widok:
                m = re.match(r"(\d+)x(\d+)(.*)", g)
                g = f"{m.group(1)}x{self.wys_pelna}{m.group(3)}"
            self.cfg["okno"] = g
            silnik.zapisz_ustawienia(self.cfg)
        except Exception:
            pass
        self.root.destroy()

    def rysuj_mape(self, kody: list, punkty: list) -> None:
        """Zaznacza na mapie typowane kraje (zielone, od najmocniejszego), region (pomarańczowy) i miasta (czerwone)."""
        self.ostatnia_mapa = (kody, punkty)
        try:
            szer, wys = max(200, self.plotno.winfo_width()), max(120, self.plotno.winfo_height())
            p = mapa.plan(kody, punkty, szer, wys)
            self.plotno.delete("all")
            for wsp, kolor in p["wielokaty"]:
                if len(wsp) >= 6:
                    self.plotno.create_polygon(wsp, fill=kolor, outline=mapa.KRAWEDZ, width=1)
            for x, y, napis, kolor, dy, tlo in sorted(p["znaczniki"], key=lambda z: not z[5]):   # miasta w tle rysowane pod spodem
                if tlo:     # miasta do orientacji: mała szara kropka i cienki podpis
                    self.plotno.create_oval(x - 2, y - 2, x + 2, y + 2, fill=kolor, outline="")
                    if napis:
                        self.plotno.create_text(x + 5, y, text=napis, anchor="w", fill=kolor, font=("Segoe UI", 7))
                    continue
                self.plotno.create_oval(x - 5, y - 5, x + 5, y + 5, fill=kolor, outline="white", width=2)
                if napis:
                    self.plotno.create_text(x + 8, y + dy, text=napis, anchor="w", fill="white", font=("Segoe UI", 8, "bold"))
        except Exception as e:
            self.plotno.delete("all")
            self.plotno.create_text(10, 10, text=f"Mapa niedostępna: {e}", anchor="nw", fill="white")

    @staticmethod
    def _punkty_mapy(regiony: list, napisy: list) -> list:
        pkt = [{"lat": r["lat"], "lon": r["lon"], "napis": f"{r['region'].replace('województwo ', 'woj. ')} {r['pewnosc']}%", "kolor": "#f2a516"} for r in regiony[:1]]
        pkt += [{"lat": n["miasto"]["lat"], "lon": n["miasto"]["lon"], "napis": n["miasto"]["nazwa"], "kolor": "#e5484d", "dokladny": True} for n in napisy if n.get("miasto")]
        if any(p.get("dokladny") for p in pkt):    # miasto z napisu: przybliżamy na nie i zostawiamy tylko region, który jest blisko
            m = next(p for p in pkt if p.get("dokladny"))
            pkt = [p for p in pkt if p.get("dokladny") or (abs(p["lat"] - m["lat"]) < 1.5 and abs(p["lon"] - m["lon"]) < 2)]
            pkt = [p for p in pkt if not p.get("dokladny") or (abs(p["lat"] - m["lat"]) < 3 and abs(p["lon"] - m["lon"]) < 4)]
            try:
                pkt += [t for t in wynik_mapa.miasta_w_okolicy(m["lat"], m["lon"]) if abs(t["lat"] - m["lat"]) + abs(t["lon"] - m["lon"]) > 0.2]
            except Exception:
                pass
        return pkt

    def _odswiez_status(self) -> None:
        on = self.cfg.get("podpowiedzi")
        self.lbl_tryb.config(text=("💡 podpowiedzi WŁ." if on else "🎓 tylko nauka"), fg=(KOLOR_AKCENT if on else KOLOR_SZARY))
        self.btn_analiza.config(state=("normal" if on else "disabled"))
        k = self.silnik.koszt
        self.lbl_koszt.config(text=("tryb darmowy · 0 zł" + (" · " + self.pamiec if self.pamiec else "")) if self.lokalny else f"{k.wywolania} analiz · ~{k.pln:.2f} zł")

    def _ukryj_przed_zrzutem(self, okno, glowne: bool = False) -> None:
        """Prosi Windows, żeby pomijał to okienko przy zrzutach ekranu — inaczej asystent czytałby własne napisy."""
        ok = False
        try:
            import ctypes
            okno.update_idletasks()
            uchwyt = ctypes.windll.user32.GetParent(okno.winfo_id()) or okno.winfo_id()
            ok = bool(ctypes.windll.user32.SetWindowDisplayAffinity(uchwyt, 0x11))
        except Exception:
            ok = False
        if glowne:
            self.niewidoczne = ok
            silnik.log(f"okienko pomijane przy zrzutach: {ok}" + ("" if ok else " — będzie zamalowywane na zrzucie"))

    def _sledz_okno(self) -> None:
        """Zapamiętuje położenie okienek asystenta (główne i pytanie o kraj), żeby móc je zamalować na zrzucie."""
        try:
            okna = [self.root] + ([self.okno_rundy] if self.okno_rundy is not None and self.okno_rundy.winfo_exists() else [])
            self.prostokaty = [(o.winfo_rootx() - 10, o.winfo_rooty() - 40, o.winfo_rootx() + o.winfo_width() + 10, o.winfo_rooty() + o.winfo_height() + 10) for o in okna]
        except Exception:
            pass
        self.root.after(500, self._sledz_okno)

    def _zrzut(self):
        return silnik.zrob_zrzut(self.cfg.get("monitor", 1), None if self.niewidoczne else self.prostokaty)

    def _pojedynek(self, img) -> bool:
        # gdy okienko jest zamalowywane, może zasłaniać jeden z pasków życia — wtedy wystarcza drugi
        return silnik.czy_pojedynek(img, jeden_pasek=not self.niewidoczne)

    def _otworz_log(self) -> None:
        try:
            import os
            silnik.log("otwarto log z okienka")
            os.startfile(silnik.katalog_aplikacji() / "log.txt")
        except Exception:
            pass

    def _otworz_pamiec(self) -> None:
        try:
            import os
            os.startfile(silnik.katalog_aplikacji() / "pamiec_karty.txt")
        except Exception:
            pass

    def _petla_pamieci(self) -> None:
        """Co 5 sekund sprawdza pamięć karty graficznej: pokazuje ją na dole okienka i dopisuje do pliku pamiec_karty.txt."""
        plik = silnik.katalog_aplikacji() / "pamiec_karty.txt"
        try:
            plik.write_text("godzina;karta_zajete_MB;karta_cala_MB;asystent_MB;ekran;asystent_liczy\n", encoding="utf-8")
        except Exception:
            pass
        while True:
            try:
                m = silnik_lokalny.pamiec_karty_mb() if self.lokalny else None
                nowa = (f"karta: {m[0] / 1024:.1f} z {m[1] / 1024:.1f} GB" + (f" (asystent {m[2] / 1024:.1f} GB)" if m[2] else "")) if m else ""
                if nowa != self.pamiec:
                    self.pamiec = nowa
                    self.kolejka.put(("akcja", self._odswiez_status))
                if m:
                    with open(plik, "a", encoding="utf-8") as f:
                        f.write(f"{time.strftime('%H:%M:%S')};{m[0]};{m[1]};{m[2]};{self.ostatni_ekran or '-'};{'tak' if self.zajety else 'nie'}\n")
            except Exception:
                pass
            time.sleep(5)

    def pisz(self, czesci: list[tuple[str, str]]) -> None:
        self.txt.config(state="normal")
        self.txt.delete("1.0", "end")
        for tekst, tag in czesci:
            self.txt.insert("end", tekst, tag or ())
        self.txt.config(state="disabled")

    # ───────────── skróty globalne ─────────────
    def _podepnij_skroty(self) -> None:
        """Globalne skróty (klawisze i przyciski myszy) działające także, gdy aktywna jest gra."""
        akcje = {"skrot_analiza": self.analiza, "skrot_podpowiedzi": self.przelacz_podpowiedzi, "skrot_koniec_rundy": self.koniec_rundy}
        bledy = []
        try:
            import keyboard
        except Exception as e:
            keyboard = None
            bledy.append(f"klawiatura: {e}")
        try:
            import mouse
        except Exception as e:
            mouse = None
            bledy.append(f"mysz: {e}")
        # zdejmujemy tylko skróty, które sami wcześniej podpięliśmy (po zmianie w ustawieniach)
        for rodzaj, uchwyt in getattr(self, "_podpiete", []):
            try:
                (keyboard.remove_hotkey if rodzaj == "k" else mouse.unhook)(uchwyt)
            except Exception:
                pass
        self._podpiete = []
        for nazwa, fn in akcje.items():
            skrot = str(self.cfg.get(nazwa, "")).strip().lower()
            wywolaj = (lambda f=fn, n=nazwa: (silnik.log(f"naciśnięto skrót {n}"), self.kolejka.put(("akcja", f))))
            try:
                if skrot.startswith("mysz:"):
                    if mouse:
                        self._podpiete.append(("m", mouse.on_button(wywolaj, buttons=(skrot[5:],), types=("down",))))
                elif skrot and keyboard:
                    self._podpiete.append(("k", keyboard.add_hotkey(skrot, wywolaj)))
            except Exception as e:
                bledy.append(f"{skrot}: {e}")
        silnik.log(f"skróty: podpięte {len(self._podpiete)} z {len(akcje)} · " + ", ".join(f"{n}={self.cfg.get(n)!r}" for n in akcje) + (f" · błędy: {bledy}" if bledy else ""))
        if bledy:  # brak uprawnień lub biblioteki — zostają przyciski w okienku
            self.root.after(500, lambda: self.pisz([("Część skrótów niedostępna: ", "b"), ("; ".join(bledy), ""), ("\nUżywaj przycisków w okienku.", "szary")]))

    def nazwa_skrotu(self, nazwa: str) -> str:
        return self._opis_skrotu(str(self.cfg.get(nazwa, "")).lower())

    @staticmethod
    def _opis_skrotu(wartosc: str) -> str:
        """Nazwa skrótu pokazywana w ustawieniach (np. „F8”, „Mysz: boczny 1”, „Klawisz: f13”)."""
        return next((n for n, v in SKROTY.items() if v == wartosc), f"Klawisz: {wartosc}")

    @staticmethod
    def _wartosc_skrotu(opis: str) -> str:
        if opis in SKROTY:
            return SKROTY[opis]
        return opis[9:].strip().lower() if opis.startswith("Klawisz: ") else ""

    def _nagraj_skrot(self, zm, przycisk) -> None:
        """Czeka na naciśnięcie klawisza albo przycisku myszy i wpisuje go jako skrót."""
        stan = {"koniec": False, "k": None, "m": None}
        try:
            import keyboard
        except Exception:
            keyboard = None
        try:
            import mouse
        except Exception:
            mouse = None
        if not keyboard and not mouse:
            messagebox.showwarning("GeoMeta", "Nagrywanie skrótów nie jest dostępne na tym komputerze.")
            return
        przycisk.config(text="Naciśnij klawisz lub przycisk myszy…", state="disabled")

        def zakoncz(wartosc):
            if stan["koniec"]:
                return
            stan["koniec"] = True

            def w_oknie():   # wykonywane w głównym wątku okienka
                for lib, uchwyt in ((keyboard, stan["k"]), (mouse, stan["m"])):
                    try:
                        if lib and uchwyt:
                            lib.unhook(uchwyt)
                    except Exception:
                        pass
                try:
                    if wartosc:
                        zm.set(self._opis_skrotu(wartosc))
                    przycisk.config(text="⏺ Nagraj", state="normal")
                except tk.TclError:
                    pass          # okno ustawień zostało już zamknięte
            self.kolejka.put(("akcja", w_oknie))

        def klawisz(zd):
            if zd.event_type == "down" and zd.name and zd.name != "unknown":
                zakoncz(zd.name.lower())

        def mysz(zd):
            # lewy i prawy przycisk zostają dla gry; przypisać można środkowy i boczne
            if getattr(zd, "event_type", "") == "down" and getattr(zd, "button", "") in ("x", "x2", "middle"):
                zakoncz("mysz:" + zd.button)
        try:
            if keyboard:
                stan["k"] = keyboard.hook(klawisz)
            if mouse:
                stan["m"] = mouse.hook(mysz)
        except Exception as e:
            zakoncz("")
            messagebox.showwarning("GeoMeta", f"Nie udało się nagrać skrótu: {e}")
            return
        self.root.after(10000, lambda: zakoncz(""))   # po 10 s bez naciśnięcia nagrywanie się wyłącza

    def _petla_w_tle(self) -> None:
        """Analiza w tle: w trakcie rundy liczy zawczasu widoki, które wejdą do lekcji, żeby po rundzie nie trzeba było czekać."""
        ostatnie, bledy = (), 0
        while True:
            time.sleep(4)
            try:
                if not (self.lokalny and self.cfg.get("w_tle", True)) or self.zajety or self.ostatni_ekran != "runda" or self.runda_zamknieta:
                    continue
                if "model" not in silnik_lokalny._stan:      # model jeszcze się wczytuje
                    continue
                wybrane = silnik.wybierz_rozne(list(self.widoki), 6)
                klucz = tuple(id(w) for w in wybrane)
                if not wybrane or klucz == ostatnie:
                    continue
                start = time.time()
                silnik_lokalny.przygotuj_widoki(wybrane)
                ostatnie = klucz
                if time.time() - start > 0.3:
                    silnik.log(f"analiza w tle: {len(wybrane)} widoków przygotowanych w {time.time() - start:.1f} s")
            except Exception:
                bledy += 1
                if bledy <= 3:
                    silnik.log("BŁĄD analizy w tle", blad=True)

    def _rozpoznaj_ekran(self, zrzut) -> str:
        """'runda', 'wynik', 'podsumowanie' albo 'mapa' (mapa otwarta w trakcie rundy — taki zrzut pomijamy)."""
        ekran = silnik.rodzaj_ekranu(zrzut)
        if ekran in ("mapa", "runda"):
            # Ekran wyniku w zwykłej grze to mapa na cały ekran z pinezką poprawnego miejsca (bez fioletowego paska).
            # Pinezka bywa w dowolnym miejscu, także przy górnej krawędzi; mapa bywa zielona, beżowa albo szara.
            pin = wynik_mapa.pinezka(zrzut)
            w, h = zrzut.size
            if pin and h * 0.05 < pin[1] < h * 0.97 and w * 0.02 < pin[0] < w * 0.98 and (ekran == "mapa" or silnik.kolory_mapy_szerokie(zrzut) >= 0.4):
                return "wynik"
        return ekran

    def _petla_zrzutow(self) -> None:
        ostatni_log, bledy, z_rzedu = 0.0, 0, 0
        while True:
            try:
                if not self.zajety:
                    zrzut = self._zrzut()
                    ekran = self._rozpoznaj_ekran(zrzut)
                    if ekran != self.ostatni_ekran:
                        silnik.log(f"ekran: {self.ostatni_ekran} → {ekran} · zrzut {zrzut.size[0]}x{zrzut.size[1]} · widoków {len(self.widoki)} · pojedynek {self._pojedynek(zrzut)}")
                    elif time.time() - ostatni_log > 30:   # co pół minuty znak życia
                        ostatni_log = time.time()
                        silnik.log(f"pętla zrzutów działa · ekran {ekran} · widoków {len(self.widoki)} · {self.pamiec or 'karta: brak odczytu'}")
                    if ekran == "runda":
                        z_rzedu += 1
                        if self.runda_zamknieta and z_rzedu >= 2:
                            self.widoki.clear()   # po wyniku lub podsumowaniu zaczęła się nowa runda
                            self.runda_zamknieta = False
                            silnik.log("nowa runda — widoki wyczyszczone")
                        odcisk = silnik.podpis_klatki(zrzut)
                        # do widoków trafiają tylko czyste zrzuty z ulicy (druga klatka z rzędu, bez dużej mapy), wyraźnie różne od poprzedniego
                        if z_rzedu >= 2 and silnik.czysty_widok(zrzut) and (not self.widoki or silnik.roznica_klatek(odcisk, self.widoki[-1][1]) > 9):
                            self.widoki.append((zrzut, odcisk))
                    else:
                        z_rzedu = 0
                    if ekran == "podsumowanie":
                        self.runda_zamknieta = True
                    elif ekran == "wynik" and self.ostatni_ekran != "wynik" and not self.runda_zamknieta:
                        if self.lokalny and self.cfg.get("auto_koniec", True) and len(self.widoki) >= 2:
                            self.runda_zamknieta = True
                            silnik.log("wykryto ekran wyniku → uruchamiam lekcję")
                            # Zrzuty wyniku łapie ta pętla (od razu i po 3 s, gdy mapa skończy się animować), a lekcja liczy się obok.
                            # Dzięki temu szybkie przejście do następnej rundy nie gubi wyniku.
                            self.zrzuty_wyniku = [zrzut]
                            self.kolejka.put(("akcja", lambda: self.koniec_rundy_lokalnie(auto=True)))
                            time.sleep(3)
                            pozniej = self._zrzut()
                            if self._rozpoznaj_ekran(pozniej) == "wynik":
                                self.zrzuty_wyniku.append(pozniej)
                            else:
                                silnik.log("po 3 s ekranu wyniku już nie było — użyję pierwszego zrzutu")
                            self.zrzuty_wyniku.append(None)     # znak dla lekcji: więcej zrzutów nie będzie
                        else:
                            self.runda_zamknieta = True
                            silnik.log(f"ekran wyniku, ale lekcja nie ruszyła: tryb lokalny {self.lokalny}, auto_koniec {self.cfg.get('auto_koniec', True)}, widoków {len(self.widoki)}")
                    if ekran != "mapa":      # mapa otwarta w trakcie rundy niczego nie zmienia
                        self.ostatni_ekran = ekran
            except Exception:
                bledy += 1
                if bledy <= 5 or bledy % 50 == 0:
                    silnik.log(f"BŁĄD w pętli zrzutów (nr {bledy})", blad=True)
            time.sleep(max(1, int(self.cfg.get("co_ile_s", 2))))

    def _obsluz_kolejke(self) -> None:
        try:
            while True:
                rodzaj, dane = self.kolejka.get_nowait()
                if rodzaj == "akcja":
                    try:
                        dane()
                    except Exception:
                        silnik.log("BŁĄD", blad=True)
                elif rodzaj == "pisz":
                    self.pisz(dane)
                    self._odswiez_status()
        except queue.Empty:
            pass
        self.root.after(150, self._obsluz_kolejke)

    def _w_tle(self, fn) -> None:
        if self.zajety:
            return
        self.zajety = True

        def praca():
            start = time.time()
            try:
                fn()
                silnik.log(f"praca w tle zakończona po {time.time() - start:.1f} s")
            except Exception as e:
                silnik.log("BŁĄD", blad=True)
                self.kolejka.put(("pisz", [("Błąd: ", "b"), (str(e), "")]))
            finally:
                self.zajety = False
        threading.Thread(target=praca, daemon=True).start()

    # ───────────── akcje ─────────────
    def przelacz_podpowiedzi(self) -> None:
        self.cfg["podpowiedzi"] = not self.cfg.get("podpowiedzi")
        silnik.zapisz_ustawienia(self.cfg)
        self._odswiez_status()
        self.pisz([("Podpowiedzi " + ("włączone 💡" if self.cfg["podpowiedzi"] else "wyłączone"), "akc"),
                   ("\nW trybach rankingowych (Duels, Battle Royale) podpowiedzi są blokowane automatycznie.", "szary")])

    def analiza(self) -> None:
        if not self.cfg.get("podpowiedzi"):
            self.pisz([("Podpowiedzi są wyłączone. ", "b"), (f"Włącz je klawiszem {self.nazwa_skrotu('skrot_podpowiedzi')}.", "")])
            return
        if self.lokalny:
            return self.analiza_lokalna()
        # drugie naciśnięcie po analizie = odkryj kraje
        if self.ostatnia_analiza and not self.odkryte and time.time() - self.ostatnia_analiza.get("_czas", 0) < 120:
            self.odkryte = True
            self._pokaz_analize(self.ostatnia_analiza)
            return
        self.pisz([("Analizuję widok…", "szary")])

        def praca():
            zrzut = self._zrzut()
            wynik = self.silnik.analizuj(zrzut)
            wynik["_czas"] = time.time()
            self.ostatnia_analiza, self.odkryte = wynik, False
            self.kolejka.put(("akcja", lambda: self._pokaz_analize(wynik)))
        self._w_tle(praca)

    def analiza_lokalna(self) -> None:
        """Darmowa podpowiedź: model lokalny + reguły GeoMeta. W pojedynkach (Duels) zablokowana."""
        if self.zajety:
            return
        try:
            zrzut = self._zrzut()
        except Exception as e:
            self.pisz([("Błąd zrzutu ekranu: ", "b"), (str(e), "")])
            return
        if self._pojedynek(zrzut) or any(self._pojedynek(w[0]) for w in list(self.widoki)[-2:]):
            silnik.log("analiza: wykryto pojedynek — podpowiedź zablokowana")
            self.pisz([("Pojedynek wykryty 🔒", "akc"), ("\nPodpowiedzi są tu zablokowane. Po rundzie dostaniesz lekcję.", "")])
            return
        if silnik.rodzaj_ekranu(zrzut) != "runda":
            silnik.log(f"analiza: zrzut {zrzut.size} nie wygląda na rundę (rozpoznano: {silnik.rodzaj_ekranu(zrzut)})")
            self.pisz([("To nie wygląda na widok z rundy.", "szary")])
            return
        self.pisz([("Analizuję widok (model lokalny)…", "szary")])
        widoki = silnik.wybierz_rozne([*self.widoki, (zrzut, silnik.podpis_klatki(zrzut))], 4)

        def praca():
            typy = silnik_lokalny.typuj(widoki, 3)
            widziane = silnik_lokalny.sprawdz_reguly(widoki)
            czesci = []
            napisy = silnik_lokalny.ostatnie_napisy()
            if napisy:
                czesci += [("Odczytane napisy:\n", "b")] + [(f" • „{n['napis']}” ({n['powod']}) → {n['kraje']}\n", "") for n in napisy]
            if widziane:
                czesci += [("Zauważone na zrzutach:\n", "b")] + [(f" • {w['widac']} ({w['pewnosc']}%) → {w['regula']}\n", "") for w in widziane]
            czesci.append(("\nNajbardziej prawdopodobne:\n", "b"))
            for t in typy:
                czesci.append((f" {t['kraj']} — {t['pewnosc']}%\n", "akc"))
                if self.cfg.get("porady", False):
                    czesci += [(f"   • sprawdź: {r}\n", "") for r in silnik_lokalny.pasujace_reguly(widoki, t["kod"], 2)]
            regiony = silnik_lokalny.typuj_region(widoki, typy[0]["kod"], 2) if typy else []
            self.kolejka.put(("akcja", lambda: self.rysuj_mape([t["kod"] for t in typy], self._punkty_mapy(regiony, napisy))))
            belka = "   ".join(f"{i + 1}. {t['kraj']} {t['pewnosc']}%" for i, t in enumerate(typy))
            self.kolejka.put(("akcja", lambda: (self.belka.config(text=belka), self.ustaw_widok(not self.cfg.get("kompakt", True)))))
            dodatki = silnik_lokalny.ostatnie_dodatki()
            if dodatki:
                czesci += [("\nDodatkowe reguły:\n", "b")] + [(f" • {d}\n", "") for d in dodatki]
            if regiony:
                czesci.append(("\nRegion (orientacyjnie): " + ", ".join(f"{r['region']} {r['pewnosc']}%" for r in regiony), "szary"))
            self.kolejka.put(("pisz", czesci))
        self._w_tle(praca)

    def _pokaz_analize(self, w: dict) -> None:
        self._odswiez_status()
        if w.get("tryb_rankingowy"):
            self.pisz([("Tryb rankingowy wykryty 🔒", "akc"), ("\nPodpowiedzi są tu zablokowane. Po rundzie naciśnij "
                       f"{self.nazwa_skrotu('skrot_koniec_rundy')}, żeby się z niej nauczyć.", "")])
            return
        czesci = [("👀 Na co spojrzeć: ", "akc"), (w.get("gdzie_patrzec", "") + "\n", "")]
        if w.get("widoczne_wskazowki"):
            czesci += [("\nWidoczne wskazówki:\n", "b")] + [(f" • {x}\n", "") for x in w["widoczne_wskazowki"]]
        if self.odkryte:
            czesci.append(("\nNajbardziej prawdopodobne:\n", "b"))
            for k in w.get("kandydaci", [])[:3]:
                czesci += [(f" {k['kraj']} — {k['pewnosc']}%\n", "akc"), (f"   {k['dlaczego']}\n", "")]
        else:
            czesci.append((f"\nNaciśnij {self.nazwa_skrotu('skrot_analiza')} jeszcze raz, żeby zobaczyć kraje.", "szary"))
        self.pisz(czesci)

    def koniec_rundy(self) -> None:
        if self.lokalny:
            return self.koniec_rundy_lokalnie()
        self.pisz([("Uczę się z tej rundy…", "szary")])
        widoki = silnik.wybierz_rozne(list(self.widoki), 2)

        def praca():
            wynik = self._zrzut()
            lekcja = self.silnik.lekcja(widoki, wynik)
            wpis = silnik.zapisz_runde(lekcja, widoki, wynik)
            self.widoki.clear()
            self.ostatnia_analiza = None
            info = ""
            if self.cfg.get("sync_url") and self.cfg.get("sync_token"):
                try:
                    synchronizacja.wyslij_runde(self.cfg, wpis)
                    info = "☁ zapisano w twoim koncie GeoMeta"
                except Exception as e:
                    info = f"☁ nie udało się wysłać ({e}) — zapisano lokalnie"
            czesci = [(("✅ " if lekcja.get("trafiony_kraj") else "❌ ") + f"{lekcja.get('poprawny_kraj', '?')}", "akc"),
                      (f"  {lekcja.get('miejsce', '')}\n", "szary"),
                      (f"Twój strzał: {lekcja.get('twoj_strzal', '?')}\n\n", ""),
                      (lekcja.get("lekcja", "") + "\n", "")]
            if lekcja.get("przeoczone"):
                czesci += [("\nZapamiętaj:\n", "b")] + [(f" • {x}\n", "") for x in lekcja["przeoczone"]]
            if info:
                czesci.append(("\n" + info, "szary"))
            self.kolejka.put(("pisz", czesci))
        self._w_tle(praca)

    def koniec_rundy_lokalnie(self, wynik=None, auto: bool = False) -> None:
        """Tryb darmowy: poprawny kraj odczytywany z mapy wyniku.

        auto=True (program sam wykrył ekran wyniku): nic nie trzeba klikać — gdy mapy nie da się pewnie odczytać, zostaje tylko krótka informacja.
        auto=False (F10 / przycisk): gdy wynik jest niepewny, pojawia się pytanie o kraj.
        """
        if self.zajety and auto:
            silnik.log("lekcja nie ruszyła: asystent był zajęty inną analizą — spróbuję za chwilę")
            self.root.after(1500, lambda: self.koniec_rundy_lokalnie(auto=True) if self.zrzuty_wyniku else None)
            return
        if self.zajety or (self.okno_rundy is not None and self.okno_rundy.winfo_exists()):
            return
        widoki = silnik.wybierz_rozne(list(self.widoki), 6)
        silnik.log(f"koniec rundy (lokalnie, {'sam' if auto else 'F10'}): widoków zapamiętanych {len(self.widoki)}, do analizy {len(widoki)}")
        start = time.time()
        if not auto:
            try:
                wynik = self._zrzut()
            except Exception as e:
                self.pisz([("Błąd zrzutu ekranu: ", "b"), (str(e), "")])
                return
            if not (self.cfg.get("auto_kraj", True) and silnik_lokalny.napisy_dostepne() and silnik.rodzaj_ekranu(wynik) in ("wynik", "mapa")):
                silnik.log(f"koniec rundy: pytam o kraj ręcznie · auto_kraj {self.cfg.get('auto_kraj', True)} · czytanie napisów {silnik_lokalny.napisy_dostepne()} · ekran {silnik.rodzaj_ekranu(wynik)}")
                return self._pytaj_o_kraj(widoki, wynik)
        self.ustaw_widok(True)
        self.pisz([("Czytam mapę wyniku…", "szary")])

        def praca():
            nonlocal wynik
            # widoki z rundy liczymy od razu — w tym czasie mapa wyniku kończy się animować
            typy = silnik_lokalny.typuj(widoki, 3) if widoki else []
            if auto:
                while time.time() - start < 6 and (not self.zrzuty_wyniku or self.zrzuty_wyniku[-1] is not None):
                    time.sleep(0.1)      # czekamy, aż pętla złapie zrzut po 3 s
                zlapane = [z for z in self.zrzuty_wyniku if z is not None]
                if not zlapane:
                    silnik.log("brak zrzutu wyniku — lekcja przerwana")
                    return
                wynik = zlapane[-1]      # najpóźniejszy: mapa już stoi, widać pinezkę i odległość
                silnik.log(f"zrzutów wyniku: {len(zlapane)}, do odczytu biorę {'późniejszy' if len(zlapane) > 1 else 'pierwszy'}")
            try:
                odczyt = wynik_mapa.odczytaj(wynik, [t["kod"] for t in typy]) if self.cfg.get("auto_kraj", True) and silnik_lokalny.napisy_dostepne() else None
            except Exception:
                silnik.log("BŁĄD odczytu mapy wyniku", blad=True)
                odczyt = None
            silnik.log(f"typy modelu: {typy} · odczyt mapy: {odczyt}")
            if odczyt and odczyt.get("pewny"):
                self._zrob_lekcje(widoki, wynik, odczyt["kod"], None, odczyt, typy)
            elif auto:   # bez klikania: sama informacja; F10 pozwala wpisać kraj ręcznie
                czesci = [("Nie udało się pewnie odczytać kraju z mapy wyniku", "b"), (f" ({odczyt['powod']})" if odczyt and odczyt.get("powod") else "", "szary"), (".\n", "")]
                if odczyt and odczyt.get("odleglosc_km") is not None:
                    czesci.append((f"Twoja odległość: {odczyt['odleglosc_km']} km\n", ""))
                if typy:
                    czesci.append(("Model typował: " + ", ".join(f"{t['kraj']} {t['pewnosc']}%" for t in typy) + "\n", ""))
                czesci.append((f"Naciśnij {self.nazwa_skrotu('skrot_koniec_rundy')} na ekranie wyniku, żeby wpisać kraj i dostać lekcję.", "szary"))
                self.kolejka.put(("pisz", czesci))
            else:  # F10: niepewne — okienko z wpisanym krajem do potwierdzenia
                self.kolejka.put(("akcja", lambda: self._pytaj_o_kraj(widoki, wynik, odczyt, typy)))
        self._w_tle(praca)

    def _pytaj_o_kraj(self, widoki: list, wynik, odczyt: dict | None = None, typy: list | None = None) -> None:
        if self.okno_rundy is not None and self.okno_rundy.winfo_exists():
            return
        lista = sorted(silnik_lokalny.kraje(), key=lambda k: k["pl"])
        okno = self.okno_rundy = tk.Toplevel(self.root)
        okno.title("Koniec rundy")
        okno.after(50, lambda: self._ukryj_przed_zrzutem(okno))
        okno.attributes("-topmost", True)
        okno.geometry("360x210")
        ramka = ttk.Frame(okno, padding=12)
        ramka.pack(fill="both", expand=True)
        wstepny = silnik_lokalny.kraj(odczyt["kod"]) if odczyt and odczyt.get("kod") else None
        ttk.Label(ramka, text=("Z mapy wyniku wygląda na ten kraj — Enter potwierdza:" if wstepny else "Jaki to był kraj? (zacznij pisać)")).pack(anchor="w")
        zm = tk.StringVar(value=wstepny["pl"] if wstepny else "")
        pole = ttk.Combobox(ramka, textvariable=zm, values=[k["pl"] for k in lista])
        pole.pack(fill="x", pady=6)
        okno.after(100, lambda: (okno.lift(), okno.focus_force(), pole.focus_set(), pole.selection_range(0, "end")))

        def filtruj(zd=None):
            if zd is not None and zd.keysym in ("Return", "Up", "Down"):
                return
            t = zm.get().lower()
            pole["values"] = [k["pl"] for k in lista if t in k["pl"].lower()] or [k["pl"] for k in lista]
        pole.bind("<KeyRelease>", filtruj)
        trafiony = tk.BooleanVar(value=False)
        ttk.Checkbutton(ramka, text="Trafiłem ten kraj", variable=trafiony).pack(anchor="w", pady=4)
        blad = ttk.Label(ramka, text="", foreground="#c00")
        blad.pack(anchor="w")

        def zatwierdz(_=None):
            t = zm.get().strip().lower()
            pas = ([k for k in lista if k["pl"].lower() == t] or [k for k in lista if k["pl"].lower().startswith(t)]) if t else []
            if len(pas) != 1:
                blad.config(text="Wybierz kraj z listy.")
                return
            kod, ok = pas[0]["id"], trafiony.get()
            okno.destroy()
            self.pisz([("Analizuję rundę (model lokalny)…", "szary"), ("\nPierwsze uruchomienie pobiera model (~1,7 GB) — to może potrwać kilka minut.", "szary")])
            # miejsce z mapy bierzemy tylko wtedy, gdy gracz potwierdził kraj, który z niej wyszedł
            miejsce = odczyt if odczyt and odczyt.get("kod") == kod else ({"odleglosc_km": odczyt.get("odleglosc_km")} if odczyt else None)
            self._w_tle(lambda: self._zrob_lekcje(widoki, wynik, kod, ok, miejsce, typy))
        pole.bind("<Return>", zatwierdz)
        ttk.Button(ramka, text="OK", command=zatwierdz).pack(anchor="e", pady=4)

    def _zrob_lekcje(self, widoki: list, wynik, kod: str, ok: bool | None, odczyt: dict | None, typy: list | None) -> None:
        """Liczy lekcję (w wątku roboczym), zapisuje rundę i pokazuje wynik."""
        porady = bool(self.cfg.get("porady", False))
        lekcja = silnik_lokalny.lekcja(widoki, kod, ok, odczyt, typy, porady)
        wpis = silnik.zapisz_runde(lekcja, widoki, wynik)
        self.runda_zamknieta = True     # następny widok z ulicy zaczyna nową rundę (wtedy widoki się wyczyszczą)
        silnik.log(f"lekcja: kraj {kod} · potwierdzenie gracza {ok} · miejsce {lekcja.get('miejsce')!r} · odległość {lekcja.get('odleglosc_km')} · model {lekcja.get('model')} · regiony {lekcja.get('regiony')} · pliki {wpis.get('pliki')}")
        info = f"model lokalny · {silnik_lokalny.urzadzenie()} · 0 zł"
        if self.cfg.get("sync_url") and self.cfg.get("sync_token"):
            try:
                synchronizacja.wyslij_runde(self.cfg, wpis)
                info += " · ☁ zapisano w koncie GeoMeta"
            except Exception as e:
                info += f" · ☁ nie wysłano ({e})"
        znak = "✅ " if silnik.runda_udana(lekcja) else ("❌ " if ok is not None or lekcja.get("odleglosc_km") is not None else "")
        czesci = [(znak + lekcja["poprawny_kraj"], "akc"), (f"  {lekcja['miejsce']}\n" if lekcja.get("miejsce") else "\n", "szary")]
        if lekcja.get("odleglosc_km") is not None:
            czesci.append((f"Twoja odległość: {lekcja['odleglosc_km']} km\n", ""))
        if odczyt and odczyt.get("powod") and odczyt.get("kod") == kod:
            czesci.append((f"Kraj odczytany z mapy wyniku ({odczyt['powod']}).\n", "szary"))
        czesci.append(("\n" + lekcja["lekcja"] + "\n", ""))
        punkty = self._punkty_mapy(lekcja["regiony"], lekcja["napisy"])
        if lekcja.get("punkt"):
            la, lo = lekcja["punkt"]
            # znamy dokładne miejsce: mapa przybliża się na nie, a wokół pokazuje największe miasta do orientacji
            punkty = [{"lat": la, "lon": lo, "napis": "poprawne miejsce", "kolor": "#2a7de1", "dokladny": True}]
            try:
                punkty += wynik_mapa.miasta_w_okolicy(la, lo)
            except Exception:
                silnik.log("BŁĄD przy szukaniu miast w okolicy", blad=True)
        self.kolejka.put(("akcja", lambda: (self.rysuj_mape([kod], punkty), self.belka.config(text=znak + lekcja["poprawny_kraj"]), self.ustaw_widok(True))))
        if lekcja["napisy"]:
            czesci += [("\nOdczytane napisy:\n", "b")] + [(f" • „{n['napis']}” ({n['powod']}) → {n['kraje']}\n", "") for n in lekcja["napisy"]]
        if lekcja.get("dodatki"):
            czesci += [("\nDodatkowe reguły:\n", "b")] + [(f" • {d}\n", "") for d in lekcja["dodatki"]]
        if lekcja["widziane"]:
            czesci += [("\nModel zauważył na zrzutach (sprawdź sam):\n", "b")] + [(f" • {w['widac']} ({w['pewnosc']}%) → {w['regula']}\n", "") for w in lekcja["widziane"]]
        if porady and lekcja["pasujace"]:
            czesci += [("\nReguły GeoMeta najlepiej pasujące do tych widoków:\n", "b")] + [(f" • {x}\n", "") for x in lekcja["pasujace"]]
        if lekcja["regiony"]:
            czesci += [("\nGdzie w tym kraju:\n", "b")] + [(f" • {r['region']} — {r['pewnosc']}%\n", "") for r in lekcja["regiony"]]
        if porady and lekcja["pasujace_regionalne"]:
            czesci += [("\nWskazówki regionalne pasujące do widoków:\n", "b")] + [(f" • {x}\n", "") for x in lekcja["pasujace_regionalne"]]
        if porady and lekcja["pasujace_pomylony"]:
            czesci += [(f"\nDlaczego model myślał o: {lekcja['pomylony']}\n", "b")] + [(f" • {x}\n", "") for x in lekcja["pasujace_pomylony"]]
        if porady and lekcja["przeoczone"]:
            czesci += [("\nZłote wskazówki:\n", "b")] + [(f" • {x}\n", "") for x in lekcja["przeoczone"]]
        if porady and lekcja["roznice"]:
            czesci += [(f"\nJak odróżnić od: {lekcja['pomylony']}\n", "b")] + [(f" • {x}\n", "") for x in lekcja["roznice"]]
        for kat, lst in (lekcja["wskazowki"].items() if porady else ()):
            czesci += [(f"\n{kat}\n", "b")] + [(f" • {x}\n", "") for x in lst]
        if lekcja.get("uczenie"):
            info += " · " + lekcja["uczenie"]
        czesci.append(("\n" + info, "szary"))
        self.kolejka.put(("pisz", czesci))

    def raport(self) -> None:
        p = silnik.raport_html()
        silnik.eksport_dla_geometa()
        webbrowser.open(p.as_uri())

    # ───────────── ustawienia ─────────────
    def ustawienia(self) -> None:
        okno = tk.Toplevel(self.root)
        okno.title("Ustawienia — GeoMeta Asystent")
        okno.attributes("-topmost", True)
        okno.geometry("600x900")
        ramka = ttk.Frame(okno, padding=14)
        ramka.pack(fill="both", expand=True)

        def pole(etykieta, wartosc, ukryte=False):
            ttk.Label(ramka, text=etykieta).pack(anchor="w", pady=(8, 2))
            zm = tk.StringVar(value=str(wartosc))
            ttk.Entry(ramka, textvariable=zm, show="•" if ukryte else "").pack(fill="x")
            return zm

        ttk.Label(ramka, text="Tryb:").pack(anchor="w", pady=(0, 2))
        tryby = {"Darmowy — model na tym komputerze": "lokalny", "Claude — płatny, dokładniejszy": "claude"}
        tryb = tk.StringVar(value=next(n for n, v in tryby.items() if v == self.cfg.get("tryb", "lokalny")))
        ttk.Combobox(ramka, textvariable=tryb, values=list(tryby), state="readonly").pack(fill="x")
        klucz = pole("Klucz API Anthropic (tylko tryb Claude):", self.cfg.get("api_key", ""), True)
        ttk.Label(ramka, text="Model:").pack(anchor="w", pady=(8, 2))
        nazwy = {v["nazwa"]: k for k, v in silnik.MODELE.items()}
        model = tk.StringVar(value=silnik.MODELE[self.cfg["model"]]["nazwa"])
        ttk.Combobox(ramka, textvariable=model, values=list(nazwy), state="readonly").pack(fill="x")
        ttk.Label(ramka, text="Skróty (klawisz albo przycisk myszy):").pack(anchor="w", pady=(10, 2))
        wiersz = ttk.Frame(ramka)
        wiersz.pack(fill="x")
        skroty = {}
        for kol, (nazwa, opis) in enumerate([("skrot_analiza", "Analiza widoku"), ("skrot_podpowiedzi", "Podpowiedzi wł./wył."), ("skrot_koniec_rundy", "Koniec rundy")]):
            ttk.Label(wiersz, text=opis).grid(row=0, column=kol, sticky="w", padx=(0, 8))
            zm = tk.StringVar(value=self.nazwa_skrotu(nazwa))
            ttk.Combobox(wiersz, textvariable=zm, values=list(SKROTY), state="readonly", width=20).grid(row=1, column=kol, sticky="we", padx=(0, 8))
            skroty[nazwa] = zm
            przycisk = ttk.Button(wiersz, text="⏺ Nagraj")
            przycisk.config(command=lambda z=zm, b=przycisk: self._nagraj_skrot(z, b))
            przycisk.grid(row=2, column=kol, sticky="we", padx=(0, 8), pady=(2, 0))
            wiersz.columnconfigure(kol, weight=1)
        ttk.Label(ramka, text="„Nagraj”: kliknij, a potem naciśnij klawisz albo przycisk myszy, który chcesz przypisać.\n"
                              "Jeśli przycisk myszy nie reaguje, przypisz mu w programie myszki klawisz (np. F13) i nagraj ponownie.",
                  foreground="#666").pack(anchor="w", pady=(4, 0))
        ttk.Label(ramka, text="Zrzut ekranu co ile sekund (krócej = więcej widoków z rundy):").pack(anchor="w", pady=(10, 0))
        odstep = tk.IntVar(value=int(self.cfg.get("co_ile_s", 2)))
        tk.Scale(ramka, from_=1, to=10, orient="horizontal", variable=odstep, showvalue=True).pack(fill="x")
        kompakt = tk.BooleanVar(value=bool(self.cfg.get("kompakt", True)))
        ttk.Checkbutton(ramka, text="Kompaktowy widok w trakcie rundy (pełna lekcja po rundzie)", variable=kompakt).pack(anchor="w")
        porady_zm = tk.BooleanVar(value=bool(self.cfg.get("porady", False)))
        ttk.Checkbutton(ramka, text="Pokazuj w lekcji porady i wskazówki GeoMeta (wyłączone = tylko to, co rozpoznał program)", variable=porady_zm).pack(anchor="w")
        w_tle = tk.BooleanVar(value=bool(self.cfg.get("w_tle", True)))
        ttk.Checkbutton(ramka, text="Analizuj widoki w tle w trakcie rundy (szybsza lekcja; karta pracuje też podczas gry)", variable=w_tle).pack(anchor="w")
        auto_kraj = tk.BooleanVar(value=bool(self.cfg.get("auto_kraj", True)))
        ttk.Checkbutton(ramka, text="Sam odczytuj poprawny kraj z mapy wyniku", variable=auto_kraj).pack(anchor="w")
        monitor = pole("Numer monitora z grą (1 = główny):", self.cfg.get("monitor", 1))
        url = pole("Adres twojej strony GeoMeta (do synchronizacji, opcjonalnie):", self.cfg.get("sync_url", ""))
        token = pole("Token synchronizacji (z panelu Cloudflare, opcjonalnie):", self.cfg.get("sync_token", ""), True)
        ttk.Label(ramka, text="Gra powinna działać w oknie lub w trybie „pełny ekran w oknie” (borderless),\n"
                              "żeby to okienko było widoczne nad nią.", foreground="#666").pack(anchor="w", pady=10)

        def zapisz():
            self.cfg.update(tryb=tryby[tryb.get()], api_key=klucz.get().strip(), model=nazwy[model.get()], sync_url=url.get().strip().rstrip("/"),
                            sync_token=token.get().strip(), co_ile_s=int(odstep.get()), kompakt=bool(kompakt.get()), auto_kraj=bool(auto_kraj.get()), porady=bool(porady_zm.get()), w_tle=bool(w_tle.get()))
            wybrane = [self._wartosc_skrotu(zm.get()) for zm in skroty.values()]
            if len({w for w in wybrane if w}) < len([w for w in wybrane if w]):
                messagebox.showwarning("GeoMeta", "Każda akcja musi mieć inny skrót.")
                return
            for nazwa, zm in skroty.items():
                self.cfg[nazwa] = self._wartosc_skrotu(zm.get())
            try:
                self.cfg["monitor"] = max(1, int(monitor.get()))
            except ValueError:
                pass
            if self.lokalny:
                ok, powod = silnik_lokalny.dostepny()
                if not ok:
                    self.cfg["tryb"] = "claude"
                    messagebox.showwarning("GeoMeta", powod)
            silnik.zapisz_ustawienia(self.cfg)
            okno.destroy()
            self._podepnij_skroty()
            self._odswiez_status()
            if self.cfg.get("sync_url") and self.cfg.get("sync_token"):
                try:
                    synchronizacja.test(self.cfg)
                    messagebox.showinfo("GeoMeta", "Połączenie ze stroną działa ✅")
                except Exception as e:
                    messagebox.showwarning("GeoMeta", f"Nie udało się połączyć ze stroną:\n{e}")
        ttk.Button(ramka, text="Zapisz", command=zapisz).pack(anchor="e", pady=6)

    def uruchom(self) -> None:
        self.root.mainloop()


if __name__ == "__main__":
    Asystent().uruchom()
