"""GeoMeta Asystent — małe okienko obok GeoGuessra.

Skróty (domyślnie):
  F8  — analiza bieżącego widoku (tylko gdy podpowiedzi są włączone; drugie naciśnięcie pokazuje kraje)
  F9  — włącz / wyłącz podpowiedzi
  F10 — koniec rundy: nauka na podstawie poprawnego miejsca (zawsze działa)
"""
from __future__ import annotations

import queue
import threading
import time
import tkinter as tk
import traceback
import webbrowser
from collections import deque
from tkinter import messagebox, ttk

import silnik
import synchronizacja

KOLOR_TLA = "#0f172a"
KOLOR_TEKSTU = "#e8edf7"
KOLOR_AKCENT = "#22c47f"
KOLOR_SZARY = "#95a0b8"


class Asystent:
    def __init__(self) -> None:
        self.cfg = silnik.wczytaj_ustawienia()
        self.silnik = silnik.Silnik(self.cfg)
        self.widoki: deque = deque(maxlen=4)       # ostatnie zrzuty z rundy (lokalnie, za darmo)
        self.kolejka: queue.Queue = queue.Queue()  # wyniki z wątków roboczych → okno
        self.ostatnia_analiza: dict | None = None
        self.odkryte = False
        self.zajety = False

        self.root = tk.Tk()
        self.root.title("GeoMeta Asystent")
        self.root.attributes("-topmost", True)
        try:
            self.root.attributes("-alpha", 0.93)
        except tk.TclError:
            pass
        self.root.configure(bg=KOLOR_TLA)
        self.root.geometry("380x320-20+60")
        self.root.minsize(300, 200)
        self._buduj_okno()
        self._podepnij_skroty()
        self.root.after(200, self._obsluz_kolejke)
        if self.cfg.get("auto_zrzuty"):
            threading.Thread(target=self._petla_zrzutow, daemon=True).start()
        if not (self.cfg.get("api_key") or "").strip():
            self.root.after(400, self.ustawienia)

    # ───────────── okno ─────────────
    def _buduj_okno(self) -> None:
        gora = tk.Frame(self.root, bg=KOLOR_TLA)
        gora.pack(fill="x", padx=10, pady=(8, 4))
        tk.Label(gora, text="🌍 GeoMeta", fg=KOLOR_AKCENT, bg=KOLOR_TLA, font=("Segoe UI", 12, "bold")).pack(side="left")
        self.lbl_tryb = tk.Label(gora, fg=KOLOR_SZARY, bg=KOLOR_TLA, font=("Segoe UI", 9))
        self.lbl_tryb.pack(side="left", padx=8)
        tk.Button(gora, text="⚙", command=self.ustawienia, bg=KOLOR_TLA, fg=KOLOR_TEKSTU, bd=0, font=("Segoe UI", 11)).pack(side="right")
        tk.Button(gora, text="📊", command=self.raport, bg=KOLOR_TLA, fg=KOLOR_TEKSTU, bd=0, font=("Segoe UI", 11)).pack(side="right")

        self.txt = tk.Text(self.root, bg="#18223a", fg=KOLOR_TEKSTU, wrap="word", bd=0, padx=10, pady=8,
                           font=("Segoe UI", 10), height=10, insertbackground=KOLOR_TEKSTU)
        self.txt.pack(fill="both", expand=True, padx=10)
        self.txt.tag_configure("b", font=("Segoe UI", 10, "bold"))
        self.txt.tag_configure("akc", foreground=KOLOR_AKCENT, font=("Segoe UI", 11, "bold"))
        self.txt.tag_configure("szary", foreground=KOLOR_SZARY)

        dol = tk.Frame(self.root, bg=KOLOR_TLA)
        dol.pack(fill="x", padx=10, pady=8)
        self.btn_analiza = tk.Button(dol, text="🔍 Analiza (F8)", command=self.analiza)
        self.btn_analiza.pack(side="left")
        tk.Button(dol, text="🏁 Koniec rundy (F10)", command=self.koniec_rundy).pack(side="left", padx=6)
        self.lbl_koszt = tk.Label(dol, fg=KOLOR_SZARY, bg=KOLOR_TLA, font=("Segoe UI", 8))
        self.lbl_koszt.pack(side="right")
        self._odswiez_status()
        self.pisz([("Gotowy. ", "akc"), (f"{self.cfg['skrot_koniec_rundy'].upper()} po każdej rundzie = nauka na poprawnym miejscu.\n", ""),
                   (f"{self.cfg['skrot_podpowiedzi'].upper()} włącza podpowiedzi (tylko gra pojedyncza / trening).", "szary")])

    def _odswiez_status(self) -> None:
        on = self.cfg.get("podpowiedzi")
        self.lbl_tryb.config(text=("💡 podpowiedzi WŁ." if on else "🎓 tylko nauka"), fg=(KOLOR_AKCENT if on else KOLOR_SZARY))
        self.btn_analiza.config(state=("normal" if on else "disabled"))
        k = self.silnik.koszt
        self.lbl_koszt.config(text=f"{k.wywolania} analiz · ~{k.pln:.2f} zł")

    def pisz(self, czesci: list[tuple[str, str]]) -> None:
        self.txt.config(state="normal")
        self.txt.delete("1.0", "end")
        for tekst, tag in czesci:
            self.txt.insert("end", tekst, tag or ())
        self.txt.config(state="disabled")

    # ───────────── skróty globalne ─────────────
    def _podepnij_skroty(self) -> None:
        try:
            import keyboard  # globalne skróty działające także, gdy aktywna jest gra
            keyboard.add_hotkey(self.cfg["skrot_analiza"], lambda: self.kolejka.put(("akcja", self.analiza)))
            keyboard.add_hotkey(self.cfg["skrot_podpowiedzi"], lambda: self.kolejka.put(("akcja", self.przelacz_podpowiedzi)))
            keyboard.add_hotkey(self.cfg["skrot_koniec_rundy"], lambda: self.kolejka.put(("akcja", self.koniec_rundy)))
        except Exception as e:  # brak uprawnień lub biblioteki — zostają przyciski
            self.root.after(500, lambda: self.pisz([("Skróty klawiszowe niedostępne: ", "b"), (str(e), ""), ("\nUżywaj przycisków w okienku.", "szary")]))

    def _petla_zrzutow(self) -> None:
        while True:
            try:
                if not self.zajety:
                    self.widoki.append(silnik.zrob_zrzut(self.cfg.get("monitor", 1)))
            except Exception:
                pass
            time.sleep(max(3, int(self.cfg.get("co_ile_s", 8))))

    def _obsluz_kolejke(self) -> None:
        try:
            while True:
                rodzaj, dane = self.kolejka.get_nowait()
                if rodzaj == "akcja":
                    dane()
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
            self.pisz([("Podpowiedzi są wyłączone. ", "b"), (f"Włącz je klawiszem {self.cfg['skrot_podpowiedzi'].upper()}.", "")])
            return
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

    def _pokaz_analize(self, w: dict) -> None:
        self._odswiez_status()
        if w.get("tryb_rankingowy"):
            self.pisz([("Tryb rankingowy wykryty 🔒", "akc"), ("\nPodpowiedzi są tu zablokowane. Po rundzie naciśnij "
                       f"{self.cfg['skrot_koniec_rundy'].upper()}, żeby się z niej nauczyć.", "")])
            return
        czesci = [("👀 Na co spojrzeć: ", "akc"), (w.get("gdzie_patrzec", "") + "\n", "")]
        if w.get("widoczne_wskazowki"):
            czesci += [("\nWidoczne wskazówki:\n", "b")] + [(f" • {x}\n", "") for x in w["widoczne_wskazowki"]]
        if self.odkryte:
            czesci.append(("\nNajbardziej prawdopodobne:\n", "b"))
            for k in w.get("kandydaci", [])[:3]:
                czesci += [(f" {k['kraj']} — {k['pewnosc']}%\n", "akc"), (f"   {k['dlaczego']}\n", "")]
        else:
            czesci.append((f"\nNaciśnij {self.cfg['skrot_analiza'].upper()} jeszcze raz, żeby zobaczyć kraje.", "szary"))
        self.pisz(czesci)

    def koniec_rundy(self) -> None:
        self.pisz([("Uczę się z tej rundy…", "szary")])
        widoki = list(self.widoki)

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

    def raport(self) -> None:
        p = silnik.raport_html()
        silnik.eksport_dla_geometa()
        webbrowser.open(p.as_uri())

    # ───────────── ustawienia ─────────────
    def ustawienia(self) -> None:
        okno = tk.Toplevel(self.root)
        okno.title("Ustawienia — GeoMeta Asystent")
        okno.attributes("-topmost", True)
        okno.geometry("520x470")
        ramka = ttk.Frame(okno, padding=14)
        ramka.pack(fill="both", expand=True)

        def pole(etykieta, wartosc, ukryte=False):
            ttk.Label(ramka, text=etykieta).pack(anchor="w", pady=(8, 2))
            zm = tk.StringVar(value=str(wartosc))
            ttk.Entry(ramka, textvariable=zm, show="•" if ukryte else "").pack(fill="x")
            return zm

        klucz = pole("Klucz API Anthropic (console.anthropic.com → API Keys):", self.cfg.get("api_key", ""), True)
        ttk.Label(ramka, text="Model:").pack(anchor="w", pady=(8, 2))
        nazwy = {v["nazwa"]: k for k, v in silnik.MODELE.items()}
        model = tk.StringVar(value=silnik.MODELE[self.cfg["model"]]["nazwa"])
        ttk.Combobox(ramka, textvariable=model, values=list(nazwy), state="readonly").pack(fill="x")
        monitor = pole("Numer monitora z grą (1 = główny):", self.cfg.get("monitor", 1))
        url = pole("Adres twojej strony GeoMeta (do synchronizacji, opcjonalnie):", self.cfg.get("sync_url", ""))
        token = pole("Token synchronizacji (z panelu Cloudflare, opcjonalnie):", self.cfg.get("sync_token", ""), True)
        ttk.Label(ramka, text="Gra powinna działać w oknie lub w trybie „pełny ekran w oknie” (borderless),\n"
                              "żeby to okienko było widoczne nad nią.", foreground="#666").pack(anchor="w", pady=10)

        def zapisz():
            self.cfg.update(api_key=klucz.get().strip(), model=nazwy[model.get()], sync_url=url.get().strip().rstrip("/"),
                            sync_token=token.get().strip())
            try:
                self.cfg["monitor"] = max(1, int(monitor.get()))
            except ValueError:
                pass
            silnik.zapisz_ustawienia(self.cfg)
            okno.destroy()
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
