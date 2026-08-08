/* ==========================================================================
   registre-hub.js — ENREGISTREMENT d'une visite dans le HUB
   --------------------------------------------------------------------------
   Le hub (hub.html) liste les projets par agence puis par ville. Plutôt que
   de modifier par script le fichier de code branding.js (fragile), on tient un
   registre JSON dédié, en AJOUT SEUL : public/properties-index.json.

   Format :
     {
       "<id-agence>": [
         { "id": "<id-propriete>", "name": "Nom affiché", "city": "Ville",
           "page": "index-<agence>.html" }
       ]
     }

   hub.html lit ce fichier et FUSIONNE ces entrées avec les propriétés déjà
   déclarées dans branding.js. branding.js reste la source de vérité du
   branding ; ce registre ne porte QUE le rattachement projet → agence/ville.
   ========================================================================== */

'use strict';

const fs   = require('fs');
const path = require('path');

/**
 * Enregistre (ou met à jour) une propriété dans le registre du hub.
 * @param {string} cheminIndex  Chemin ABSOLU de public/properties-index.json.
 * @param {object} entree
 * @param {string} entree.agence    id de l'agence (clé AGENCIES de branding.js).
 * @param {string} entree.id        id de la propriété (= nom du dossier).
 * @param {string} entree.name      nom affiché dans le hub.
 * @param {string} entree.city      ville de regroupement.
 * @param {string} [entree.page]    page « annonce » (défaut : index-<agence>.html).
 * @returns {{ maj:boolean, action:'ajout'|'mise-a-jour' }}
 */
function enregistrerDansHub(cheminIndex, entree) {
  const { agence, id, name, city } = entree;
  if (!agence) throw new Error('registre-hub : "agence" manquante.');
  if (!id)     throw new Error('registre-hub : "id" de propriété manquant.');

  const page = entree.page || ('index-' + agence + '.html');

  let index = {};
  if (fs.existsSync(cheminIndex)) {
    try { index = JSON.parse(fs.readFileSync(cheminIndex, 'utf8')) || {}; }
    catch (_) { index = {}; }
  }
  if (!Array.isArray(index[agence])) index[agence] = [];

  const liste = index[agence];
  const i = liste.findIndex(p => p && p.id === id);
  const projet = { id, name: name || id, city: city || 'Autres', page };

  let action;
  if (i >= 0) { liste[i] = projet; action = 'mise-a-jour'; }
  else        { liste.push(projet); action = 'ajout'; }

  fs.writeFileSync(cheminIndex, JSON.stringify(index, null, 2) + '\n', 'utf8');
  return { maj: true, action };
}

module.exports = { enregistrerDansHub };
