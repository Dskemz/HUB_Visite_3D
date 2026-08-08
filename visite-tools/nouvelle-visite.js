#!/usr/bin/env node
/* ==========================================================================
   nouvelle-visite.js — CRÉER une visite 3D à partir d'un dossier de GLB
   --------------------------------------------------------------------------
   Usage :
     node visite-tools/nouvelle-visite.js <id-propriete> [options]

   Options :
     --agence <id>     Agence à laquelle rattacher la visite dans le hub
                       (ex. laforet-immo, era…). Sans cette option, la visite
                       fonctionne quand même via son URL, mais n'apparaît pas
                       dans le hub.
     --ville "<ville>" Ville de regroupement dans le hub (défaut : "Autres").
     --nom   "<nom>"   Nom affiché (défaut : dérivé de l'id).

   Ce que fait la commande :
     1. Vérifie public/properties/<id>/ et la présence de walls.glb.
     2. Génère public/properties/<id>/manifest.json (fusion sans perte).
     3. Si --agence : enregistre la visite dans public/properties-index.json
        (elle apparaît alors dans le hub).

   La visite est ensuite accessible :  viewer.html?property=<id>[&agency=<agence>]
   Les POV, libellés de plan et cotes se règlent dans l'éditeur, puis on
   ré-exporte le manifest depuis l'éditeur (ou on relance cette commande :
   le travail de l'éditeur est toujours préservé).
   ========================================================================== */

'use strict';

const fs   = require('fs');
const path = require('path');
const { genererManifest, humaniser } = require('./lib/generer-manifest');
const { enregistrerDansHub }         = require('./lib/registre-hub');

/* Racine du projet = dossier parent de visite-tools/. */
const RACINE       = path.resolve(__dirname, '..');
const DIR_PROPS    = path.join(RACINE, 'public', 'properties');
const CHEMIN_INDEX = path.join(RACINE, 'public', 'properties-index.json');

/* --- Analyse minimale des arguments (sans dépendance) --------------------- */
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--agence' || a === '--ville' || a === '--nom' || a === '--navy' || a === '--accent') {
      out[a.slice(2)] = argv[++i];
    } else if (a.startsWith('--')) {
      out[a.slice(2)] = true;
    } else {
      out._.push(a);
    }
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const id   = args._[0];

  if (!id) {
    console.error('Usage : node visite-tools/nouvelle-visite.js <id-propriete> [--agence <id>] [--ville "<ville>"] [--nom "<nom>"]');
    process.exit(1);
  }

  const dir = path.join(DIR_PROPS, id);
  if (!fs.existsSync(dir)) {
    console.error(`✖ Dossier introuvable : public/properties/${id}/`);
    console.error(`  → Crée-le et dépose-y tes .glb (dont walls.glb) avant de relancer.`);
    process.exit(1);
  }

  let res;
  try {
    res = genererManifest(dir);
  } catch (e) {
    console.error('✖ ' + e.message);
    process.exit(1);
  }

  console.log(`✔ manifest.json ${res.resume.manifestExistait ? 'mis à jour' : 'créé'} — ${res.resume.pieces} pièce(s) détectée(s).`);
  if (res.resume.nouvelles.length) console.log('  + pièces ajoutées : ' + res.resume.nouvelles.join(', '));
  if (res.resume.retirees.length)  console.log('  – pièces retirées : ' + res.resume.retirees.join(', '));

  // Branding PAR BIEN (optionnel) : écrit properties/<id>/branding.json.
  // Le viewer le lit au démarrage et surcharge les couleurs de l'agence.
  if (args.navy || args.accent) {
    const norm = (h) => {
      if (!h) return null;
      h = String(h).trim(); if (h[0] !== '#') h = '#' + h;
      if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(h)) {
        console.error(`✖ Couleur invalide : "${h}" (attendu #RRGGBB).`); process.exit(1);
      }
      return h;
    };
    const hexToRgb = (h) => {
      h = h.replace('#',''); if (h.length === 3) h = h.split('').map(c=>c+c).join('');
      const n = parseInt(h,16); return [(n>>16)&255,(n>>8)&255,n&255].join(',');
    };
    const brand = {};
    const navy = norm(args.navy), accent = norm(args.accent);
    if (navy)   { brand.navy = navy;     brand.navyRgb = hexToRgb(navy); }
    if (accent) { brand.accent = accent; brand.accentRgb = hexToRgb(accent); }
    fs.writeFileSync(path.join(dir, 'branding.json'), JSON.stringify(brand, null, 2) + '\n', 'utf8');
    console.log(`✔ branding.json écrit${navy?` — navy ${navy}`:''}${accent?` — accent ${accent}`:''}.`);
  }

  if (args.agence) {
    const r = enregistrerDansHub(CHEMIN_INDEX, {
      agence: args.agence,
      id,
      name:   args.nom  || humaniser(id),
      city:   args.ville || 'Autres',
    });
    console.log(`✔ Hub : ${r.action === 'ajout' ? 'ajoutée' : 'mise à jour'} sous l'agence « ${args.agence} » (${args.ville || 'Autres'}).`);
  } else {
    console.log('ℹ Non rattachée au hub (aucune --agence). Accessible directement via son URL.');
  }

  const urlAgence = args.agence ? `&agency=${args.agence}` : '';
  console.log(`\n▶ Visite : viewer.html?property=${id}${urlAgence}`);
  console.log(`▶ Éditer : viewer-edit.html?property=${id}${urlAgence}`);
}

main();
