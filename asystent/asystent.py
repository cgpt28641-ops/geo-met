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
        self.silnik = silnik.Silnik(self.cfg)
        self.widoki: deque = deque(maxlen=30)      # różniące się widoki z rundy: (obraz, odcisk)
        self.kolejka: queue.Queue = queue.Queue()  # wyniki z wątków roboczych → okno
        self.ostatnia_analiza: dict | None = None
        self.odkryte = False
        self.zajety = False
        self.ostatni_ekran = "runda"
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
        self._podepnij_skroty()
        self.root.after(200, self._obsluz_kolejke)
        threading.Thread(target=self._petla_pamieci, daemon=True).start()
        if self.cfg.get("auto_zrzuty"):
            threading.Thread(target=self._petla_zrzutow, daemon=True).start()
        if self.cfg.get("tryb") == "lokalny":
            ok, powod = silnik_lokalny.dostepny()
            if not ok:
                self.cfg["tryb"] = "claude"
                self.root.after(600, lambda: self.pisz([("Tryb darmowy niedostępny. ", "b"), (powod + "\nPrzełączono na tryb Claude (płatny).", "")]))
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
            for x, y, napis, kolor, dy in p["znaczniki"]:
                self.plotno.create_oval(x - 5, y - 5, x + 5, y + 5, fill=kolor, outline="white", width=2)
                if napis:
                    self.plotno.create_text(x + 8, y + dy, text=napis, anchor="w", fill="white", font=("Segoe UI", 8, "bold"))
        except Exception as e:
            self.plotno.delete("all")
            self.plotno.create_text(10, 10, text=f"Mapa niedostępna: {e}", anchor="nw", fill="white")

    @staticmethod
    def _punkty_mapy(regiony: list, napisy: list) -> list:
        pkt = [{"lat": r["lat"], "lon": r["lon"], "napis": f"{r['region'].replace('województwo ', 'woj. ')} {r['pewnosc']}%", "kolor": "#f2a516"} for r in regiony[:1]]
        pkt += [{"lat": n["miasto"]["lat"], "lon": n["miasto"]["lon"], "napis": n["miasto"]["nazwa"], "kolor": "#e5484d"} for n in napisy if n.get("miasto")]
        return pkt

    def _odswiez_status(self) -> None:
        on = self.cfg.get("podpowiedzi")
        self.lbl_tryb.config(text=("💡 podpowiedzi WŁ." if on else "🎓 tylko nauka"), fg=(KOLOR_AKCENT if on else KOLOR_SZARY))
        self.btn_analiza.config(state=("normal" if on else "disabled"))
        k = self.silnik.koszt
        self.lbl_koszt.config(text=("tryb darmowy · 0 zł" + (" · " + self.pamiec if self.pamiec else "")) if self.lokalny else f"{k.wywolania} analiz · ~{k.pln:.2f} zł")

    def _petla_pamieci(self) -> None:
        """Co kilka sekund sprawdza zajętość pamięci karty graficznej (pokazywaną na dole okienka)."""
        while True:
            try:
                nowa = silnik_lokalny.pamiec_karty() if self.lokalny else ""
                if nowa != self.pamiec:
                    self.pamiec = nowa
                    self.kolejka.put(("akcja", self._odswiez_status))
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
            keyboard.unhook_all_hotkeys()
        except Exception as e:
            keyboard = None
            bledy.append(f"klawiatura: {e}")
        try:
            import mouse
            mouse.unhook_all()
        except Exception as e:
            mouse = None
            bledy.append(f"mysz: {e}")
        for nazwa, fn in akcje.items():
            skrot = str(self.cfg.get(nazwa, "")).strip().lower()
            wywolaj = (lambda f=fn: self.kolejka.put(("akcja", f)))
            try:
                if skrot.startswith("mysz:"):
                    if mouse:
                        mouse.on_button(wywolaj, buttons=(skrot[5:],), types=("down",))
                elif skrot and keyboard:
                    keyboard.add_hotkey(skrot, wywolaj)
            except Exception as e:
                bledy.append(f"{skrot}: {e}")
        if bledy:  # brak uprawnień lub biblioteki — zostają przyciski w okienku
            self.root.after(500, lambda: self.pisz([("Część skrótów niedostępna: ", "b"), ("; ".join(bledy), ""), ("\nUżywaj przycisków w okienku.", "szary")]))

    def nazwa_skrotu(self, nazwa: str) -> str:
        return next((n for n, v in SKROTY.items() if v == str(self.cfg.get(nazwa, "")).lower()), str(self.cfg.get(nazwa, "")).upper())

    def _petla_zrzutow(self) -> None:
        while True:
            try:
                if not self.zajety:
                    zrzut = silnik.zrob_zrzut(self.cfg.get("monitor", 1))
                    ekran = silnik.rodzaj_ekranu(zrzut)
                    if ekran == "runda":
                        if self.ostatni_ekran != "runda":
                            self.widoki.clear()   # zaczęła się nowa runda
                        odcisk = silnik.podpis_klatki(zrzut)
                        # zapisujemy tylko widoki wyraźnie różne od poprzedniego (inny kierunek lub miejsce)
                        if not self.widoki or silnik.roznica_klatek(odcisk, self.widoki[-1][1]) > 9:
                            self.widoki.append((zrzut, odcisk))
                    elif ekran == "wynik" and self.ostatni_ekran == "runda" and self.lokalny and self.cfg.get("auto_koniec", True) and self.widoki:
                        self.kolejka.put(("akcja", lambda z=zrzut: self.koniec_rundy_lokalnie(z)))
                    self.ostatni_ekran = ekran
            except Exception:
                pass
            time.sleep(max(1, int(self.cfg.get("co_ile_s", 2))))

    def _obsluz_kolejke(self) -> None:
        try:
            while True:
                rodzaj, dane = self.kolejka.get_nowait()
                if rodzaj == "akcja":
                    try:
                        dane()
                    except Exception:
                        traceback.print_exc()
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
            try:
                fn()
            except Exception as e:
                traceback.print_exc()
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
            zrzut = silnik.zrob_zrzut(self.cfg.get("monitor", 1))
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
            zrzut = silnik.zrob_zrzut(self.cfg.get("monitor", 1))
        except Exception as e:
            self.pisz([("Błąd zrzutu ekranu: ", "b"), (str(e), "")])
            return
        if silnik.czy_pojedynek(zrzut) or any(silnik.czy_pojedynek(w[0]) for w in list(self.widoki)[-2:]):
            self.pisz([("Pojedynek wykryty 🔒", "akc"), ("\nPodpowiedzi są tu zablokowane. Po rundzie dostaniesz lekcję.", "")])
            return
        if silnik.rodzaj_ekranu(zrzut) != "runda":
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
            wynik = silnik.zrob_zrzut(self.cfg.get("monitor", 1))
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

    def koniec_rundy_lokalnie(self, wynik=None) -> None:
        """Tryb darmowy: poprawny kraj odczytywany z mapy wyniku; gdy wynik jest niepewny — pytanie do gracza."""
        if self.zajety or (self.okno_rundy is not None and self.okno_rundy.winfo_exists()):
            return
        widoki = silnik.wybierz_rozne(list(self.widoki), 6)
        if wynik is None:
            try:
                wynik = silnik.zrob_zrzut(self.cfg.get("monitor", 1))
            except Exception as e:
                self.pisz([("Błąd zrzutu ekranu: ", "b"), (str(e), "")])
                return
        if not (self.cfg.get("auto_kraj", True) and silnik_lokalny.napisy_dostepne() and silnik.rodzaj_ekranu(wynik) == "wynik"):
            return self._pytaj_o_kraj(widoki, wynik)
        self.ustaw_widok(True)
        self.pisz([("Czytam mapę wyniku…", "szary"), ("\nPierwsze uruchomienie pobiera modele — to może potrwać kilka minut.", "szary")])

        def praca():
            typy = silnik_lokalny.typuj(widoki, 3) if widoki else []
            try:
                odczyt = wynik_mapa.odczytaj(wynik, [t["kod"] for t in typy])
            except Exception:
                traceback.print_exc()
                odczyt = None
            if odczyt and odczyt.get("pewny"):
                self._zrob_lekcje(widoki, wynik, odczyt["kod"], None, odczyt, typy)
            else:  # niepewne — okienko z wpisanym krajem do potwierdzenia
                self.kolejka.put(("akcja", lambda: self._pytaj_o_kraj(widoki, wynik, odczyt, typy)))
        self._w_tle(praca)

    def _pytaj_o_kraj(self, widoki: list, wynik, odczyt: dict | None = None, typy: list | None = None) -> None:
        if self.okno_rundy is not None and self.okno_rundy.winfo_exists():
            return
        lista = sorted(silnik_lokalny.kraje(), key=lambda k: k["pl"])
        okno = self.okno_rundy = tk.Toplevel(self.root)
        okno.title("Koniec rundy")
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
        lekcja = silnik_lokalny.lekcja(widoki, kod, ok, odczyt, typy)
        wpis = silnik.zapisz_runde(lekcja, widoki, wynik)
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
            punkty.append({"lat": lekcja["punkt"][0], "lon": lekcja["punkt"][1], "napis": "poprawne miejsce", "kolor": "#2a7de1"})
        self.kolejka.put(("akcja", lambda: (self.rysuj_mape([kod], punkty), self.belka.config(text=znak + lekcja["poprawny_kraj"]), self.ustaw_widok(True))))
        if lekcja["napisy"]:
            czesci += [("\nOdczytane napisy:\n", "b")] + [(f" • „{n['napis']}” ({n['powod']}) → {n['kraje']}\n", "") for n in lekcja["napisy"]]
        if lekcja.get("dodatki"):
            czesci += [("\nDodatkowe reguły:\n", "b")] + [(f" • {d}\n", "") for d in lekcja["dodatki"]]
        if lekcja["widziane"]:
            czesci += [("\nModel zauważył na zrzutach (sprawdź sam):\n", "b")] + [(f" • {w['widac']} ({w['pewnosc']}%) → {w['regula']}\n", "") for w in lekcja["widziane"]]
        if lekcja["pasujace"]:
            czesci += [("\nReguły GeoMeta najlepiej pasujące do tych widoków:\n", "b")] + [(f" • {x}\n", "") for x in lekcja["pasujace"]]
        if lekcja["regiony"]:
            czesci += [("\nGdzie w tym kraju:\n", "b")] + [(f" • {r['region']} — {r['pewnosc']}%\n", "") for r in lekcja["regiony"]]
        if lekcja["pasujace_regionalne"]:
            czesci += [("\nWskazówki regionalne pasujące do widoków:\n", "b")] + [(f" • {x}\n", "") for x in lekcja["pasujace_regionalne"]]
        if lekcja["pasujace_pomylony"]:
            czesci += [(f"\nDlaczego model myślał o: {lekcja['pomylony']}\n", "b")] + [(f" • {x}\n", "") for x in lekcja["pasujace_pomylony"]]
        if lekcja["przeoczone"]:
            czesci += [("\nZłote wskazówki:\n", "b")] + [(f" • {x}\n", "") for x in lekcja["przeoczone"]]
        if lekcja["roznice"]:
            czesci += [(f"\nJak odróżnić od: {lekcja['pomylony']}\n", "b")] + [(f" • {x}\n", "") for x in lekcja["roznice"]]
        for kat, lst in lekcja["wskazowki"].items():
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
        okno.geometry("560x800")
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
            wiersz.columnconfigure(kol, weight=1)
        ttk.Label(ramka, text="Zrzut ekranu co ile sekund (krócej = więcej widoków z rundy):").pack(anchor="w", pady=(10, 0))
        odstep = tk.IntVar(value=int(self.cfg.get("co_ile_s", 2)))
        tk.Scale(ramka, from_=1, to=10, orient="horizontal", variable=odstep, showvalue=True).pack(fill="x")
        kompakt = tk.BooleanVar(value=bool(self.cfg.get("kompakt", True)))
        ttk.Checkbutton(ramka, text="Kompaktowy widok w trakcie rundy (pełna lekcja po rundzie)", variable=kompakt).pack(anchor="w")
        auto_kraj = tk.BooleanVar(value=bool(self.cfg.get("auto_kraj", True)))
        ttk.Checkbutton(ramka, text="Sam odczytuj poprawny kraj z mapy wyniku", variable=auto_kraj).pack(anchor="w")
        monitor = pole("Numer monitora z grą (1 = główny):", self.cfg.get("monitor", 1))
        url = pole("Adres twojej strony GeoMeta (do synchronizacji, opcjonalnie):", self.cfg.get("sync_url", ""))
        token = pole("Token synchronizacji (z panelu Cloudflare, opcjonalnie):", self.cfg.get("sync_token", ""), True)
        ttk.Label(ramka, text="Gra powinna działać w oknie lub w trybie „pełny ekran w oknie” (borderless),\n"
                              "żeby to okienko było widoczne nad nią.", foreground="#666").pack(anchor="w", pady=10)

        def zapisz():
            self.cfg.update(tryb=tryby[tryb.get()], api_key=klucz.get().strip(), model=nazwy[model.get()], sync_url=url.get().strip().rstrip("/"),
                            sync_token=token.get().strip(), co_ile_s=int(odstep.get()), kompakt=bool(kompakt.get()), auto_kraj=bool(auto_kraj.get()))
            wybrane = [SKROTY.get(zm.get(), "") for zm in skroty.values()]
            if len({w for w in wybrane if w}) < len([w for w in wybrane if w]):
                messagebox.showwarning("GeoMeta", "Każda akcja musi mieć inny skrót.")
                return
            for nazwa, zm in skroty.items():
                self.cfg[nazwa] = SKROTY.get(zm.get(), self.cfg.get(nazwa, ""))
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
