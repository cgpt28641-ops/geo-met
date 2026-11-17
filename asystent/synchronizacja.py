"""Wysyłanie rund do prywatnej sekcji strony GeoMeta (Cloudflare Pages Functions + KV)."""
from __future__ import annotations

import base64
import io
import json
import urllib.request

from PIL import Image

import silnik


def _zapytanie(cfg: dict, sciezka: str, dane: dict | None = None) -> dict:
    url = cfg["sync_url"].rstrip("/") + sciezka
    body = json.dumps(dane).encode("utf-8") if dane is not None else None
    req = urllib.request.Request(url, data=body, method="POST" if body else "GET", headers={
        "Authorization": f"Bearer {cfg['sync_token']}",
        "Content-Type": "application/json",
        "User-Agent": "GeoMetaAsystent/1.0",
    })
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8") or "{}")


def test(cfg: dict) -> dict:
    return _zapytanie(cfg, "/api/ping")


def _miniatura(nazwa: str) -> str:
    img = Image.open(silnik.katalog_aplikacji() / "historia" / nazwa).convert("RGB")
    img.thumbnail((960, 960))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=70, optimize=True)
    return base64.standard_b64encode(buf.getvalue()).decode("ascii")


def wyslij_runde(cfg: dict, wpis: dict) -> dict:
    dane = {k: v for k, v in wpis.items() if k != "pliki"}
    dane["obrazy"] = [_miniatura(p) for p in wpis.get("pliki", [])]
    return _zapytanie(cfg, "/api/rundy", dane)
