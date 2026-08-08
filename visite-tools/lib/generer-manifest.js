/* ==========================================================================
   generer-manifest.js — GÉNÉRATION / MISE À JOUR d'un manifest.json de visite
   --------------------------------------------------------------------------
   Rôle : à partir des fichiers .glb présents dans un dossier de propriété
   (public/properties/<id>/), produire un manifest.json valide et directement
   consommable par viewer.html — SANS jamais écraser le travail fait à la main
   dans l'éditeur (POV/camPos, libellés de plan, cotes…).

   Principe de FUSION (idempotent, sans perte) :
     - rooms[]        → recalculées depuis les .glb, mais on PRÉSERVE les
                        libellés (label / labelShort) déjà saisis pour une pièce
                        existante. Nouvelle pièce = ajoutée. .glb supprimé =
                        pièce retirée (signalée).
     - poi[]          → INTACT. Jamais fabriqué de position caméra ici : c'est
                        le rôle de l'éditeur. Une visite neuve démarre poi:[]
                        (navigable en 3D, POV à placer ensuite dans l'éditeur).
     - roomLabels[]   → INTACT (positions sur le plan 2D = travail éditeur).
     - dimensions     → INTACT.
     - name / description → conservés s'ils existent, sinon valeur par défaut.

   Aucune dépendance externe (fs / path natifs). La détection se fait par NOM
   de fichier ; le contenu binaire des .glb n'est jamais lu ni modifié.
   ========================================================================== */

'use strict';

const fs   = require('fs');
const path = require('path');

/* Fichiers .glb qui NE SONT PAS des pièces (enveloppe + plafond). */
const GLB_RESERVES = new Set(['walls.glb', 'plafond.glb']);

/* Dictionnaire de confort : jolis libellés FR pour les noms de pièce usuels.
   Purement cosmétique — tout nom absent retombe sur l'humanisation générique,
   et l'utilisateur peut de toute façon renommer dans l'éditeur. */
const LIBELLES = {
  'salon':          { label: 'Salon' },
  'cuisine':        { label: 'Cuisine' },
  'entree':         { label: 'Entrée' },
  'balcon':         { label: 'Balcon' },
  'terrasse':       { label: 'Terrasse' },
  'garage':         { label: 'Garage' },
  'bureau':         { label: 'Bureau' },
  'couloir':        { label: 'Couloir' },
  'dressing':       { label: 'Dressing' },
  'buanderie':      { label: 'Buanderie' },
  'toilette':       { label: 'Toilette',       labelShort: 'WC' },
  'toilettes':      { label: 'Toilettes',      labelShort: 'WC' },
  'wc':             { label: 'WC',             labelShort: 'WC' },
  'salledebain':    { label: 'Salle de bain',  labelShort: 'SdB' },
  'sallededouche':  { label: 'Salle de douche', labelShort: 'SdD' },
  'grandechambre':  { label: 'Grande chambre', labelShort: 'Gde ch.' },
  'petitechambre':  { label: 'Petite chambre', labelShort: 'Pte ch.' },
  'chambre':        { label: 'Chambre' },
  'chambre1':       { label: 'Chambre 1',      labelShort: 'Ch. 1' },
  'chambre2':       { label: 'Chambre 2',      labelShort: 'Ch. 2' },
  'chambre3':       { label: 'Chambre 3',      labelShort: 'Ch. 3' },
  'sejour':         { label: 'Séjour' },
  'salleamanger':   { label: 'Salle à manger', labelShort: 'SàM' },
};

