@echo off
REM Double-clic avec drag-drop : optimise un GLB (Draco + Meshopt + KTX2).
REM Usage : glisse un .glb sur ce fichier .bat, il sort un .glb-optimized.
cd /d "%~dp0.."
if "%~1"=="" (
  echo Usage : glisse un fichier .glb sur ce fichier
  pause
  exit /b 1
)
node "visite-tools\optimiser-glb.js" "%~1"
pause
