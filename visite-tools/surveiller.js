#!/usr/bin/env node
/* ==========================================================================
   surveiller.js — MODE SURVEILLANCE « dépose un GLB → la visite se met à jour »
   --------------------------------------------------------------------------
   Usage :
     node visite-tools/surveiller.js

   Laisse tourner cette commande dans un terminal. Elle surveille le dossier
   public/properties/. Dès qu'un .glb est déposé, renommé ou supprimé dans le
   dossier d'une propriété (contenant walls.glb), le manifest.json de cette
   propriété est régénéré automatiquement — SANS toucher aux POV, libellés de
   plan ni cotes déjà réglés dans l'éditeur.

   Workflow :
     1. Lancer :  node visite-tools/surveiller.js
     2. Créer un dossier public/properties/<nom>/ et y déposer les .glb
        (walls.glb obligatoire + les .glb des pièces).
     3. Le manifest.json apparaît/So met à jour tout seul.
     4. Ouvrir viewer.html?property=<nom> → la visite est navigable.
     5. Régler les POV/plan dans l'éditeur (le manifest est préservé).

   Remarque : le rattachement au HUB (agence/ville) se fait, lui, avec
   nouvelle-visite.js --agence … (une seule fois par visite). La surveillance
   ne touche qu'aux manifest.json.

   Aucune dépendance externe : fs.watch natif + anti-rebond.
   ========================================================================== */

'use strict';

const fs   = require('fs');
const path = require('path');
const { genererManifest } = require('./lib/generer-manifest');

const RACINE    = path.resolve(__dirname, '..');
const DIR_PROPS = path.join(RACINE, 'public', 'properties');

if (!fs.existsSync(DIR_PROPS)) {
  console.error(`✖ Introuvable : ${DIR_PROPS}`);
  process.exit(1);
}

/* Anti-rebond : fs.watch émet plusieurs événements par écriture. On regroupe
   les régénérations par propriété sur une courte fenêtre. */
const DELAI_MS = 400;
const enAttente = new Map();   // idProp -> timeout

function estGlb(f) { return typeof f === 'string' && f.toLowerCase().endsWith('.glb'); }

function regenerer(idProp) {
  const dir = path.join(DIR_PROPS, idProp);
  try {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return;
    const res = genererManifest(dir);
    const r = res.resume;
    let ligne = `[${new Date().toLocaleTimeString('fr-FR')}] ✔ ${idProp} : ${r.pieces} pièce(s)`;
    if (r.nouvelles.length) ligne += `  (+${r.nouvelles.join(', ')})`;
    if (r.retirees.length)  ligne += `  (–${r.retirees.join(', ')})`;
    console.log(ligne);
  } catch (e) {
    // walls.glb pas encore là = normal pendant qu'on remplit le dossier : info discrète.
    console.log(`[${new Date().toLocaleTimeString('fr-FR')}] … ${idProp} : ${e.message.split('\n')[0]}`);
  }
}

function planifier(idProp) {
  if (enAttente.has(idProp)) clearTimeout(enAttente.get(idProp));
  enAttente.set(idProp, setTimeout(() => { enAttente.delete(idProp); regenerer(idProp); }, DELAI_MS));
}

/* Surveillance récursive si supportée (Windows/macOS la supportent) ; sinon
   repli sur une surveillance par dossier de propriété. */
let recursifOk = false;
try {
  const w = fs.watch(DIR_PROPS, { recursive: true }, (event, nom) => {
    if (!nom) return;
    const idProp = String(nom).split(path.sep)[0].split('/')[0];
    if (!idProp) return;
    // On ne régénère que si l'événement concerne un .glb (ou un changement de dossier).
    const base = path.basename(String(nom));
    if (estGlb(base) || base === idProp) planifier(idProp);
  });
  recursifOk = true;
  console.log('👁  Surveillance récursive active sur public/properties/');
  w.on('error', () => {});
} catch (_) {
  recursifOk = false;
}

if (!recursifOk) {
  // Repli : surveille chaque sous-dossier existant + le dossier racine pour
  // détecter les nouveaux dossiers.
  const surveilles = new Set();
  function surveillerDossier(idProp) {
    if (surveilles.has(idProp)) return;
    const dir = path.join(DIR_PROPS, idProp);
    try {
      fs.watch(dir, (event, nom) => { if (estGlb(nom)) planifier(idProp); });
      surveilles.add(idProp);
    } catch (_) {}
  }
  fs.readdirSync(DIR_PROPS).forEach(f => {
    try { if (fs.statSync(path.join(DIR_PROPS, f)).isDirectory()) surveillerDossier(f); } catch (_) {}
  });
  fs.watch(DIR_PROPS, (event, nom) => {
    if (!nom) return;
    const dir = path.join(DIR_PROPS, nom);
    try { if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) { surveillerDossier(nom); planifier(nom); } } catch (_) {}
  });
  console.log('👁  Surveillance (par dossier) active sur public/properties/');
}

console.log('   Dépose des .glb dans un dossier de propriété (walls.glb obligatoire).');
console.log('   Ctrl+C pour arrêter.\n');
