#!/usr/bin/env node
/* ==========================================================================
   optimiser-glb.js — COMPRESSER un GLB (Draco + Meshopt + KTX2)
   --------------------------------------------------------------------------
   Usage :
     node visite-tools/optimiser-glb.js mon-salon.glb

   Ça crache mon-salon-optimized.glb dans le même dossier avec :
     - Compression Draco (géométrie)
     - Optimisation Meshopt (poids)
     - Conversion KTX2 (textures GPU-native)

   La première fois : installe gltf-transform en global, puis compresse.
   Les fois suivantes : utilise la version déjà installée.
   ========================================================================== */

'use strict';

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function main() {
  const glb = process.argv[2];

  if (!glb) {
    console.error('Usage : node visite-tools/optimiser-glb.js <fichier.glb>');
    process.exit(1);
  }

  const cheminAbs = path.resolve(glb);
  if (!fs.existsSync(cheminAbs)) {
    console.error(`✖ Fichier introuvable : ${cheminAbs}`);
    process.exit(1);
  }

  if (!cheminAbs.toLowerCase().endsWith('.glb')) {
    console.error('✖ Le fichier doit être un .glb');
    process.exit(1);
  }

  // Vérifier gltf-transform
  let hasGltfTransform = false;
  try {
    execSync('gltf-transform --version', { stdio: 'ignore', shell: true });
    hasGltfTransform = true;
  } catch (_) {}

  if (!hasGltfTransform) {
    console.log('⏳ Première utilisation : installation de gltf-transform en global...');
    try {
      execSync('npm install -g @gltf-transform/cli', { stdio: 'inherit' });
      console.log('✔ Installation terminée.\n');
    } catch (e) {
      console.error('✖ Erreur lors de l\'installation. Vérifiez que Node et npm sont installés.');
      process.exit(1);
    }
  }

  // Chemins
  const dir = path.dirname(cheminAbs);
  const nom = path.basename(cheminAbs, '.glb');
  const sortie = path.join(dir, nom + '-optimized.glb');

  console.log(`⏳ Compression en cours : ${glb}`);
  console.log(`   Draco + Meshopt + KTX2...`);

  try {
    // Commande gltf-transform : optimize avec draco, meshopt, puis convert en ktx2
    execSync(
      `gltf-transform optimize "${cheminAbs}" "${sortie}" ` +
      `--compress draco --meshopt --ktx2`,
      { stdio: 'inherit', shell: true }
    );

    const taille = fs.statSync(sortie).size;
    console.log(`\n✔ Optimisé : ${sortie}`);
    console.log(`  Poids : ${(taille / 1024 / 1024).toFixed(2)} MB`);
  } catch (e) {
    console.error('\n✖ Erreur lors de la compression. Vérifiez le GLB.');
    process.exit(1);
  }
}

main();
