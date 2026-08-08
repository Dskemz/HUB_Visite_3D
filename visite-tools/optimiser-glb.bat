@echo off
REM Glisse un ou plusieurs .glb (ou un dossier) sur ce fichier .bat.
REM Il produit un <fichier>-optimized.glb (geometrie Draco + textures KTX2).
REM 1re utilisation : installe les outils localement (une fois, ~1-3 min).
cd /d "%~dp0.."
if "%~1"=="" (
  echo Usage : glisse un ou plusieurs fichiers .glb ^(ou un dossier^) sur ce .bat
  pause
  exit /b 1
)
node "visite-tools\optimiser-glb.js" %*
pause
