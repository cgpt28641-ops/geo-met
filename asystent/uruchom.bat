@echo off
REM Uruchamia GeoMeta Asystenta. Wszystko (dane, modele, biblioteki) lezy w tym folderze,
REM wiec caly folder mozna przeniesc na dowolny dysk.
cd /d "%~dp0"
set "GEOMETA_DANE=%~dp0dane"
set "HF_HOME=%~dp0modele\hf"
set "EASYOCR_MODULE_PATH=%~dp0modele\easyocr"
if not exist "%~dp0dane" call "%~dp0przenies_dane.bat" cicho
set "PY=python"
if exist "%~dp0biblioteki\Scripts\python.exe" set "PY=%~dp0biblioteki\Scripts\python.exe"
"%PY%" -m pip install --quiet -r requirements.txt
"%PY%" asystent.py
pause
