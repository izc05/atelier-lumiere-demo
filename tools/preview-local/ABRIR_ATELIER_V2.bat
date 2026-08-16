@echo off
setlocal
cd /d "%~dp0"
title Atelier Lumiere - Preview V2

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo No encuentro Node.js en este PC.
  echo Instala o activa Node.js y vuelve a hacer doble clic en este archivo.
  echo.
  pause
  exit /b 1
)

echo.
echo Iniciando Atelier Lumiere V2 + Pueblo P9.8...
echo Se abrira en el navegador. Para cerrar la prueba, vuelve aqui y pulsa Ctrl+C.
echo.
node preview-server.cjs

pause
