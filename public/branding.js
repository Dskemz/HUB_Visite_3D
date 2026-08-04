/* ==========================================================================
   CONFIG CENTRALE DES AGENCES — source unique de vérité
   Pour ajouter une agence : copie un bloc, change les valeurs, 1 seul push.
   navy/accent = teintes du VIEWER (fond + boutons). site.* = identité de la
   fausse page annonce (nav, footer, agent, téléphone…).
   ========================================================================== */
(function () {
  window.AGENCIES = {
    /* ===== IDENTITÉ NEUTRE DE L'ÉDITEUR (indépendante du hub) =====
       L'éditeur (viewer-edit.html) charge cette identité : gris neutre, aucun
       nom d'agence, logo « V ». hubHidden:true → n'apparaît PAS comme une
       déclinaison dans le hub. C'est la source à partir de laquelle on décline
       ensuite chaque agence — elle ne doit jamais se substituer à une agence. */
    'neutre': {
      id: 'neutre', name: 'Visite 3D', hubHidden: true,
      navy: '#2d2d2d', navyRgb: '45,45,45',
      accent: '#d97757', accentRgb: '217,119,87', accentDark: '#c66641',
      logo: 'laforet', property: 'demo-rambouillet',
      site: {
        nav: ['Acheter', 'Vendre', 'Louer', 'Estimer', 'Gérer'],
        phone: '', agency: 'Visite 3D', agent: '',
        editedBy: 'Aperçu éditeur', footer: 'clean', headStyle: 'light'
      }
    },

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
      accent: '#2E7E7C', accentRgb: '46,126,124', accentDark: '#245F5C',
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
    },

    /* ===================== NOUVELLES AGENCES =====================
       Couleurs relevees a la pipette sur les vraies captures :
       header, boutons d'action, pied de page. */

    'jmc': {
      id: 'jmc', name: 'JMC Immobilier',
      navy: '#2E3126', navyRgb: '46,49,38',
      accent: '#787F52', accentRgb: '120,127,82', accentDark: '#5D6340',
      logo: 'jmc', property: 'demo-rambouillet',
      site: {
        nav: ['Equipe', 'Maisons', 'Appartements', 'Terrains', 'Locations', 'Estimation'],
        phone: '01 30 88 70 75',
        agency: 'JMC Immobilier - Agence Immobiliere Rambouillet',
        agent: 'Jean-Francois Jardel',
        editedBy: "Annonce editee par JMC Immobilier Rambouillet",
        footer: 'clean', headStyle: 'light'
      }
    },
    'guy-hoquet': {
      id: 'guy-hoquet', name: 'Guy Hoquet',
      navy: '#000033', navyRgb: '0,0,51',
      accent: '#E94E24', accentRgb: '233,78,36', accentDark: '#C23A15',
      logo: 'guyhoquet', property: 'demo-rambouillet',
      site: {
        nav: ['Acheter', 'Louer', 'Vendre', 'Investir', 'Estimer'],
        phone: '01 34 83 12 12',
        agency: 'Guy Hoquet Rambouillet',
        agent: 'Karim Belaid',
        editedBy: "Annonce editee par l'agence Guy Hoquet Rambouillet",
        footer: 'band', headStyle: 'solid'
      }
    },
    'citya-royale': {
      id: 'citya-royale', name: 'Citya Royale',
      navy: '#1B1D56', navyRgb: '27,29,86',
      accent: '#1C5DEB', accentRgb: '28,93,235', accentDark: '#1447B8',
      logo: 'citya', property: 'demo-rambouillet',
      site: {
        nav: ['Achat', 'Location', 'Investissement', 'Vente', 'Estimation', 'Gestion', 'Syndic'],
        phone: '01 34 85 44 00',
        agency: 'Citya Royale Immobilier - Rambouillet',
        agent: 'Camille Rousset',
        editedBy: "Annonce editee par Citya Royale Immobilier",
        footer: 'band', headStyle: 'light'
      }
    },
    'themeis': {
      id: 'themeis', name: 'Themeis Immobilier',
      navy: '#182844', navyRgb: '24,40,68',
      accent: '#104078', accentRgb: '16,64,120', accentDark: '#0B2F5A',
      logo: 'themeis', property: 'demo-rambouillet',
      site: {
        nav: ['Accueil', 'Location', 'Achat', 'Gestion', 'Equipe', 'Estimer', 'Vendre', 'Contact'],
        phone: '01 34 57 22 40',
        agency: 'Themeis Immobilier - Rambouillet',
        agent: 'Lena Delaunay',
        editedBy: "Annonce editee par Themeis Immobilier",
        footer: 'band', headStyle: 'solid'
      }
    },
    'blb': {
      id: 'blb', name: 'BLB Immobilier',
      navy: '#152A4E', navyRgb: '21,42,78',
      accent: '#2E7BC4', accentRgb: '46,123,196', accentDark: '#215C96',
      logo: 'blb', property: 'demo-rambouillet',
      site: {
        nav: ['Accueil', 'Ventes', 'Estimation', 'Locations', 'Gestion', 'Syndic', 'Contact'],
        phone: '04 67 68 27 16',
        agency: 'BLB Immobilier Temic',
        agent: 'Benjamin Murgis',
        editedBy: "Annonce editee par BLB Immobilier Temic",
        footer: 'clean', headStyle: 'solid'
      }
    },
    'nestenn': {
      id: 'nestenn', name: 'Nestenn',
      navy: '#204858', navyRgb: '32,72,88',
      accent: '#00A8B8', accentRgb: '0,168,184', accentDark: '#00808C',
      logo: 'nestenn', property: 'demo-rambouillet',
      site: {
        nav: ['Acheter', 'Louer', 'Vendre', 'Estimer', 'Nos agences'],
        phone: '02 37 83 83 83',
        agency: 'Agence Nestenn Rambouillet',
        agent: 'Julie Perrin',
        editedBy: "Annonce editee par l'agence Nestenn",
        footer: 'clean', headStyle: 'light'
      }
    },
    'toulzac-nowak': {
      id: 'toulzac-nowak', name: 'Toulzac & Nowak',
      navy: '#1E3A46', navyRgb: '30,58,70',
      accent: '#4E7C86', accentRgb: '78,124,134', accentDark: '#3A5F68',
      logo: 'toulzac', property: 'demo-rambouillet',
      site: {
        nav: ['Accueil', 'Acheter', 'Vendre', 'A propos', 'Actualites'],
        phone: '06 52 24 35 27',
        agency: 'Toulzac & Nowak - Agence immobiliere independante',
        agent: 'Maryll Nowak',
        editedBy: "Annonce editee par Toulzac & Nowak",
        footer: 'clean', headStyle: 'light'
      }
    },
    'the-door-man': {
      id: 'the-door-man', name: 'The Door Man',
      navy: '#00305F', navyRgb: '0,48,95',
      accent: '#B0913F', accentRgb: '176,145,63', accentDark: '#8C722F',
      logo: 'doorman', property: 'demo-rambouillet',
      site: {
        nav: ['Acheter', 'Vendre', 'Estimer', 'Nos conseillers', 'Actualites'],
        phone: '06 67 15 48 98',
        agency: 'The Door Man - Concession Rambouillet',
        agent: 'Marine Acquedil',
        editedBy: "Annonce editee par The Door Man",
        footer: 'band', headStyle: 'solid'
      }
    },
    'foncia-mansart': {
      id: 'foncia-mansart', name: 'Foncia Mansart',
      navy: '#0E3E42', navyRgb: '14,62,66',
      accent: '#2FB5B5', accentRgb: '47,181,181', accentDark: '#238E8E',
      logo: 'foncia', property: 'demo-rambouillet',
      site: {
        nav: ['Acheter', 'Louer', 'Vendre', 'Gestion locative', 'Syndic', 'Actualites'],
        phone: '01 34 57 88 00',
        agency: 'Foncia Mansart - Transaction Rambouillet',
        agent: 'Elodie Cazaux',
        editedBy: "Annonce editee par Foncia Mansart",
        footer: 'clean', headStyle: 'light'
      }
    },
    'aab-immo': {
      id: 'aab-immo', name: 'AAB Immobilier',
      navy: '#2B2721', navyRgb: '43,39,33',
      accent: '#B08D57', accentRgb: '176,141,87', accentDark: '#8E7044',
      logo: 'aab', property: 'demo-rambouillet',
      site: {
        nav: ['Vente', 'Vendu', 'Location', 'Estimation', 'Contact'],
        phone: '05 61 88 12 43',
        agency: 'AAB Immobilier - Jean-Marc Heuzel',
        agent: 'Jean-Marc Heuzel',
        editedBy: "Annonce editee par AAB Immobilier",
        footer: 'clean', headStyle: 'light'
      }
    }
  };

  window.resolveAgency = function () {
    var id = new URLSearchParams(location.search).get('agency') || window.AGENCY_ID || 'laforet';
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
        '<svg class="tree" viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="16" height="16" fill="currentColor" rx="2"/><text x="12" y="17" font-size="12" font-weight="bold" fill="#2d2d2d" text-anchor="middle" font-family="system-ui">V</text></svg>',

      /* --- Nouvelles enseignes ---
         Marques SVG ABSTRAITES : elles évoquent l'identité de chaque enseigne
         sans reproduire le logo déposé. Suffisant pour une maquette de
         démarchage présentée à l'agence elle-même. */

      /* JMC — monogramme anguleux (J + M) */
      jmc:
        '<svg class="tree" viewBox="0 0 24 24" fill="none">' +
        '<path d="M4 4v11a4 4 0 0 0 4 4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>' +
        '<path d="M12 20V7l4 6 4-6v13" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',

      /* Guy Hoquet — toit + losange */
      guyhoquet:
        '<svg class="tree" viewBox="0 0 24 24" fill="none">' +
        '<path d="M3 11L12 3l9 8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path d="M12 11l6 5-6 5-6-5 6-5z" fill="currentColor"/></svg>',

      /* Citya — écusson */
      citya:
        '<svg class="tree" viewBox="0 0 24 24" fill="none">' +
        '<path d="M12 2l8 3v7c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V5l8-3z" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M8 11h8M12 11v5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',

      /* Themeis — carré à ouverture circulaire */
      themeis:
        '<svg class="tree" viewBox="0 0 24 24" fill="none">' +
        '<rect x="3" y="3" width="18" height="18" rx="3" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M12 3v4M12 17v4" stroke="currentColor" stroke-width="2"/></svg>',

      /* BLB — écusson maison */
      blb:
        '<svg class="tree" viewBox="0 0 24 24" fill="none">' +
        '<path d="M4 4h16v12l-8 5-8-5V4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>' +
        '<path d="M8 14l4-5 4 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',

      /* Nestenn — « N » fléché */
      nestenn:
        '<svg class="tree" viewBox="0 0 24 24" fill="none">' +
        '<path d="M4 20V5l16 14V4" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',

      /* Toulzac & Nowak — monogramme encadré */
      toulzac:
        '<svg class="tree" viewBox="0 0 24 24" fill="none">' +
        '<rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
        '<path d="M8 17V7l8 10V7" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',

      /* The Door Man — porte */
      doorman:
        '<svg class="tree" viewBox="0 0 24 24" fill="none">' +
        '<rect x="5" y="3" width="14" height="18" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<circle cx="15.4" cy="12" r="1.3" fill="currentColor"/></svg>',

      /* Foncia — blocs empilés */
      foncia:
        '<svg class="tree" viewBox="0 0 24 24" fill="none">' +
        '<rect x="3" y="12" width="5" height="9" fill="currentColor"/>' +
        '<rect x="9.5" y="7" width="5" height="14" fill="currentColor" opacity=".72"/>' +
        '<rect x="16" y="3" width="5" height="18" fill="currentColor" opacity=".45"/></svg>',

      /* AAB — « A » sérif */
      aab:
        '<svg class="tree" viewBox="0 0 24 24" fill="none">' +
        '<path d="M4 20L12 4l8 16" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path d="M7.5 14h9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
    };
    var label = (A.name || 'Laforêt').toUpperCase();
    return (marks[A.logo] || marks.laforet) + label;
  };
})();
