@echo off
REM Przenosi dotychczasowe dane (rundy, ustawienia) i pobrane modele z dysku C: do tego folderu.
REM Uruchamia sie sam przy pierwszym starcie; mozna tez uruchomic recznie.
cd /d "%~dp0"
if not exist "%~dp0dane" mkdir "%~dp0dane"
if not exist "%~dp0modele\hf\hub" mkdir "%~dp0modele\hf\hub"
if not exist "%~dp0modele\easyocr" mkdir "%~dp0modele\easyocr"
if exist "%APPDATA%\GeoMetaAsystent" (
  echo Przenosze rundy i ustawienia...
  robocopy "%APPDATA%\GeoMetaAsystent" "%~dp0dane" /E /MOVE /NFL /NDL /NJH /NJS /NP >nul
)
if exist "%USERPROFILE%\.cache\huggingface\hub\models--geolocal--StreetCLIP" (
  echo Przenosze model StreetCLIP...
  robocopy "%USERPROFILE%\.cache\huggingface\hub\models--geolocal--StreetCLIP" "%~dp0modele\hf\hub\models--geolocal--StreetCLIP" /E /MOVE /NFL /NDL /NJH /NJS /NP >nul
)
if exist "%USERPROFILE%\.EasyOCR" (
  echo Przenosze modele do czytania napisow...
  robocopy "%USERPROFILE%\.EasyOCR" "%~dp0modele\easyocr" /E /MOVE /NFL /NDL /NJH /NJS /NP >nul
)
if "%1"=="" (
  echo Gotowe. Dane sa w folderze "dane", modele w folderze "modele".
  pause
)
exit /b 0
