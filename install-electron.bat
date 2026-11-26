@echo off
title WEBRIX - Electron installer
cd /d "%~dp0"
set ELECTRON_SKIP_BINARY_DOWNLOAD=

echo ============================================
echo   WEBRIX - installing Electron manually
echo ============================================
echo.

if not exist "node_modules\electron\package.json" (
  echo [1/4] Installing npm packages...
  call npm install
)
if not exist "node_modules\electron\package.json" (
  echo ERROR: npm install failed. Make sure Node.js is installed.
  pause
  exit /b 1
)

for /f "delims=" %%v in ('node -p "require('./node_modules/electron/package.json').version"') do set EV=%%v
set ARCH=x64
if /i "%PROCESSOR_ARCHITECTURE%"=="ARM64" set ARCH=arm64
set FILE=electron-v%EV%-win32-%ARCH%.zip
echo [2/4] Downloading Electron %EV% (%ARCH%) - about 110MB...
echo.

curl.exe -L --fail -o electron.zip "https://github.com/electron/electron/releases/download/v%EV%/%FILE%"
if errorlevel 1 (
  echo.
  echo GitHub download failed, trying mirror...
  curl.exe -L --fail -o electron.zip "https://npmmirror.com/mirrors/electron/%EV%/%FILE%"
)
if errorlevel 1 (
  echo.
  echo ERROR: Download failed. Check your internet / antivirus and try again.
  pause
  exit /b 1
)

echo.
echo [3/4] Extracting...
if exist "node_modules\electron\dist" rmdir /s /q "node_modules\electron\dist"
powershell -NoProfile -Command "Expand-Archive -Path 'electron.zip' -DestinationPath 'node_modules\electron\dist' -Force"
if not exist "node_modules\electron\dist\electron.exe" (
  echo ERROR: Extraction failed - antivirus may be blocking electron.exe
  pause
  exit /b 1
)
<nul set /p "=electron.exe" > "node_modules\electron\path.txt"
del electron.zip

echo.
echo [4/4] Done! Starting WEBRIX...
echo.
call npm start
pause
