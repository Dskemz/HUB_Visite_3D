#!/usr/bin/env node
/* ==========================================================================
   optimiser-glb.js — COMPRESSER un GLB (géométrie Draco + textures KTX2)
   --------------------------------------------------------------------------
   Usage :
     node visite-tools/optimiser-glb.js <fichier.glb | dossier> [...] [options]

   Exemples :
     node visite-tools/optimiser-glb.js public/properties/mon-bien/salon.glb
     node visite-tools/optimiser-glb.js public/properties/mon-bien      (tout le dossier)
     node visite-tools/optimiser-glb.js public/properties/mon-bien --uastc

   Options :
     --uastc          textures en UASTC (qualité max, fichier + lourd)
                      — par défaut ETC1S (plus léger, encodage + rapide).
     --max <px>       borne la plus grande dimension des textures (déf. 2048).

   Chaque <fichier>.glb produit <fichier>-optimized.glb (non destructif).

   Zéro binaire externe, zéro CLI global : l'encodage KTX2 se fait via un
   module WebAssembly installé LOCALEMENT dans visite-tools/ à la 1re
   utilisation (Basis Universal). Fini le « --meshopt/--ktx2 » et le binaire
   « ktx » manquant.
   ========================================================================== */

'use strict';

const fs           = require('fs');
const path         = require('path');
const { execSync } = require('child_process');
const { pathToFileURL } = require('url');

const ICI = __dirname;

/* Dépendances requises par le moteur ESM (optimiser-glb.worker.mjs).
   NB : ktx2-encoder est ESM pur (pas de require) → on teste la PRÉSENCE du
   dossier dans node_modules plutôt que require.resolve (qui échoue dessus). */
const DEPS = [
  '@gltf-transform/core',
  '@gltf-transform/extensions',
  '@gltf-transform/functions',
  'ktx2-encoder',
  'sharp',
  'draco3dgltf',
];

function depsPresentes() {
  return DEPS.every(d => fs.existsSync(path.join(ICI, 'node_modules', d, 'package.json')));
}

function installerDeps() {
  console.log('⏳ Première utilisation : installation des outils d\'optimisation (une fois)…');
  console.log('   (téléchargement d\'environ 30–60 Mo, quelques minutes selon la connexion)\n');
  try {
    execSync('npm install', { cwd: ICI, stdio: 'inherit' });
    console.log('\n✔ Outils installés.\n');
  } catch (e) {
    console.error('\n✖ Échec de l\'installation des dépendances.');
    console.error('  Vérifie que Node et npm sont installés, puis relance.');
    process.exit(1);
  }
}

(async function () {
  if (!depsPresentes()) installerDeps();
  // Le moteur est en ESM (module WASM + top-level await) ; on l'importe ici.
  const worker = pathToFileURL(path.join(ICI, 'optimiser-glb.worker.mjs')).href;
  await import(worker);
})().catch(e => { console.error('✖ Erreur :', e); process.exit(1); });
