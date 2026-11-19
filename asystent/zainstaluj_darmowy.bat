@echo off
REM Jednorazowa instalacja trybu darmowego (model lokalny). Wymaga Pythona 3.10-3.12 z python.org.
cd /d "%~dp0"
python --version || (echo Zainstaluj Pythona z python.org i zaznacz "Add python.exe to PATH". & pause & exit /b 1)
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
echo.
echo Instaluje PyTorch z obsluga karty NVIDIA (ok. 2,5 GB)...
python -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124
if errorlevel 1 (
  echo Wersja dla karty NVIDIA niedostepna - instaluje wersje na procesor...
  python -m pip install torch torchvision
)
python -m pip install transformers easyocr
python -c "import torch;print('Karta graficzna:', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'brak - model bedzie dzialal na procesorze')"
echo.
echo Gotowe. Uruchamiaj asystenta plikiem uruchom.bat
pause
