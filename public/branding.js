/* ==========================================================================
   CONFIG CENTRALE DES AGENCES — source unique de vérité
   Pour ajouter une agence : copie un bloc, change les valeurs, 1 seul push.
   navy/accent = teintes du VIEWER (fond + boutons). site.* = identité de la
   fausse page annonce (nav, footer, agent, téléphone…).
   ========================================================================== */
(function () {
  window.AGENCIES = {
    'laforet': {
      id: 'laforet', name: 'Laforêt',
      navy: '#0B1B3F', navyRgb: '11,27,63',
      accent: '#0046FE', accentRgb: '0,70,254', accentDark: '#0038cc',
      logo: 'laforet', property: 'demo-rambouillet',
      site: {
        nav: ['Acheter', 'Vendre', 'Louer', 'Estimer', 'Gérer'],
        phone: '01 34 57 12 00',
        agency: 'Laforêt Rambouillet',
        agent: 'Adrien Dufay',
        editedBy: "Annonce éditée par l'agence Laforêt Rambouillet",
        footer: 'clean',
        headStyle: 'light'      /* header blanc, texte navy */
      }
    },
    'era': {
      id: 'era', name: 'ERA Immobilier',
      navy: '#3A0E14', navyRgb: '58,14,20',
      accent: '#E2001A', accentRgb: '226,0,26', accentDark: '#B00016',
      logo: 'era', property: 'demo-rambouillet',
      site: {
        nav: ['Acheter', 'Louer', 'Vendre', 'Estimer', 'Nos agences'],
        phone: '01 30 88 40 00',
        agency: 'ERA Immobilier Rambouillet',
        agent: 'Sophie Martin',
        editedBy: "Annonce éditée par l'agence ERA Immobilier Rambouillet",
        footer: 'band',
        headStyle: 'solid'      /* bandeau rouge plein, texte blanc */
      }
    },
    'sixieme-avenue': {
      id: 'sixieme-avenue', name: 'Sixième Avenue',
      navy: '#0C2C2B', navyRgb: '12,44,43',
      accent: '#a1c4c3', accentRgb: '46,126,124', accentDark: '#245F5C',
      logo: 'sixieme', property: 'demo-rambouillet',
      site: {
        nav: ['Acheter', 'Louer', 'Vendre', 'Gestion Locative', "L'agence"],
        phone: '05 56 83 98 02',
        agency: 'Sixième Avenue Arcachon',
        agent: 'Jean-Henri Bodin',
        editedBy: "Annonce éditée par l'agence Sixième Avenue Arcachon",
        footer: 'angled',
        headStyle: 'light'
      }
    }
  };

  window.resolveAgency = function () {
    var id = new URLSearchParams(location.search).get('agency') || 'laforet';
    return window.AGENCIES[id] || window.AGENCIES['laforet'];
  };

  /* Marque (hérite la couleur du parent via currentColor). */
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
