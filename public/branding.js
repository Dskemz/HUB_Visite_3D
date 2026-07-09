/* ==========================================================================
   CONFIG CENTRALE DES AGENCES — source unique de vérité
   Pour ajouter une agence : copie un bloc, change les valeurs, 1 seul push.
   navy      = base sombre des panneaux "verre" du viewer (fond de l'interface)
   accent    = couleur des boutons / surbrillances / noms de pièces
   accentDark= variante foncée (survol des boutons)
   ========================================================================== */
(function () {
  window.AGENCIES = {
    'laforet': {
      id: 'laforet',
      name: 'Laforêt',
      tagline: 'Votre visite immersive Laforêt',
      navy: '#0B1B3F', navyRgb: '11,27,63',
      accent: '#0046FE', accentRgb: '0,70,254', accentDark: '#0038cc',
      logo: 'laforet',
      property: 'demo-rambouillet'
    },
    'era': {
      id: 'era',
      name: 'ERA Immobilier',
      tagline: 'Votre visite immersive ERA Immobilier',
      navy: '#3A0E14', navyRgb: '58,14,20',
      accent: '#E2001A', accentRgb: '226,0,26', accentDark: '#B00016',
      logo: 'era',
      property: 'demo-rambouillet'
    },
    'sixieme-avenue': {
      id: 'sixieme-avenue',
      name: 'Sixième Avenue',
      tagline: 'Votre visite immersive Sixième Avenue',
      navy: '#0C2C2B', navyRgb: '12,44,43',
      accent: '#2E7E7C', accentRgb: '46,126,124', accentDark: '#245F5C',
      logo: 'sixieme',
      property: 'demo-rambouillet'
    }
  };

  window.resolveAgency = function () {
    var id = new URLSearchParams(location.search).get('agency') || 'laforet';
    return window.AGENCIES[id] || window.AGENCIES['laforet'];
  };

  /* Marque affichée dans l'en-tête du viewer (fond sombre → texte blanc).
     Placeholders neutres : remplace le <svg> par le vrai logo si tu veux. */
  window.brandLogoHTML = function (A) {
    var marks = {
      era:
        '<svg class="tree" viewBox="0 0 24 24" fill="none">' +
        '<path d="M4 12L12 4l8 8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path d="M6 12v7h12v-7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      sixieme:
        '<svg class="tree" viewBox="0 0 24 24" fill="none">' +
        '<path d="M12 3L3 20h18L12 3z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>' +
        '<path d="M9 14h6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
      laforet:
        '<svg class="tree" viewBox="0 0 24 24" fill="none"><path d="M12 2L4 12h3l-2 4h4l-2 4h10l-2-4h4l-2-4h3L12 2z" fill="currentColor"/><rect x="11" y="18" width="2" height="4" fill="currentColor"/></svg>'
    };
    var label = (A.name || 'Laforêt').toUpperCase();
    return (marks[A.logo] || marks.laforet) + label;
  };
})();
