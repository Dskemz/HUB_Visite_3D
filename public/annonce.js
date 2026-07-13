/* ==========================================================================
   ANNONCE IMMOBILIERE PARTAGEE — reproduit une vraie fiche bien (carrousel,
   caracteristiques, DPE/GES, quartier, simulation de credit, contact).
   Chaque index-[agence].html definit window.AGENCY_ID puis charge ce fichier.
   Les differences d'identite (nav, footer, agent, couleurs) viennent de branding.js.
   ========================================================================== */
(function () {
  var A = (window.AGENCIES && window.AGENCIES[window.AGENCY_ID]) ||
          (window.resolveAgency && window.resolveAgency()) ||
          { id:'laforet', name:'Laforêt', navy:'#0B1B3F', navyRgb:'11,27,63',
            accent:'#0046FE', accentRgb:'0,70,254', accentDark:'#0038cc',
            logo:'laforet', property:'demo-rambouillet', site:{} };
  var S = A.site || {};

  var BASE = 'properties/' + (A.property || 'demo-rambouillet') + '/';
  var L = {
    kind: 'Appartement', rooms: '3', beds: '2', area: '68',
    title: 'Appartement À vendre 3 pièces - 68 m²',
    place: '78120 RAMBOUILLET',
    price: 289000, ppm: '4 250 €/m²',
    ref: (A.id || 'demo').toUpperCase().slice(0, 3) + '-2048',
    floor: '2ᵉ', taxe: '928 €', dpe: 'C', ges: 'C',
    photos: [
      { src: BASE + 'Salon_01.png', label: 'Salon' },
      { src: BASE + 'Cuisine_01.png', label: 'Cuisine' },
      { src: BASE + 'Grandechambre_01.png', label: 'Chambre' },
      { src: BASE + 'Salledebain_01.png', label: 'Salle de bain' },
      { src: BASE + 'Balcon_01.png', label: 'Balcon' },
      { src: BASE + 'Petitechambre_01.png', label: 'Chambre 2' }
    ]
  };
  var viewerUrl = 'viewer.html?agency=' + encodeURIComponent(A.id) +
                  '&property=' + encodeURIComponent(A.property || 'demo-rambouillet');
  var headLight = (S.headStyle !== 'solid');

  var css = `
  :root{
    --navy:${A.navy}; --navy-rgb:${A.navyRgb};
    --accent:${A.accent}; --accent-rgb:${A.accentRgb}; --accent-dark:${A.accentDark || A.accent};
    --ink:#20293a; --muted:#66718a; --line:#e6eaf1; --soft:#f4f6fa; --bg:#fff;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Inter',system-ui,-apple-system,sans-serif;color:var(--ink);background:var(--bg);line-height:1.55;-webkit-font-smoothing:antialiased}
  a{color:inherit;text-decoration:none} img{display:block;max-width:100%}
  .wrap{max-width:1140px;margin:0 auto;padding:0 1.25rem}
  .btn{cursor:pointer;border:none;font-family:inherit}

  header.top{position:sticky;top:0;z-index:30;border-bottom:1px solid ${headLight ? 'var(--line)' : 'transparent'};
    background:${headLight ? 'rgba(255,255,255,.96)' : 'var(--accent)'};backdrop-filter:blur(10px);
    color:${headLight ? 'var(--ink)' : '#fff'}}
  .top .row{display:flex;align-items:center;justify-content:space-between;height:66px;gap:1rem;flex-wrap:nowrap;min-width:0}
  .brand{display:flex;align-items:center;gap:.5rem;font-weight:800;letter-spacing:.02em;font-size:1.15rem;white-space:nowrap;color:${headLight ? 'var(--accent)' : '#fff'}}
  .brand svg{width:27px;height:27px;flex:0 0 auto}
  nav.main{display:flex;gap:1.35rem;font-size:.9rem;font-weight:600;color:${headLight ? 'var(--muted)' : 'rgba(255,255,255,.9)'}}
  nav.main a{padding:.2rem 0;border-bottom:2px solid transparent}
  nav.main a:hover{color:${headLight ? 'var(--accent)' : '#fff'};border-color:currentColor}
  .top .tools{display:flex;align-items:center;gap:.9rem;font-weight:700;font-size:.9rem;white-space:nowrap;flex:0 0 auto}
  @media(max-width:900px){nav.main{display:none}}
  @media(max-width:520px){.brand{font-size:1rem}.top .tools{font-size:.8rem;gap:.6rem}}

  .hero{position:relative;margin-top:1rem;border-radius:14px;overflow:hidden;background:#000;aspect-ratio:16/8}
  .hero .slide{position:absolute;inset:0;opacity:0;transition:opacity .4s ease}
  .hero .slide.on{opacity:1}
  .hero .slide img{width:100%;height:100%;object-fit:cover}
  .hero .nv{position:absolute;top:50%;transform:translateY(-50%);width:44px;height:44px;border-radius:50%;background:rgba(0,0,0,.45);color:#fff;font-size:1.3rem;display:flex;align-items:center;justify-content:center}
  .hero .nv:hover{background:rgba(0,0,0,.7)}
  .hero .prev{left:14px} .hero .next{right:14px}
  .hero .dots{position:absolute;bottom:14px;left:50%;transform:translateX(-50%);display:flex;gap:7px}
  .hero .dots i{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.55);cursor:pointer}
  .hero .dots i.on{background:#fff;width:20px;border-radius:5px}
  .hero .count{position:absolute;bottom:14px;right:16px;background:rgba(0,0,0,.55);color:#fff;font-size:.78rem;font-weight:600;padding:.3rem .6rem;border-radius:7px}
  .hero .tag3d{position:absolute;top:14px;left:14px;background:var(--accent);color:#fff;font-weight:700;font-size:.82rem;padding:.5rem .85rem;border-radius:9px;display:flex;gap:.45rem;align-items:center;box-shadow:0 6px 18px rgba(var(--accent-rgb),.45)}

  .band{background:var(--soft);border:1px solid var(--line);border-radius:14px;margin-top:1rem;padding:1.2rem 1.4rem;display:flex;justify-content:space-between;flex-wrap:wrap;gap:1rem}
  .band .price{font-size:1.7rem;font-weight:800;color:var(--navy)}
  .band .price small{font-size:.85rem;color:var(--muted);font-weight:600;margin-left:.5rem}
  .band h1{font-size:1.15rem;font-weight:700;margin:.15rem 0}
  .band .loc{color:var(--muted);font-size:.92rem}
  .band .right{text-align:right;font-size:.82rem;color:var(--muted);min-width:180px}
  .band .right b{color:var(--ink)}
  @media(max-width:640px){.band .right{text-align:left}}

  .grid{display:grid;grid-template-columns:1fr 350px;gap:1.6rem;padding:1.6rem 0 3rem;align-items:start}
  @media(max-width:940px){.grid{grid-template-columns:1fr}}
  .sec{margin-bottom:2rem}
  .sec h2{font-size:1.12rem;font-weight:800;color:var(--navy);margin-bottom:.7rem;padding-bottom:.4rem;border-bottom:2px solid var(--accent);display:inline-block}
  .sec p{color:#3c465c}

  .chips{display:flex;flex-wrap:wrap;gap:.6rem}
  .chip{display:flex;align-items:center;gap:.5rem;background:var(--soft);border:1px solid var(--line);border-radius:11px;padding:.65rem .9rem;font-size:.88rem;font-weight:600}
  .chip svg{width:19px;height:19px;color:var(--accent)}

  .two{display:grid;grid-template-columns:1fr 1fr;gap:1.4rem}
  @media(max-width:560px){.two{grid-template-columns:1fr}}
  .kv{display:flex;justify-content:space-between;padding:.5rem 0;border-bottom:1px dashed var(--line);font-size:.9rem}
  .kv b{color:var(--navy)}
  .subh{font-weight:700;color:var(--navy);margin-bottom:.4rem;font-size:.95rem}

  .energy{display:flex;gap:2rem;flex-wrap:wrap}
  .energy .col{flex:1;min-width:230px}
  .energy .lbl{font-size:.8rem;color:var(--muted);font-weight:600;margin-bottom:.4rem}
  .scale{display:flex;gap:3px}
  .scale span{flex:1;height:26px;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:.7rem;font-weight:700;color:#fff;background:#c7cede}
  .scale span.on{outline:2px solid var(--navy);transform:scale(1.18);z-index:2;background:var(--accent)}

  .map{border-radius:12px;overflow:hidden;border:1px solid var(--line);height:220px;position:relative;background:linear-gradient(135deg,#e9eef6,#dce6f1)}
  .map .gl{position:absolute;inset:0;background-image:linear-gradient(rgba(var(--navy-rgb),.06) 1px,transparent 1px),linear-gradient(90deg,rgba(var(--navy-rgb),.06) 1px,transparent 1px);background-size:34px 34px}
  .map .pin{position:absolute;left:50%;top:42%;transform:translate(-50%,-100%);color:var(--accent);font-size:2rem;filter:drop-shadow(0 3px 3px rgba(0,0,0,.25))}
  .map .qbtn{position:absolute;left:50%;top:56%;transform:translate(-50%,-50%);background:var(--navy);color:#fff;font-weight:700;font-size:.85rem;padding:.6rem 1rem;border-radius:9px}

  .credit{display:grid;grid-template-columns:1fr 1fr;gap:1.2rem;align-items:center}
  @media(max-width:560px){.credit{grid-template-columns:1fr}}
  .credit label{display:block;font-size:.8rem;color:var(--muted);font-weight:600;margin:.6rem 0 .25rem}
  .credit input{width:100%;border:1px solid var(--line);border-radius:9px;padding:.6rem .7rem;font-size:.95rem;font-family:inherit}
  .credit .res{background:var(--navy);color:#fff;border-radius:14px;padding:1.4rem;text-align:center}
  .credit .res .m{font-size:1.9rem;font-weight:800}
  .credit .res small{opacity:.8;font-size:.78rem;display:block;margin-top:.4rem}

  .side{position:sticky;top:86px;display:flex;flex-direction:column;gap:1rem}
  .v3d{border-radius:16px;padding:1.3rem;color:#fff;background:var(--navy);position:relative;overflow:hidden}
  .v3d::after{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(90% 130% at 100% 0%,rgba(var(--accent-rgb),.45),transparent 60%)}
  .v3d > *{position:relative}
  .v3d .k{font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;font-weight:700;opacity:.85}
  .v3d h3{font-size:1.25rem;font-weight:800;margin:.35rem 0 .3rem}
  .v3d p{font-size:.85rem;opacity:.82;margin-bottom:1rem}
  .btn3d{display:flex;align-items:center;justify-content:center;gap:.5rem;width:100%;background:var(--accent);color:#fff;font-weight:800;font-size:1rem;padding:.9rem;border-radius:12px;box-shadow:0 8px 22px rgba(var(--accent-rgb),.4);transition:transform .15s,background .15s}
  .btn3d:hover{background:var(--accent-dark);transform:translateY(-2px)}

  .lead{border:1px solid var(--line);border-radius:16px;padding:1.2rem}
  .lead h4{font-size:1rem;font-weight:800;color:var(--navy);margin-bottom:.9rem}
  .lead .who{display:flex;align-items:center;gap:.7rem;margin-bottom:1rem}
  .lead .av{width:46px;height:46px;border-radius:50%;background:var(--soft);display:flex;align-items:center;justify-content:center;color:var(--accent);font-weight:800}
  .lead .who b{display:block;font-size:.92rem}.lead .who span{font-size:.78rem;color:var(--muted)}
  .lead .f2{display:grid;grid-template-columns:1fr 1fr;gap:.5rem}
  .lead input,.lead textarea{width:100%;border:1px solid var(--line);border-radius:9px;padding:.6rem;font-size:.88rem;font-family:inherit;margin-bottom:.5rem}
  .lead textarea{resize:vertical;min-height:70px}
  .lead .send{width:100%;background:var(--accent);color:#fff;font-weight:800;padding:.8rem;border-radius:11px;font-size:.95rem}
  .lead .send:hover{background:var(--accent-dark)}
  .lead .cgu{font-size:.68rem;color:var(--muted);margin-top:.5rem}

  footer .fclip{height:46px;background:var(--accent);clip-path:polygon(0 0,100% 0,100% 100%,55% 34%,0 100%)}
  footer .body{background:var(--navy);color:#fff;padding:2.4rem 0 2.6rem}
  footer.band .body{background:var(--accent)}
  footer .fin{display:flex;flex-wrap:wrap;gap:1.4rem;justify-content:space-between;align-items:center}
  footer .brand{color:#fff}
  footer .socials{display:flex;gap:.7rem}
  footer .socials a{width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.14);display:flex;align-items:center;justify-content:center;font-size:.85rem;font-weight:700}
  footer .socials a:hover{background:rgba(255,255,255,.3)}
  footer .fnav{display:flex;gap:1.2rem;font-size:.82rem;opacity:.85;flex-wrap:wrap}
  footer .fnav a:hover{text-decoration:underline}
  `;

  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  var logo = (window.brandLogoHTML && window.brandLogoHTML(A)) || A.name;

  function euro(n){ return n.toLocaleString('fr-FR') + ' €'; }
  function nav(){ return (S.nav || ['Acheter','Louer','Vendre',"L'agence"]).map(function(x){return '<a href="#">'+x+'</a>';}).join(''); }
  function chips(){
    var ic={
      k:'<path d="M3 21V9l9-6 9 6v12" stroke="currentColor" stroke-width="1.8" fill="none"/>',
      b:'<path d="M3 17v-5a2 2 0 012-2h14a2 2 0 012 2v5M3 17h18M6 10V8a2 2 0 012-2h8a2 2 0 012 2v2" stroke="currentColor" stroke-width="1.8" fill="none"/>',
      a:'<path d="M4 4h16v16H4z M4 9h16 M9 4v16" stroke="currentColor" stroke-width="1.8" fill="none"/>',
      f:'<path d="M4 20h4v-4h4v-4h4V8h4" stroke="currentColor" stroke-width="1.8" fill="none"/>',
      c:'<path d="M3 10h18v9H3z M7 10V6h10v4" stroke="currentColor" stroke-width="1.8" fill="none"/>',
      p:'<path d="M6 20V5h6a4 4 0 010 8H6" stroke="currentColor" stroke-width="1.8" fill="none"/>'
    };
    var f=[[ic.k,L.rooms+' pièces'],[ic.b,L.beds+' chambres'],[ic.a,L.area+' m²'],[ic.f,L.floor+' étage'],[ic.c,'1 cave'],[ic.p,'Parking']];
    return f.map(function(x){return '<div class="chip"><svg viewBox="0 0 24 24">'+x[0]+'</svg>'+x[1]+'</div>';}).join('');
  }
  function scale(active){ return 'ABCDEFG'.split('').map(function(l){return '<span class="'+(l===active?'on':'')+'">'+l+'</span>';}).join(''); }
  function slides(){ return L.photos.map(function(p,i){return '<div class="slide '+(i===0?'on':'')+'"><img src="'+p.src+'" alt="'+p.label+'" '+(i>0?'loading="lazy"':'')+'></div>';}).join(''); }
  function dots(){ return L.photos.map(function(p,i){return '<i class="'+(i===0?'on':'')+'" data-i="'+i+'"></i>';}).join(''); }
  function initials(name){ return (name||'A').split(' ').map(function(w){return w[0];}).join('').slice(0,2); }
  function footer(){
    var socials='<div class="socials"><a href="#">f</a><a href="#">in</a><a href="#">▶</a><a href="#">◎</a></div>';
    var fnav='<nav class="fnav"><a href="#">Mentions légales</a><a href="#">Données personnelles</a><a href="#">Cookies</a><a href="#">Contact</a></nav>';
    var kind=S.footer||'clean';
    var clip=(kind==='angled')?'<div class="fclip"></div>':'';
    return '<footer class="'+kind+'">'+clip+'<div class="body"><div class="wrap"><div class="fin">'+
           '<a class="brand" href="index-'+A.id+'.html">'+logo+'</a>'+socials+fnav+
           '</div></div></div></footer>';
  }

  document.body.innerHTML = `
  <header class="top"><div class="wrap"><div class="row">
    <a class="brand" href="index-${A.id}.html">${logo}</a>
    <nav class="main">${nav()}</nav>
    <div class="tools"><span>📞 ${S.phone || '01 23 45 67 89'}</span><span>🔍</span></div>
  </div></div></header>

  <div class="wrap">
    <div class="hero">
      ${slides()}
      <button class="nv prev" id="pv">‹</button>
      <button class="nv next" id="nx">›</button>
      <span class="tag3d">◉ Visite 3D</span>
      <div class="dots" id="dots">${dots()}</div>
      <span class="count" id="count">1 / ${L.photos.length}</span>
    </div>

    <div class="band">
      <div>
        <div class="price">${euro(L.price)} <small>${L.ppm}</small></div>
        <h1>${L.title}</h1>
        <div class="loc">${L.place}</div>
      </div>
      <div class="right">Référence : <b>${L.ref}</b><br>${S.editedBy || ''}</div>
    </div>

    <div class="grid">
      <div class="main-col">
        <div class="sec"><h2>Description</h2>
          <p>Au cœur de Rambouillet, bel appartement de ${L.area} m² entièrement rénové, lumineux et traversant. Séjour ouvert sur cuisine équipée, ${L.beds} chambres, salle de bain moderne et balcon exposé sud. Cave et place de parking. Proche commerces, écoles et gare. Un bien que vous pouvez découvrir dès maintenant en <b>visite virtuelle 3D</b>, pièce par pièce, avant tout déplacement.</p>
        </div>

        <div class="sec"><h2>Caractéristiques</h2><div class="chips">${chips()}</div></div>

        <div class="sec"><h2>Informations</h2>
          <div class="two">
            <div><div class="subh">Général</div>
              <div class="kv"><span>Type de bien</span><b>${L.kind}</b></div>
              <div class="kv"><span>Surface</span><b>${L.area} m²</b></div>
              <div class="kv"><span>Pièces</span><b>${L.rooms}</b></div>
              <div class="kv"><span>Étage</span><b>${L.floor}</b></div>
            </div>
            <div><div class="subh">Aspects financiers</div>
              <div class="kv"><span>Prix de vente</span><b>${euro(L.price)}</b></div>
              <div class="kv"><span>Prix / m²</span><b>${L.ppm}</b></div>
              <div class="kv"><span>Taxe foncière</span><b>${L.taxe}</b></div>
              <div class="kv"><span>Réf.</span><b>${L.ref}</b></div>
            </div>
          </div>
        </div>

        <div class="sec"><h2>Bilan énergétique</h2>
          <div class="energy">
            <div class="col"><div class="lbl">Consommation énergétique</div><div class="scale">${scale(L.dpe)}</div></div>
            <div class="col"><div class="lbl">Émissions de gaz à effet de serre</div><div class="scale">${scale(L.ges)}</div></div>
          </div>
        </div>

        <div class="sec"><h2>Découvrir le quartier</h2>
          <div class="map"><div class="gl"></div><div class="pin">📍</div><div class="qbtn">Découvrir le quartier</div></div>
        </div>

        <div class="sec"><h2>Simulation de crédit</h2>
          <div class="credit">
            <div>
              <label>Taux d'emprunt (%)</label><input id="cr-rate" type="number" value="3.5" step="0.1">
              <label>Apport (€)</label><input id="cr-down" type="number" value="57800" step="1000">
              <label>Durée (années)</label><input id="cr-years" type="number" value="20" step="1">
            </div>
            <div class="res"><div class="m" id="cr-month">—</div><small>par mois · hors assurance · à titre indicatif</small></div>
          </div>
        </div>
      </div>

      <aside class="side">
        <div class="v3d">
          <div class="k">Nouveau</div><h3>Visite virtuelle 3D</h3>
          <p>Parcourez chaque pièce à 360°, comme si vous y étiez.</p>
          <a class="btn3d" href="${viewerUrl}">Lancer la visite 3D →</a>
        </div>
        <div class="lead">
          <h4>Ce bien vous intéresse ?</h4>
          <div class="who"><div class="av">${initials(S.agent)}</div>
            <div><b>${S.agent || 'Conseiller'}</b><span>${S.agency || A.name}</span></div></div>
          <div class="f2"><input placeholder="Nom"><input placeholder="Prénom"></div>
          <input placeholder="Téléphone"><input placeholder="Adresse e-mail">
          <textarea placeholder="Votre message"></textarea>
          <button class="send" id="lead-send">Envoyer</button>
          <div class="cgu">☑ J'accepte d'être recontacté par l'agence ${S.agency || A.name}.</div>
        </div>
      </aside>
    </div>
  </div>
  ${footer()}
  `;

  document.title = L.title + ' — ' + A.name;

  var slidesEl = [].slice.call(document.querySelectorAll('.hero .slide'));
  var dotsEl = [].slice.call(document.querySelectorAll('.dots i'));
  var countEl = document.getElementById('count');
  var cur = 0;
  function show(i){ cur = (i + slidesEl.length) % slidesEl.length;
    slidesEl.forEach(function(s,k){ s.classList.toggle('on', k===cur); });
    dotsEl.forEach(function(d,k){ d.classList.toggle('on', k===cur); });
    countEl.textContent = (cur+1) + ' / ' + slidesEl.length;
  }
  document.getElementById('pv').onclick = function(){ show(cur-1); };
  document.getElementById('nx').onclick = function(){ show(cur+1); };
  dotsEl.forEach(function(d){ d.onclick = function(){ show(+d.getAttribute('data-i')); }; });

  function calcCredit(){
    var rate = parseFloat(document.getElementById('cr-rate').value) || 0;
    var down = parseFloat(document.getElementById('cr-down').value) || 0;
    var years = parseFloat(document.getElementById('cr-years').value) || 1;
    var cap = Math.max(0, L.price - down);
    var i = (rate/100)/12, n = years*12;
    var m = i > 0 ? cap * i / (1 - Math.pow(1+i, -n)) : cap / n;
    document.getElementById('cr-month').textContent = Math.round(m).toLocaleString('fr-FR') + ' €';
  }
  ['cr-rate','cr-down','cr-years'].forEach(function(id){ document.getElementById(id).addEventListener('input', calcCredit); });
  calcCredit();

  var send = document.getElementById('lead-send');
  if (send) send.onclick = function(){ send.textContent = 'Message envoyé ✓'; send.style.background = 'var(--navy)'; };
})();
