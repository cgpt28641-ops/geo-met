@echo off
REM Uruchamia GeoMeta Asystenta z kodu (wymaga Pythona 3.10+ z python.org)
cd /d "%~dp0"
python -m pip install --quiet -r requirements.txt
python asystent.py
pause
