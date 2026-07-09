/* ==========================================================================
   ANNONCE PARTAGÉE — construit une page annonce immobilière brandée.
   Chaque index-[agence].html définit window.AGENCY_ID puis charge ce fichier.
   La mise en page se modifie ICI une seule fois pour toutes les agences.
   ========================================================================== */
(function () {
  var A = (window.AGENCIES && window.AGENCIES[window.AGENCY_ID]) ||
          (window.resolveAgency && window.resolveAgency()) ||
          { id:'laforet', name:'Laforêt', navy:'#0B1B3F', navyRgb:'11,27,63',
            accent:'#0046FE', accentRgb:'0,70,254', accentDark:'#0038cc',
            logo:'laforet', property:'demo-rambouillet' };

  /* ---- données démo de l'annonce (identiques par agence : même bien présenté) ---- */
  var BASE = 'properties/' + (A.property || 'demo-rambouillet') + '/';
  var listing = {
    title: 'Appartement 3 pièces — 68 m²',
    place: '78120 Rambouillet',
    price: '289 000 €',
    ppm: '4 250 €/m²',
    ref: 'VIA-' + (A.id || 'demo').toUpperCase().slice(0, 6),
    rooms: '3', beds: '2', area: '68', floor: '2ᵉ',
    dpe: 'C', ges: 'C',
    photos: [
      { src: BASE + 'Salon_01.png', label: 'Salon' },
      { src: BASE + 'Cuisine_01.png', label: 'Cuisine' },
      { src: BASE + 'Grandechambre_01.png', label: 'Chambre' },
      { src: BASE + 'Salledebain_01.png', label: 'Salle de bain' },
      { src: BASE + 'Balcon_01.png', label: 'Balcon' }
    ]
  };

  var viewerUrl = 'viewer.html?agency=' + encodeURIComponent(A.id) +
                  '&property=' + encodeURIComponent(A.property || 'demo-rambouillet');

  /* ---------- styles ---------- */
  var css = `
  :root{
    --navy:${A.navy}; --navy-rgb:${A.navyRgb};
    --accent:${A.accent}; --accent-rgb:${A.accentRgb}; --accent-dark:${A.accentDark || A.accent};
    --ink:#1c2534; --muted:#616c81; --line:#e7ebf2; --soft:#f5f7fb; --bg:#fff;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Inter',system-ui,-apple-system,sans-serif;color:var(--ink);background:var(--bg);line-height:1.55;-webkit-font-smoothing:antialiased}
  a{color:inherit;text-decoration:none}
  img{display:block;max-width:100%}
  .wrap{max-width:1120px;margin:0 auto;padding:0 1.25rem}

  /* header */
  header.top{border-bottom:1px solid var(--line);position:sticky;top:0;background:rgba(255,255,255,.94);backdrop-filter:blur(10px);z-index:20}
  .top .row{display:flex;align-items:center;justify-content:space-between;height:64px;gap:1rem}
  .brand{display:flex;align-items:center;gap:.5rem;font-weight:800;letter-spacing:.02em;font-size:1.15rem;color:var(--accent)}
  .brand svg{width:26px;height:26px}
  nav.main{display:flex;gap:1.3rem;font-size:.9rem;font-weight:600;color:var(--muted)}
  nav.main a:hover{color:var(--accent)}
  .phone{display:flex;align-items:center;gap:.4rem;font-weight:700;color:var(--navy);font-size:.9rem}
  @media(max-width:860px){nav.main,.phone{display:none}}

  .crumb{font-size:.8rem;color:var(--muted);padding:.9rem 0}
  .crumb a:hover{color:var(--accent)}

  /* layout */
  .grid{display:grid;grid-template-columns:1fr 340px;gap:1.6rem;padding-bottom:3rem;align-items:start}
  @media(max-width:920px){.grid{grid-template-columns:1fr}}

  /* gallery */
  .gallery .main{border-radius:16px;overflow:hidden;aspect-ratio:16/10;background:var(--soft);position:relative}
  .gallery .main img{width:100%;height:100%;object-fit:cover}
  .gallery .badge3d{position:absolute;left:14px;top:14px;background:var(--accent);color:#fff;font-weight:700;font-size:.8rem;padding:.5rem .8rem;border-radius:9px;display:flex;align-items:center;gap:.45rem;box-shadow:0 6px 18px rgba(var(--accent-rgb),.4)}
  .thumbs{display:flex;gap:.6rem;margin-top:.6rem}
  .thumbs button{flex:1;border:2px solid transparent;border-radius:10px;overflow:hidden;cursor:pointer;padding:0;background:none;aspect-ratio:4/3}
  .thumbs button.active{border-color:var(--accent)}
  .thumbs img{width:100%;height:100%;object-fit:cover}

  /* summary */
  .summary{margin-top:1.4rem}
  .summary .price{font-size:1.9rem;font-weight:800;color:var(--navy)}
  .summary .price small{font-size:.9rem;color:var(--muted);font-weight:600;margin-left:.5rem}
  .summary h1{font-size:1.35rem;font-weight:700;margin:.35rem 0 .15rem}
  .summary .loc{color:var(--muted);font-size:.95rem}
  .facts{display:flex;flex-wrap:wrap;gap:.6rem;margin-top:1.1rem}
  .fact{display:flex;align-items:center;gap:.5rem;background:var(--soft);border:1px solid var(--line);border-radius:11px;padding:.6rem .85rem;font-size:.88rem;font-weight:600}
  .fact svg{width:18px;height:18px;color:var(--accent)}

  .section{margin-top:2.2rem}
  .section h2{font-size:1.1rem;font-weight:800;color:var(--navy);margin-bottom:.6rem}
  .section p{color:#39435a}

  /* DPE */
  .energy{display:flex;gap:2rem;flex-wrap:wrap;margin-top:.4rem}
  .energy .col{flex:1;min-width:220px}
  .energy .lbl{font-size:.8rem;color:var(--muted);font-weight:600;margin-bottom:.4rem}
  .scale{display:flex;gap:3px}
  .scale span{flex:1;height:26px;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:.7rem;font-weight:700;color:#fff;background:#c7cede;position:relative}
  .scale span.on{outline:2px solid var(--navy);transform:scale(1.18);z-index:2;background:var(--accent)}

  /* sidebar cards */
  .side{position:sticky;top:84px;display:flex;flex-direction:column;gap:1rem}
  .card3d{border-radius:16px;padding:1.3rem;color:#fff;background:var(--navy);position:relative;overflow:hidden}
  .card3d::after{content:"";position:absolute;inset:0;background:radial-gradient(90% 130% at 100% 0%,rgba(var(--accent-rgb),.4),transparent 60%)}
  .card3d > *{position:relative}
  .card3d .k{font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;font-weight:700;opacity:.85}
  .card3d h3{font-size:1.25rem;font-weight:800;margin:.35rem 0 .3rem}
  .card3d p{font-size:.86rem;opacity:.82;margin-bottom:1rem}
  .btn3d{display:flex;align-items:center;justify-content:center;gap:.5rem;width:100%;background:var(--accent);color:#fff;font-weight:800;font-size:1rem;padding:.9rem;border-radius:12px;transition:transform .15s ease,background .15s ease,box-shadow .15s ease;box-shadow:0 8px 22px rgba(var(--accent-rgb),.4)}
  .btn3d:hover{background:var(--accent-dark);transform:translateY(-2px);box-shadow:0 12px 28px rgba(var(--accent-rgb),.5)}
  .contact{border:1px solid var(--line);border-radius:16px;padding:1.2rem}
  .contact .who{display:flex;align-items:center;gap:.7rem;margin-bottom:.9rem}
  .contact .av{width:44px;height:44px;border-radius:50%;background:var(--soft);display:flex;align-items:center;justify-content:center;color:var(--accent)}
  .contact .who b{display:block}
  .contact .who span{font-size:.8rem;color:var(--muted)}
  .contact .cbtn{display:block;text-align:center;border:1.5px solid var(--accent);color:var(--accent);font-weight:700;border-radius:11px;padding:.7rem;font-size:.9rem}
  .contact .cbtn:hover{background:var(--accent);color:#fff}

  /* footer */
  footer{margin-top:2rem;background:var(--navy);color:#fff;position:relative}
  footer .fclip{height:44px;background:var(--accent);clip-path:polygon(0 0,100% 0,100% 100%,55% 30%,0 100%)}
  footer .fin{padding:2rem 0 2.4rem;display:flex;flex-wrap:wrap;gap:1rem;justify-content:space-between;align-items:center}
  footer .brand{color:#fff}
  footer .fnav{display:flex;gap:1.2rem;font-size:.85rem;opacity:.85}
  footer .fnav a:hover{opacity:1;text-decoration:underline}
  `;

  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  var logo = (window.brandLogoHTML && window.brandLogoHTML(A)) || A.name;

  function facts() {
    var ic = {
      rooms:'<path d="M3 21V9l9-6 9 6v12" stroke="currentColor" stroke-width="1.8" fill="none"/>',
      beds:'<path d="M3 17v-5a2 2 0 012-2h14a2 2 0 012 2v5M3 17h18M6 10V8a2 2 0 012-2h8a2 2 0 012 2v2" stroke="currentColor" stroke-width="1.8" fill="none"/>',
      area:'<path d="M4 4h16v16H4z M4 9h16 M9 4v16" stroke="currentColor" stroke-width="1.8" fill="none"/>',
      floor:'<path d="M4 20h4v-4h4v-4h4V8h4" stroke="currentColor" stroke-width="1.8" fill="none"/>'
    };
    var f = [
      [ic.rooms, listing.rooms + ' pièces'],
      [ic.beds, listing.beds + ' chambres'],
      [ic.area, listing.area + ' m²'],
      [ic.floor, listing.floor + ' étage']
    ];
    return f.map(function (x) {
      return '<div class="fact"><svg viewBox="0 0 24 24">' + x[0] + '</svg>' + x[1] + '</div>';
    }).join('');
  }
  function scale(active) {
    return 'ABCDEFG'.split('').map(function (l) {
      return '<span class="' + (l === active ? 'on' : '') + '">' + l + '</span>';
    }).join('');
  }
  function thumbs() {
    return listing.photos.map(function (p, i) {
      return '<button class="' + (i === 0 ? 'active' : '') + '" data-src="' + p.src + '"><img src="' + p.src + '" alt="' + p.label + '" loading="lazy"></button>';
    }).join('');
  }

  document.body.innerHTML = `
  <header class="top"><div class="wrap"><div class="row">
    <a class="brand" href="index-${A.id}.html">${logo}</a>
    <nav class="main"><a href="#">Acheter</a><a href="#">Louer</a><a href="#">Vendre</a><a href="#">Estimer</a><a href="#">L'agence</a></nav>
    <span class="phone">📞 01 23 45 67 89</span>
  </div></div></header>

  <div class="wrap">
    <div class="crumb"><a href="index-${A.id}.html">Accueil</a> › À vendre › Rambouillet › <b>${listing.ref}</b></div>
    <div class="grid">
      <div class="col-main">
        <div class="gallery">
          <div class="main"><img id="mainph" src="${listing.photos[0].src}" alt="${listing.title}">
            <span class="badge3d">◉ Visite 3D disponible</span>
          </div>
          <div class="thumbs" id="thumbs">${thumbs()}</div>
        </div>

        <div class="summary">
          <div class="price">${listing.price}<small>${listing.ppm}</small></div>
          <h1>${listing.title}</h1>
          <div class="loc">${listing.place} · Réf. ${listing.ref}</div>
          <div class="facts">${facts()}</div>
        </div>

        <div class="section">
          <h2>Description</h2>
          <p>Bel appartement lumineux entièrement rénové, proche commerces et transports. Séjour ouvert sur cuisine équipée, deux chambres, salle de bain moderne et balcon exposé sud. Cave et place de parking. Un bien idéal pour une première acquisition ou un investissement — que vous pouvez d'ores et déjà découvrir en visite virtuelle 3D avant tout déplacement.</p>
        </div>

        <div class="section">
          <h2>Diagnostic de performance énergétique</h2>
          <div class="energy">
            <div class="col"><div class="lbl">Consommation énergétique</div><div class="scale">${scale(listing.dpe)}</div></div>
            <div class="col"><div class="lbl">Émissions de gaz à effet de serre</div><div class="scale">${scale(listing.ges)}</div></div>
          </div>
        </div>
      </div>

      <aside class="side">
        <div class="card3d">
          <div class="k">Nouveau</div>
          <h3>Visite virtuelle 3D</h3>
          <p>Parcourez chaque pièce à 360°, comme si vous y étiez, avant de vous déplacer.</p>
          <a class="btn3d" href="${viewerUrl}">Lancer la visite 3D →</a>
        </div>
        <div class="contact">
          <div class="who"><div class="av">🏠</div><div><b>Agence ${A.name}</b><span>Conseiller dédié</span></div></div>
          <a class="cbtn" href="#">Contacter l'agence</a>
        </div>
      </aside>
    </div>
  </div>

  <footer>
    <div class="fclip"></div>
    <div class="wrap"><div class="fin">
      <a class="brand" href="index-${A.id}.html">${logo}</a>
      <nav class="fnav"><a href="#">Mentions légales</a><a href="#">Données personnelles</a><a href="#">Contact</a></nav>
    </div></div>
  </footer>
  `;

  document.title = listing.title + ' — ' + A.name;

  /* gallery swap */
  var thumbsEl = document.getElementById('thumbs');
  var mainph = document.getElementById('mainph');
  if (thumbsEl) thumbsEl.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    mainph.src = b.getAttribute('data-src');
    [].forEach.call(thumbsEl.querySelectorAll('button'), function (x) { x.classList.remove('active'); });
    b.classList.add('active');
  });
})();