/* slug : identifiant stable et sûr en URL/JSON (minuscules, sans accents). */
function slug(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // retire les accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/* Humanisation générique : "grande-chambre" / "grande_chambre" → "Grande chambre". */
function humaniser(base) {
  const mots = String(base).replace(/[_-]+/g, ' ').trim().split(/\s+/);
  if (!mots.length) return base;
  mots[0] = mots[0].charAt(0).toUpperCase() + mots[0].slice(1);
  return mots.join(' ');
}

/* Libellé d'une pièce à partir du nom de fichier (sans extension). */
function libellePiece(base) {
  const cle = slug(base).replace(/-/g, '');   // "grande-chambre" → "grandechambre"
  if (LIBELLES[cle]) return { ...LIBELLES[cle] };
  return { label: humaniser(base) };
}

/* Liste les .glb d'un dossier (insensible à la casse), triés. */
function listerGlb(dir) {
  return fs.readdirSync(dir)
    .filter(f => f.toLowerCase().endsWith('.glb'))
    .sort((a, b) => a.localeCompare(b, 'fr'));
}

/* Construit la liste des pièces depuis les .glb, en préservant les libellés
   déjà présents dans le manifest existant (repérage par nom de fichier .glb). */
function construireRooms(glbFiles, ancienRooms) {
  const parGlb = new Map();
  (ancienRooms || []).forEach(r => { if (r && r.glb) parGlb.set(r.glb.toLowerCase(), r); });

  const rooms = [];
  for (const fichier of glbFiles) {
    if (GLB_RESERVES.has(fichier.toLowerCase())) continue;      // walls / plafond
    const base    = fichier.replace(/\.glb$/i, '');
    const existant = parGlb.get(fichier.toLowerCase());

    if (existant) {
      // Pièce déjà connue : on garde tel quel le travail de l'éditeur.
      rooms.push(existant);
    } else {
      const lib = libellePiece(base);
      const room = { id: slug(base), label: lib.label, glb: fichier };
      if (lib.labelShort) room.labelShort = lib.labelShort;
      rooms.push(room);
    }
  }
  return rooms;
}

/* Lecture tolérante d'un manifest existant (retourne {} si absent/illisible). */
function lireManifestExistant(cheminManifest) {
  try {
    const brut = fs.readFileSync(cheminManifest, 'utf8');
    const obj  = JSON.parse(brut);
    return (obj && typeof obj === 'object') ? obj : {};
  } catch (_) {
    return {};
  }
}

/**
 * Génère (ou met à jour) le manifest.json d'une propriété.
 * @param {string} propertyDir  Chemin ABSOLU du dossier de la propriété.
 * @param {object} [opts]
 * @param {boolean} [opts.dryRun]  Si true, n'écrit rien ; retourne juste le résultat.
 * @returns {{ manifest:object, ecrit:boolean, resume:object }}
 */
function genererManifest(propertyDir, opts = {}) {
  const dir = path.resolve(propertyDir);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw new Error(`Dossier introuvable : ${dir}`);
  }

  const glbFiles = listerGlb(dir);
  const aWalls   = glbFiles.some(f => f.toLowerCase() === 'walls.glb');
  if (!aWalls) {
    throw new Error(
      `Aucun "walls.glb" dans ${dir}.\n` +
      `  → Le GLB des murs (enveloppe) est OBLIGATOIRE et doit se nommer exactement "walls.glb".`
    );
  }

  const cheminManifest = path.join(dir, 'manifest.json');
  const ancien = lireManifestExistant(cheminManifest);

  const idProp = path.basename(dir);
  const rooms  = construireRooms(glbFiles, ancien.rooms);

  // Pièces retirées = présentes dans l'ancien manifest mais dont le .glb a disparu.
  const glbBas    = new Set(glbFiles.map(f => f.toLowerCase()));
  const retirees  = (ancien.rooms || [])
    .filter(r => r && r.glb && !glbBas.has(r.glb.toLowerCase()))
    .map(r => r.glb);

  // Fusion NON destructive : on part de l'ancien et on ne remplace que rooms.
  const manifest = {
    name:        ancien.name        || humaniser(idProp),
    description: ancien.description  || `Visite virtuelle 3D — ${humaniser(idProp)}`,
    rooms:       rooms,
    poi:         Array.isArray(ancien.poi)        ? ancien.poi        : [],
    roomLabels:  Array.isArray(ancien.roomLabels) ? ancien.roomLabels : [],
  };
  if (ancien.dimensions && typeof ancien.dimensions === 'object') {
    manifest.dimensions = ancien.dimensions;
  }
  // On reporte toute autre clé personnalisée de l'ancien manifest (robustesse).
  for (const k of Object.keys(ancien)) {
    if (!(k in manifest)) manifest[k] = ancien[k];
  }

  const nouvelles = rooms
    .filter(r => !(ancien.rooms || []).some(a => a && a.glb &&
             a.glb.toLowerCase() === r.glb.toLowerCase()))
    .map(r => r.glb);

  const resume = {
    property:    idProp,
    totalGlb:    glbFiles.length,
    pieces:      rooms.length,
    nouvelles,                    // .glb de pièces nouvellement ajoutées
    retirees,                     // .glb de pièces retirées (disparues du disque)
    manifestExistait: fs.existsSync(cheminManifest),
    poiPreserves:        manifest.poi.length,
    roomLabelsPreserves: manifest.roomLabels.length,
  };

  let ecrit = false;
  if (!opts.dryRun) {
    fs.writeFileSync(cheminManifest, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    ecrit = true;
  }

  return { manifest, ecrit, resume };
}

module.exports = { genererManifest, slug, humaniser, libellePiece, listerGlb };
