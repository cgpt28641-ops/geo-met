@echo off
REM Jednorazowa instalacja trybu darmowego (model lokalny). Wymaga Pythona 3.10-3.12 z python.org.
REM Biblioteki trafiaja do folderu "biblioteki" obok programu (nie na dysk C:).
cd /d "%~dp0"
python --version || (echo Zainstaluj Pythona z python.org i zaznacz "Add python.exe to PATH". & pause & exit /b 1)
if not exist "%~dp0biblioteki\Scripts\python.exe" (
  echo Tworze folder z bibliotekami...
  python -m venv "%~dp0biblioteki"
)
set "PY=%~dp0biblioteki\Scripts\python.exe"
"%PY%" -m pip install --upgrade pip
"%PY%" -m pip install -r requirements.txt
echo.
echo Instaluje PyTorch z obsluga karty NVIDIA (ok. 2,5 GB)...
"%PY%" -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124
if errorlevel 1 (
  echo Wersja dla karty NVIDIA niedostepna - instaluje wersje na procesor...
  "%PY%" -m pip install torch torchvision
)
"%PY%" -m pip install transformers easyocr
"%PY%" -c "import torch;print('Karta graficzna:', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'brak - model bedzie dzialal na procesorze')"
echo.
echo Gotowe. Uruchamiaj asystenta plikiem uruchom.bat
pause
