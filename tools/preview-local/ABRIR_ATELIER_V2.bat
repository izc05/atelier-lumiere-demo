@echo off
setlocal
cd /d "%~dp0"
title Atelier Lumiere - Preview V2 + Pueblo WebGL

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
echo Iniciando Atelier Lumiere V2 + Pueblo WebGL - candidato actual...
echo El lanzador elegira un puerto libre para evitar reutilizar una preview antigua.
echo Para cerrar esta prueba, vuelve aqui y pulsa Ctrl+C.
echo.
node preview-launcher.cjs

pause
