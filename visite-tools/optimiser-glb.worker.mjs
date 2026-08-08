/* ==========================================================================
   optimiser-glb.worker.mjs — MOTEUR d'optimisation GLB (Draco + KTX2)
   --------------------------------------------------------------------------
   Appelé par optimiser-glb.js (qui installe les dépendances au préalable).
   NE PAS lancer directement : passe par `node visite-tools/optimiser-glb.js`.

   Ce qu'il fait, pour chaque .glb fourni :
     1. Convertit les textures en KTX2 (GPU-native) via un encodeur WASM pur
        (Basis Universal) — AUCUN binaire externe, aucune install système.
          • Par défaut : ETC1S (fichier plus léger, encodage plus rapide).
          • Option --uastc : UASTC (qualité supérieure, fichier plus lourd).
     2. Compresse la géométrie avec Draco.
     3. Écrit <fichier>-optimized.glb à côté de l'original (non destructif).

   Options (transmises depuis optimiser-glb.js) :
     --uastc          textures en UASTC au lieu d'ETC1S (qualité max, + lourd)
     --max <px>       borne la plus grande dimension des textures (déf. 2048)
     --qualite <1-255> qualité ETC1S (déf. 128 ; ignoré en UASTC)
   ========================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { draco } from '@gltf-transform/functions';
import { ktx2 } from 'ktx2-encoder/gltf-transform';
import sharp from 'sharp';
import draco3d from 'draco3dgltf';

/* --- Analyse des arguments ------------------------------------------------ */
function parseArgs(argv) {
  const out = { fichiers: [], uastc: false, max: 2048, qualite: 128 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--uastc')       out.uastc = true;
    else if (a === '--max')     out.max = parseInt(argv[++i], 10) || 2048;
    else if (a === '--qualite') out.qualite = parseInt(argv[++i], 10) || 128;
    else if (!a.startsWith('--')) out.fichiers.push(a);
  }
  return out;
}

/* --- Résout la liste des .glb à traiter (fichiers et/ou dossiers) --------- */
function resoudreGlb(entrees) {
  const glb = [];
  const estOptim = (f) => /-optimized\.glb$/i.test(f);
  for (const e of entrees) {
    const abs = path.resolve(e);
    if (!fs.existsSync(abs)) { console.error(`✖ Introuvable : ${abs}`); continue; }
    const st = fs.statSync(abs);
    if (st.isDirectory()) {
      fs.readdirSync(abs)
        .filter(f => f.toLowerCase().endsWith('.glb') && !estOptim(f))
        .forEach(f => glb.push(path.join(abs, f)));
    } else if (abs.toLowerCase().endsWith('.glb') && !estOptim(abs)) {
      glb.push(abs);
    } else {
      console.error(`✖ Ignoré (pas un .glb) : ${abs}`);
    }
  }
  return glb;
}

/* --- Décodeur d'image pour l'encodeur KTX2 (obligatoire en Node) ---------- */
function faireImageDecoder(maxDim) {
  return async (buffer) => {
    let img = sharp(buffer).ensureAlpha();
    try {
      const m = await sharp(buffer).metadata();
      if (maxDim && Math.max(m.width || 0, m.height || 0) > maxDim) {
        img = img.resize(maxDim, maxDim, { fit: 'inside' });
      }
    } catch (_) {}
    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
    return { data: new Uint8Array(data), width: info.width, height: info.height };
  };
}

function mo(octets) { return (octets / 1024 / 1024).toFixed(2) + ' Mo'; }

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.fichiers.length) {
    console.error('Usage : node visite-tools/optimiser-glb.js <fichier.glb | dossier> [...] [--uastc] [--max <px>]');
    process.exit(1);
  }

  const cibles = resoudreGlb(opts.fichiers);
  if (!cibles.length) { console.error('✖ Aucun .glb à traiter.'); process.exit(1); }

  const imageDecoder = faireImageDecoder(opts.max);
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'draco3d.decoder': await draco3d.createDecoderModule(),
      'draco3d.encoder': await draco3d.createEncoderModule(),
    });

  const mode = opts.uastc ? 'UASTC (qualité max)' : 'ETC1S (léger)';
  console.log(`\n⚙  Optimisation de ${cibles.length} fichier(s) — textures KTX2 ${mode} + géométrie Draco.`);
  console.log(`   (encodage WASM, ~30–90 s par pièce selon la taille — c'est normal)\n`);

  let ok = 0, ko = 0;
  for (const glb of cibles) {
    const nom    = path.basename(glb);
    const sortie = glb.replace(/\.glb$/i, '') + '-optimized.glb';
    const t0     = Date.now();
    const avant  = fs.statSync(glb).size;
    process.stdout.write(`⏳ ${nom} … `);
    try {
      const doc = await io.read(glb);
      await doc.transform(
        ktx2({
          isUASTC: opts.uastc,
          generateMipmap: true,
          compressionLevel: 2,
          qualityLevel: opts.qualite,
          imageDecoder,
        })
      );
      await doc.transform(draco());
      await io.write(sortie, doc);
      const apres = fs.statSync(sortie).size;
      const gain  = avant > 0 ? Math.round((1 - apres / avant) * 100) : 0;
      const secs  = ((Date.now() - t0) / 1000).toFixed(0);
      console.log(`✔ ${mo(avant)} → ${mo(apres)} (${gain >= 0 ? '−' : '+'}${Math.abs(gain)} %, ${secs} s) → ${path.basename(sortie)}`);
      ok++;
    } catch (e) {
      console.log(`✖ échec : ${e.message}`);
      ko++;
    }
  }

  console.log(`\n✅ Terminé : ${ok} optimisé(s)${ko ? `, ${ko} en échec` : ''}.`);
  console.log(`   Remplace chaque <fichier>.glb par son <fichier>-optimized.glb, puis git push.`);
}

main().catch(e => { console.error('✖ Erreur fatale :', e); process.exit(1); });
