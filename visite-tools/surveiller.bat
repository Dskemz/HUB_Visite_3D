@echo off
REM Double-clic pour lancer la surveillance des visites 3D.
REM Depose des .glb dans public\properties\<nom>\ (walls.glb obligatoire) :
REM le manifest.json se genere/actualise tout seul. Ctrl+C ou fermer pour arreter.
cd /d "%~dp0.."
node "visite-tools\surveiller.js"
pause
