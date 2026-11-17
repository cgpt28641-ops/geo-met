(() => {
  'use strict';

  const CATS = {
    kamera:   { label: 'Samochód i kamera Google', short: 'Kamera', icon: '📷' },
    tablice:  { label: 'Tablice rejestracyjne', short: 'Tablice', icon: '🚘' },
    slupki:   { label: 'Słupki drogowe', short: 'Słupki', icon: '📍' },
    linie:    { label: 'Linie na drodze', short: 'Linie', icon: '🛣️' },
    znaki:    { label: 'Znaki drogowe', short: 'Znaki', icon: '⚠️' },
    jezyk:    { label: 'Język i pismo', short: 'Język', icon: '🔤' },
    slupy:    { label: 'Słupy energetyczne', short: 'Słupy', icon: '🗼' },
    przyroda: { label: 'Krajobraz i przyroda', short: 'Przyroda', icon: '🌿' },
    inne:     { label: 'Architektura i inne', short: 'Inne', icon: '🏘️' },
  };
  const REGIONS = ['Europa', 'Ameryka Płn.', 'Ameryka Płd.', 'Azja', 'Afryka', 'Oceania'];
  const DIFF = ['', 'łatwy', 'średni', 'trudny'];

  const C = window.COUNTRIES.slice().sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  const byId = Object.fromEntries(C.map(c => [c.id, c]));
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];

  const store = {
    get(k, d) { try { const v = localStorage.getItem('geometa:' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem('geometa:' + k, JSON.stringify(v)); } catch { /* prywatny tryb */ } },
  };
  const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const flag = (id, cls = '') => `<img class="flag ${cls}" src="https://flagcdn.com/w160/${id}.png" alt="" loading="lazy" onerror="this.closest('button')?.remove()" decoding="async">`;
  const fold = s => String(s).toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const driveTxt = d => d === 'L' ? 'lewostronny' : 'prawostronny';
  const allClues = c => Object.entries(c.clues).flatMap(([k, arr]) => arr.map(v => [k, v]));
  window.GM = { C, byId, CATS, REGIONS, flag, esc };

  // ── motyw ──
  const applyTheme = t => { if (t) document.documentElement.dataset.theme = t; };
  applyTheme(store.get('theme', null));
  $('#themeBtn').onclick = () => {
    const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const t = cur === 'dark' ? 'light' : 'dark';
    store.set('theme', t); applyTheme(t);
  };

  // ═════════ ROUTER ═════════
  const scrollPos = {};
  let currentRoute = '';
  function route() {
    const h = location.hash.slice(1) || 'nauka';
    const [view, arg] = h.split('/');
    if (currentRoute) scrollPos[currentRoute] = scrollY;
    const tab = view === 'kraj' ? 'kraje' : view === 'lekcja' || view === 'moje' ? 'nauka' : view;
    if (view !== 'kraj') document.title = 'GeoMeta — meta GeoGuessr po polsku';
    $$('#tabs a').forEach(a => a.classList.toggle('active', a.dataset.tab === tab));
    $$('.view').forEach(v => v.classList.toggle('active', v.id === 'v-' + view));
    if (view === 'kraj' && byId[arg]) renderCountry(arg);
    else if (view === 'kraj') return (location.hash = 'kraje');
    if (view === 'nauka') renderNauka();
    if (view === 'moje') renderMoje();
    if (view === 'lekcja') { if (lessonById[arg]) renderLesson(arg); else return (location.hash = 'nauka'); }
    if (view === 'fiszki') fcNext();
    if (view === 'poradniki' && arg) { const d = document.getElementById('g-' + arg); if (d) { d.open = true; setTimeout(() => d.scrollIntoView({ block: 'start' }), 30); } }
    currentRoute = h;
    if (!(view === 'poradniki' && arg)) requestAnimationFrame(() => scrollTo(0, ['kraj', 'lekcja', 'quiz', 'moje'].includes(view) ? 0 : (scrollPos[h] || 0)));
    if (['nauka', 'kraje', 'porownaj', 'poradniki'].includes(view)) store.set('tab', view);
  }
  addEventListener('hashchange', route);

  // ═════════ KRAJE ═════════
  let learned = new Set(store.get('learned', []));
  const filt = { region: 'all', drive: null, hideLearned: false, showMinor: false, q: '' };

  const regionCount = r => C.filter(c => (r === 'all' || c.region === r) && (!c.minor || filt.showMinor)).length;
  function renderRegionChips() {
    $('#regionChips').innerHTML = ['all', ...REGIONS].map(r =>
      `<button class="chip ${filt.region === r ? 'active' : ''}" data-region="${r}">${r === 'all' ? 'Cały świat' : r}<span class="n">${regionCount(r)}</span></button>`).join('');
    $$('[data-region]').forEach(b => b.onclick = () => { filt.region = b.dataset.region; renderGrid(); });
  }
  $$('[data-drive]').forEach(b => b.onclick = () => { filt.drive = filt.drive === b.dataset.drive ? null : b.dataset.drive; renderGrid(); });
  $$('[data-f]').forEach(b => b.onclick = () => { filt[b.dataset.f] = !filt[b.dataset.f]; renderGrid(); });
  let searchT;
  $('#search').oninput = e => { clearTimeout(searchT); searchT = setTimeout(() => { filt.q = fold(e.target.value.trim()); renderGrid(); }, 120); };

  C.forEach(c => { c._hay = fold([c.name, c.region, c.domain, c.phone, c.summary, ...allClues(c).map(x => x[1]), ...(c.tips || [])].join(' | ')); });

  function highlight(text, q) {
    const f = fold(text); const i = f.indexOf(q);
    if (i < 0 || !q) return esc(text);
    return esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length));
  }

  function renderGrid() {
    renderRegionChips();
    $$('[data-drive]').forEach(b => b.classList.toggle('active', b.dataset.drive === filt.drive));
    $$('[data-f]').forEach(b => b.classList.toggle('active', !!filt[b.dataset.f]));

    const ok = c =>
      (filt.region === 'all' || c.region === filt.region) &&
      (!filt.drive || c.drive === filt.drive) &&
      (!filt.hideLearned || !learned.has(c.id)) &&
      (filt.showMinor || !c.minor || (filt.q && fold(c.name).includes(filt.q))) &&
      (!filt.q || c._hay.includes(filt.q));
    const list = C.filter(ok);

    // dopasowania wskazówek w wyszukiwarce
    let hits = '';
    if (filt.q && filt.q.length >= 3) {
      const rows = [];
      for (const c of list) {
        if (fold(c.name).includes(filt.q)) continue;
        for (const [k, v] of allClues(c)) if (fold(v).includes(filt.q)) { rows.push({ c, k, v }); break; }
        if (rows.length >= 12) break;
      }
      if (rows.length) hits = `<h3 class="region-title">Pasujące wskazówki <span>${rows.length}${rows.length >= 12 ? '+' : ''}</span></h3><div class="hits">` +
        rows.map(r => `<a class="hit" href="#kraj/${r.c.id}">${flag(r.c.id, 'sm')}<div><b>${esc(r.c.name)} · <span>${CATS[r.k].icon} ${CATS[r.k].short}</span></b><span>${highlight(r.v, filt.q)}</span></div></a>`).join('') + '</div>';
    }
    $('#searchHits').innerHTML = hits;

    const card = c => `<a class="ccard ${learned.has(c.id) ? 'learned' : ''}" href="#kraj/${c.id}">
        <div class="ccard-head">${flag(c.id)}<div><h3>${esc(c.name)}</h3><div class="sub">${c.drive === 'L' ? '⬅️ lewostronny' : '➡️ prawostronny'} · ${c.domain}</div></div></div>
        <div class="tags"><span class="tag d${c.diff}">${DIFF[c.diff]}</span>${c.minor ? '<span class="tag">terytorium</span>' : ''}<span class="tag">${allClues(c).length} wskazówek</span></div>
        <p>${esc(c.summary || '')}</p>
      </a>`;

    let html = '';
    if (!list.length) html = '<div class="empty">Nic nie znaleziono 🤷<br><small>Spróbuj innego słowa albo włącz „Pokaż małe terytoria”.</small></div>';
    else if (filt.region !== 'all' || filt.q) html = `<div class="cgrid">${list.map(card).join('')}</div>`;
    else for (const r of REGIONS) {
      const l = list.filter(c => c.region === r);
      if (l.length) html += `<h2 class="region-title">${r} <span>${l.length}</span></h2><div class="cgrid">${l.map(card).join('')}</div>`;
    }
    $('#countryGrid').innerHTML = html;

    const total = C.filter(c => !c.minor).length;
    const done = C.filter(c => !c.minor && learned.has(c.id)).length;
    $('#learnedBar').style.width = (done / total * 100) + '%';
    $('#learnedTxt').textContent = `Opanowane: ${done}/${total}`;
  }

  // ═════════ STRONA KRAJU ═════════
  function renderCountry(id) {
    const c = byId[id];
    const sameRegion = C.filter(x => x.region === c.region && (!x.minor || x.id === id));
    const i = sameRegion.indexOf(c);
    const prev = sameRegion[(i - 1 + sameRegion.length) % sameRegion.length];
    const next = sameRegion[(i + 1) % sameRegion.length];
    const cats = Object.keys(CATS).filter(k => c.clues[k] && c.clues[k].length);
    document.title = `${c.name} — GeoMeta`;
    $('#v-kraj').innerHTML = `
      <a class="back" href="#kraje">← Wszystkie kraje</a>
      <div class="cp-head">
        ${flag(c.id, 'xl')}
        <div>
          <div class="tags"><span class="tag">${c.region}</span><span class="tag d${c.diff}">${DIFF[c.diff]}</span>${c.minor ? '<span class="tag">małe terytorium</span>' : ''}</div>
          <h1>${esc(c.name)}</h1>
          <p class="cp-summary">${esc(c.summary || '')}</p>
        </div>
      </div>
      <div class="facts">
        <div class="fact"><small>Ruch</small><b>${c.drive === 'L' ? '⬅️ lewy' : '➡️ prawy'}</b></div>
        <div class="fact"><small>Domena</small><b>${esc(c.domain || '—')}</b></div>
        <div class="fact"><small>Kierunkowy</small><b>${esc(c.phone || '—')}</b></div>
        <div class="fact"><small>Wskazówek</small><b>${allClues(c).length}</b></div>
      </div>
      ${(c.tips || []).length ? `<div class="tips">${c.tips.map(t => `<div class="tip">💡 ${esc(t)}</div>`).join('')}</div>` : ''}
      <div class="ctabs" id="ctabs">
        <button data-ct="r1">📸 <span>Rozpoznanie</span></button>
        <button data-ct="r2">🗺️ <span>Regiony</span></button>
        <button data-ct="r3">🔎 <span>Szczegóły</span></button>
        <button data-ct="sc">📝 <span>Ściąga</span></button>
        <button data-ct="gal">🖼️ <span>Galeria</span></button>
      </div>
      <div id="cpBody" class="cp-body"></div>
      <div class="cp-actions">
        <button class="btn ${learned.has(id) ? '' : 'primary'}" id="toggleLearned">${learned.has(id) ? '↩️ Cofnij „opanowane”' : '✅ Opanowałem ten kraj'}</button>
        <button class="btn" id="drillCountry">🃏 Fiszki z tego kraju</button>
        <a class="btn" href="https://www.plonkit.net/guide" target="_blank" rel="noopener">Plonk It ↗</a>
        <a class="btn" href="https://www.google.com/maps/search/${encodeURIComponent(c.name)}" target="_blank" rel="noopener">Mapa ↗</a>
      </div>
      <div class="cp-nav">
        <a href="#kraj/${prev.id}">← ${flag(prev.id, 'sm')} ${esc(prev.name)}</a>
        <a class="next" href="#kraj/${next.id}">${esc(next.name)} ${flag(next.id, 'sm')} →</a>
      </div>`;
    $$('[data-ct]').forEach(b => b.onclick = () => { ctab = b.dataset.ct; store.set('ctab', ctab); renderCountryTab(id); });
    renderCountryTab(id);
    $('#toggleLearned').onclick = () => {
      learned.has(id) ? learned.delete(id) : learned.add(id);
      store.set('learned', [...learned]); renderGrid(); renderCountry(id);
    };
    $('#drillCountry').onclick = () => { fc.only = [id]; fc.extra = true; location.hash = 'fiszki'; fcNext(); };
  }

  // ── zakładki karty kraju ──
  let ctab = store.get('ctab', 'r1');
  const PLONK_IMG = (p, w = 600) => /^https?:/.test(p) ? p : `https://www.plonkit.net/images/resize/${w}/80/${p}`;
  const GH_IMG = p => p.startsWith('~') ? 'https://ocsc00skc0wokcs8kw8g8k84.geohints.com/storage/' + p.slice(1) : p;
  const cache = {};
  const loadJSON = url => cache[url] || (cache[url] = fetch(url).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).catch(e => { delete cache[url]; throw e; }));
  const GAL = {
    bollards: ['📍', 'Słupki drogowe'], licensePlates: ['🚘', 'Tablice rejestracyjne'], utilityPoles: ['🗼', 'Słupy energetyczne'],
    googleVehicles_cars: ['📷', 'Samochody Google'], followCars: ['🚓', 'Samochody eskorty'], signs_chevrons: ['↪️', 'Szewrony'],
    signs_stop: ['🛑', 'Znaki STOP'], signs_yield: ['🔻', 'Ustąp pierwszeństwa'], signs_pedestrian: ['🚸', 'Przejścia dla pieszych'],
    signs_railwayCrossing: ['🚆', 'Przejazdy kolejowe'], signs_citySigns: ['🏙️', 'Tablice miejscowości'], signs_directions: ['🧭', 'Drogowskazy'],
    signs_signPosts: ['🪧', 'Słupki pod znaki'], signs_speed: ['🚦', 'Ograniczenia prędkości'], signs_busStop: ['🚌', 'Przystanki'],
    signs_animalWarning: ['🦌', 'Uwaga zwierzęta'],
  };
  const txt = t => esc(t).replace(/\n/g, '<br>');
  const mapLink = m => m ? `<a class="maplink" href="${esc(m)}" target="_blank" rel="noopener">📍 Google Maps</a>` : '';

  function renderCountryTab(id) {
    const c = byId[id], body = $('#cpBody');
    $$('[data-ct]').forEach(b => b.classList.toggle('active', b.dataset.ct === ctab));
    if (ctab === 'sc') {
      const cats = Object.keys(CATS).filter(k => c.clues[k] && c.clues[k].length);
      body.innerHTML = `<div class="toc"><div class="chips">${cats.map(k => `<button class="chip" data-jump="${k}">${CATS[k].icon} ${CATS[k].short}</button>`).join('')}</div></div>
        <div class="sections">${cats.map(k => `<div class="sec" id="sec-${k}"><h3>${CATS[k].icon} ${CATS[k].label}</h3><ul>${c.clues[k].map(v => `<li>${esc(v)}</li>`).join('')}</ul></div>`).join('')}</div>`;
      $$('[data-jump]').forEach(b => b.onclick = () => document.getElementById('sec-' + b.dataset.jump).scrollIntoView({ behavior: 'smooth' }));
      return;
    }
    body.innerHTML = '<div class="loading">Ładowanie…</div>';
    if (ctab === 'gal') {
      loadJSON('data/gallery.json').then(G => {
        if (location.hash !== '#kraj/' + id || ctab !== 'gal') return;
        let html = '', lb = [];
        for (const [k, [icon, label]] of Object.entries(GAL)) {
          const items = (G[k] || []).filter(x => x[0] === id);
          if (!items.length) continue;
          html += `<h3 class="phead">${icon} ${label} <span>${items.length}</span></h3><div class="ggrid">` + items.map(x => {
            lb.push({ src: GH_IMG(x[1]), cap: `${label}${x[3] ? ' · ' + x[3] : ''}`, map: x[2] });
            return `<button class="gthumb" data-lb="${lb.length - 1}"><img src="${esc(GH_IMG(x[1]))}" alt="" loading="lazy" onerror="this.closest('button')?.remove()" decoding="async">${x[3] ? `<span>${esc(x[3])}</span>` : ''}</button>`;
          }).join('') + '</div>';
        }
        body.innerHTML = html ? `<p class="muted small">Zdjęcia z GeoHints — stuknij, aby powiększyć.</p>${html}` : '<div class="empty">Brak zdjęć GeoHints dla tego kraju.</div>';
        bindLightbox(body, lb);
      }).catch(() => { body.innerHTML = '<div class="empty">Nie udało się wczytać galerii (sprawdź połączenie).</div>'; });
      return;
    }
    const step = +ctab.slice(1);
    loadJSON(`data/plonk/${id}.json`).then(d => {
      if (location.hash !== '#kraj/' + id || ctab !== 'r' + step) return;
      const items = d.items.filter(x => x[0] === step);
      if (!items.length) { body.innerHTML = `<div class="empty">${step === 1 ? 'Brak kart ze zdjęciami — zobacz „Ściągę”.' : 'Plonk It nie ma tu wskazówek dla tego kraju.'}</div>`; return; }
      let html = '', last = null, lb = [];
      const open = () => '<div class="pgrid">';
      for (const [, head, imgs, map, t] of items) {
        if (head !== last) { if (last !== null) html += '</div>'; html += (head ? `<h3 class="phead">${esc(head)}</h3>` : '') + open(); last = head; }
        const pics = imgs.map(p => { lb.push({ src: PLONK_IMG(p, 1200), cap: t, map }); return `<button class="pimg" data-lb="${lb.length - 1}"><img src="${esc(PLONK_IMG(p))}" alt="" loading="lazy" onerror="this.closest('button')?.remove()" decoding="async"></button>`; }).join('');
        html += `<div class="pcard ${imgs.length ? '' : 'noimg'}">${pics}${t || map ? `<div class="ptext">${txt(t)}${mapLink(map)}</div>` : ''}</div>`;
      }
      html += '</div>';
      body.innerHTML = `<p class="muted small">${['', 'Jak rozpoznać kraj', 'Wskazówki regionalne', 'Spotlight — bardzo szczegółowe wskazówki'][step]} · na podstawie Plonk It · stuknij zdjęcie, aby powiększyć</p>` + html;
      bindLightbox(body, lb);
    }).catch(() => { body.innerHTML = '<div class="empty">Nie udało się wczytać danych (sprawdź połączenie).</div>'; });
  }

  // ── lightbox ──
  const lbEl = document.createElement('div');
  lbEl.className = 'lb hidden';
  lbEl.innerHTML = `<button class="lb-x" aria-label="Zamknij">✕</button><button class="lb-nav lb-prev" aria-label="Poprzednie">‹</button>
    <figure><img alt=""><figcaption></figcaption></figure><button class="lb-nav lb-next" aria-label="Następne">›</button>`;
  document.body.appendChild(lbEl);
  const lb = { list: [], i: 0 };
  function lbShow() {
    const it = lb.list[lb.i];
    lbEl.querySelector('img').src = it.src;
    lbEl.querySelector('figcaption').innerHTML = `<span class="lb-n">${lb.i + 1} / ${lb.list.length}</span> ${txt(it.cap || '')} ${mapLink(it.map)}`;
  }
  function bindLightbox(root, list) {
    root.querySelectorAll('[data-lb]').forEach(b => b.onclick = e => { e.stopPropagation(); lb.list = list; lb.i = +b.dataset.lb; lbShow(); lbEl.classList.remove('hidden'); document.body.style.overflow = 'hidden'; });
  }
  const lbClose = () => { lbEl.classList.add('hidden'); lbEl.querySelector('img').src = ''; document.body.style.overflow = ''; };
  const lbMove = d => { lb.i = (lb.i + d + lb.list.length) % lb.list.length; lbShow(); };
  lbEl.querySelector('.lb-x').onclick = lbClose;
  lbEl.querySelector('.lb-prev').onclick = e => { e.stopPropagation(); lbMove(-1); };
  lbEl.querySelector('.lb-next').onclick = e => { e.stopPropagation(); lbMove(1); };
  lbEl.addEventListener('click', e => { if (e.target === lbEl || e.target.tagName === 'FIGURE') lbClose(); });
  let lx = null;
  lbEl.addEventListener('touchstart', e => { lx = e.touches[0].clientX; }, { passive: true });
  lbEl.addEventListener('touchend', e => { if (lx === null) return; const dx = e.changedTouches[0].clientX - lx; lx = null; if (Math.abs(dx) > 50) lbMove(dx < 0 ? 1 : -1); }, { passive: true });
  addEventListener('hashchange', lbClose);

  // swipe między krajami na telefonie
  let sx = null, sy = null;
  $('#v-kraj').addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  $('#v-kraj').addEventListener('touchend', e => {
    if (sx === null) return;
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy; sx = null;
    if (Math.abs(dx) > 90 && Math.abs(dy) < 50) { const a = $(dx < 0 ? '.cp-nav .next' : '.cp-nav a:not(.next)'); if (a) location.hash = a.getAttribute('href').slice(1); }
  }, { passive: true });

  // ═════════ PORÓWNAJ ═════════
  const cmpExtra = { drive: { label: 'Strona ruchu', short: 'Ruch', icon: '↔️' }, domain: { label: 'Domeny i kierunkowe', short: 'Domeny', icon: '🌐' } };
  const cmpCats = { ...CATS, ...cmpExtra };
  let cmpCat = store.get('cmpCat', 'slupki'), cmpRegion = 'all', cmpMode = store.get('cmpMode', 'txt'), cmpGal = store.get('cmpGal', 'bollards');
  const cmpOpen = new Set();
  function renderCompare() {
    $('#compareMode').innerHTML = `<button class="seg ${cmpMode === 'txt' ? 'active' : ''}" data-cm="txt">📝 Opisy</button><button class="seg ${cmpMode === 'img' ? 'active' : ''}" data-cm="img">🖼️ Zdjęcia</button>`;
    $$('[data-cm]').forEach(b => b.onclick = () => { cmpMode = b.dataset.cm; store.set('cmpMode', cmpMode); renderCompare(); });
    if (cmpMode === 'img') return renderCompareImg();
    $('#compareChips').innerHTML = Object.entries(cmpCats).map(([k, v]) => `<button class="chip ${k === cmpCat ? 'active' : ''}" data-cmp="${k}">${v.icon} ${v.short}</button>`).join('');
    $('#compareRegions').innerHTML = ['all', ...REGIONS].map(r => `<button class="chip ${r === cmpRegion ? 'active' : ''}" data-cr="${r}">${r === 'all' ? 'Wszystkie regiony' : r}</button>`).join('');
    $$('[data-cmp]').forEach(b => b.onclick = () => { cmpCat = b.dataset.cmp; store.set('cmpCat', cmpCat); renderCompare(); });
    $$('[data-cr]').forEach(b => b.onclick = () => { cmpRegion = b.dataset.cr; renderCompare(); });
    let html = '';
    for (const r of REGIONS) {
      if (cmpRegion !== 'all' && r !== cmpRegion) continue;
      const rows = C.filter(c => c.region === r && !c.minor).map(c => {
        let vals;
        if (cmpCat === 'drive') vals = [`Ruch ${driveTxt(c.drive)}`];
        else if (cmpCat === 'domain') vals = [`Domena ${c.domain} · tel. ${c.phone}`];
        else vals = c.clues[cmpCat] || [];
        return vals.length ? `<a class="crow" href="#kraj/${c.id}">${flag(c.id)}<div><b>${esc(c.name)}</b><ul>${vals.map(v => `<li>${esc(v)}</li>`).join('')}</ul></div></a>` : '';
      }).join('');
      if (rows) html += `<h3 class="region-title">${r}</h3>${rows}`;
    }
    $('#compareList').innerHTML = html || '<div class="empty">Brak danych w tej kategorii.</div>';
  }
  function renderCompareImg() {
    $('#compareChips').innerHTML = Object.entries(GAL).map(([k, [i, l]]) => `<button class="chip ${k === cmpGal ? 'active' : ''}" data-gal="${k}">${i} ${l}</button>`).join('');
    $('#compareRegions').innerHTML = ['all', ...REGIONS].map(r => `<button class="chip ${r === cmpRegion ? 'active' : ''}" data-cr="${r}">${r === 'all' ? 'Wszystkie regiony' : r}</button>`).join('');
    $$('[data-gal]').forEach(b => b.onclick = () => { cmpGal = b.dataset.gal; store.set('cmpGal', cmpGal); cmpOpen.clear(); renderCompare(); });
    $$('[data-cr]').forEach(b => b.onclick = () => { cmpRegion = b.dataset.cr; renderCompare(); });
    $('#compareList').innerHTML = '<div class="loading">Ładowanie zdjęć…</div>';
    loadJSON('data/gallery.json').then(G => {
      if (cmpMode !== 'img') return;
      const all = G[cmpGal] || [], lbl = GAL[cmpGal][1], lbList = [];
      let html = '';
      for (const r of REGIONS) {
        if (cmpRegion !== 'all' && r !== cmpRegion) continue;
        const rows = C.filter(c => c.region === r).map(c => {
          const it = all.filter(x => x[0] === c.id);
          if (!it.length) return '';
          const lim = cmpOpen.has(c.id) ? it.length : 6;
          const thumbs = it.slice(0, lim).map(x => { lbList.push({ src: GH_IMG(x[1]), cap: `${c.name} · ${lbl}${x[3] ? ' · ' + x[3] : ''}`, map: x[2] }); return `<button class="gthumb" data-lb="${lbList.length - 1}"><img src="${esc(GH_IMG(x[1]))}" alt="" loading="lazy" onerror="this.closest('button')?.remove()" decoding="async">${x[3] ? `<span>${esc(x[3])}</span>` : ''}</button>`; }).join('');
          return `<div class="gcountry"><a class="gname" href="#kraj/${c.id}">${flag(c.id, 'sm')} ${esc(c.name)} <span>${it.length}</span></a><div class="ggrid">${thumbs}</div>${it.length > lim ? `<button class="link" data-more="${c.id}">Pokaż wszystkie (${it.length})</button>` : ''}</div>`;
        }).join('');
        if (rows) html += `<h3 class="region-title">${r}</h3>${rows}`;
      }
      const list = $('#compareList');
      list.innerHTML = html ? `<p class="muted small" style="grid-column:1/-1">Zdjęcia z GeoHints — stuknij, aby powiększyć.</p>${html}` : '<div class="empty">Brak zdjęć dla tych filtrów.</div>';
      bindLightbox(list, lbList);
      list.querySelectorAll('[data-more]').forEach(b => b.onclick = () => { cmpOpen.add(b.dataset.more); renderCompareImg(); });
    }).catch(() => { $('#compareList').innerHTML = '<div class="empty">Nie udało się wczytać zdjęć.</div>'; });
  }

  // ═════════ PORADNIKI ═════════
  function renderGuides() {
    const guides = window.buildGuides();
    $('#guideList').innerHTML = guides.map((g, i) => `
      <details class="guide" id="g-${g.id}" ${i === 0 ? 'open' : ''}>
        <summary><span class="gi">${g.icon}</span><span>${esc(g.title)}<small>${esc(g.sub || '')}</small></span></summary>
        <div class="gbody">${g.html}</div>
      </details>`).join('');
  }

  // ═════════ FISZKI ═════════
  const regionOpts = `<option value="all">Cały świat</option>` + REGIONS.map(r => `<option>${r}</option>`).join('');
  const catOpts = `<option value="all">Wszystkie</option>` + Object.entries(CATS).map(([k, v]) => `<option value="${k}">${v.icon} ${v.short}</option>`).join('');
  $('#fcRegion').innerHTML = regionOpts; $('#qRegion').innerHTML = regionOpts;
  $('#fcCat').innerHTML = catOpts; $('#qCat').innerHTML = catOpts;

  const allCards = C.filter(c => !c.minor).flatMap(c => allClues(c).map(([k, v]) => ({ id: `${c.id}:${k}:${fold(v).slice(0, 40)}`, c, k, v })));

  // ── postęp: dni, seria, powtórki rozłożone w czasie ──
  const today = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);
  let act = store.get('activity', {});
  const GOAL = 30;
  function logActivity() { const d = today(); act[d] = (act[d] || 0) + 1; store.set('activity', act); }
  function streak() { let n = 0, d = today(); if (!act[d]) d--; while (act[d]) { n++; d--; } return n; }
  const INTERVALS = [0, 1, 3, 7, 14, 30];
  let srs = store.get('srs3', null);
  if (!srs) { srs = {}; const old = store.get('boxes2', {}); for (const [k, v] of Object.entries(old)) srs[k] = [Math.min(5, v), today()]; store.set('srs3', srs); }
  const isDue = id => srs[id] && srs[id][1] <= today();
  const mastered = id => srs[id] && srs[id][0] >= 3;

  const fc = { card: null, flipped: false, last: [], only: null, extra: false };
  const fcSet = store.get('fcSettings2', { region: 'all', cat: 'all', mode: 'clue' });
  $('#fcRegion').value = fcSet.region; $('#fcCat').value = fcSet.cat; $('#fcMode').value = fcSet.mode;
  ['#fcRegion', '#fcCat', '#fcMode'].forEach(s => $(s).onchange = () => {
    Object.assign(fcSet, { region: $('#fcRegion').value, cat: $('#fcCat').value, mode: $('#fcMode').value });
    fc.only = null; fc.extra = false; store.set('fcSettings2', fcSet); fcNext();
  });
  const inScope = c => fc.only ? fc.only.includes(c.id) : (fcSet.region === 'all' || c.region === fcSet.region);
  function deck() {
    if (fcSet.mode === 'country') {
      return C.filter(c => !c.minor && inScope(c))
        .filter(c => fcSet.cat === 'all' || (c.clues[fcSet.cat] || []).length)
        .map(c => ({ id: `country:${c.id}:${fcSet.cat}`, c, k: fcSet.cat }));
    }
    return allCards.filter(x => inScope(x.c) && (fcSet.cat === 'all' || x.k === fcSet.cat));
  }

  function fcNext() {
    const d = deck();
    $('#flashcard').classList.remove('flipped'); fc.flipped = false;
    $('#flashcard').classList.remove('done');
    if (!d.length) { fc.card = null; $('#fcFront').innerHTML = '<div class="muted">Brak kart dla tych filtrów.</div>'; $('#fcBack').innerHTML = ''; renderFcStats(d); return; }
    const notLast = arr => arr.length > 3 ? arr.filter(x => !fc.last.includes(x.id)) : arr;
    const due = d.filter(x => isDue(x.id)), fresh = d.filter(x => !srs[x.id]);
    // najpierw karty z błędami (pudełko 0), potem reszta zaległych, potem nowe
    let pool = notLast(due.filter(x => srs[x.id][0] === 0));
    if (!pool.length) pool = notLast(due);
    if (!pool.length) pool = notLast(fresh);
    if (!pool.length && fc.extra) pool = notLast(d);
    if (!pool.length) {
      fc.card = null; renderFcStats(d);
      $('#fcFront').innerHTML = `<div style="font-size:3rem">🎉</div><b>Wszystko powtórzone na dziś!</b><div class="fc-hint">Karty wrócą, gdy przyjdzie czas na powtórkę.</div><button class="btn primary" id="fcExtra">Ucz się dalej mimo to</button>`;
      $('#fcBack').innerHTML = '';
      $('#fcExtra').onclick = e => { e.stopPropagation(); fc.extra = true; fcNext(); };
      return;
    }
    const card = pick(pool);
    fc.card = card; fc.last = [card.id, ...fc.last].slice(0, 6);
    const country = `${flag(card.c.id, fcSet.mode === 'clue' ? 'lg' : 'xl')}<div style="font-size:1.5rem;font-weight:800">${esc(card.c.name)}</div><div class="fc-hint">${card.c.region} · ruch ${driveTxt(card.c.drive)}</div>`;
    const badge = !srs[card.id] ? '<span class="fc-badge new">nowa</span>' : srs[card.id][0] === 0 ? '<span class="fc-badge bad">do poprawy</span>' : `<span class="fc-badge">powtórka · poziom ${srs[card.id][0]}</span>`;
    if (fcSet.mode === 'clue') {
      const lab = CATS[card.k];
      $('#fcFront').innerHTML = `${badge}<div class="fc-cat">${lab.icon} ${lab.label}</div><div>${esc(card.v)}</div><div class="fc-hint">Jaki to kraj? Pomyśl, potem stuknij, aby odwrócić</div>`;
      $('#fcBack').innerHTML = country + '<div class="qex fc-ex" id="fcEx"></div>';
      const cid = card.id;
      examplesFor(card.c, card.k, card.v).then(list => { const el = $('#fcEx'); if (el && fc.card && fc.card.id === cid) renderExamples(el, list.slice(0, 2), false); });
    } else {
      const items = card.k === 'all' ? allClues(card.c).slice(0, 8) : (card.c.clues[card.k] || []).map(v => [card.k, v]);
      $('#fcFront').innerHTML = `${badge}${country}<div class="fc-cat">${card.k === 'all' ? 'Jak go rozpoznać?' : CATS[card.k].icon + ' ' + CATS[card.k].label + '?'}</div>`;
      $('#fcBack').innerHTML = `<div class="fc-cat">${esc(card.c.name)}</div><ul>${items.map(([k, v]) => `<li>${CATS[k].icon} ${esc(v)}</li>`).join('')}</ul>`;
    }
    renderFcStats(d);
  }
  function renderFcStats(d) {
    let due = 0, fresh = 0, learning = 0, done = 0;
    for (const x of d) { const r = srs[x.id]; if (!r) fresh++; else { if (r[1] <= today()) due++; if (r[0] >= 3) done++; else learning++; } }
    const scope = fc.only ? (fc.only.length === 1 ? byId[fc.only[0]].name : `lekcja (${fc.only.length} kraje)`) : null;
    $('#fcStats').innerHTML = (scope ? `<span>🎯 ${esc(scope)} <button class="link" id="fcAll">wszystkie</button></span>` : '') +
      `<span>🔁 Do powtórki: <b>${due}</b></span><span>🆕 Nowe: ${fresh}</span><span>📈 W nauce: ${learning}</span><span>🏆 Opanowane: ${done}</span><span>🔥 Dziś: ${act[today()] || 0}/${GOAL}</span>`;
    const all = $('#fcAll'); if (all) all.onclick = () => { fc.only = null; fcNext(); };
  }
  function fcFlip() { if (!fc.card) return; fc.flipped = !fc.flipped; $('#flashcard').classList.toggle('flipped', fc.flipped); }
  function fcAnswer(ok) {
    if (!fc.card) return;
    const b = srs[fc.card.id] ? srs[fc.card.id][0] : 0;
    const nb = ok ? Math.min(5, b + 1) : 0;
    srs[fc.card.id] = [nb, today() + (ok ? INTERVALS[nb] : 0)];
    store.set('srs3', srs); logActivity(); fcNext();
  }
  $('#flashcard').onclick = fcFlip; $('#fcFlip').onclick = fcFlip;
  $('#fcGood').onclick = () => fcAnswer(true); $('#fcBad').onclick = () => fcAnswer(false);
  $('#fcReset').onclick = () => { if (confirm('Wyzerować postęp fiszek?')) { srs = {}; store.set('srs3', srs); fcNext(); } };
  let tx = null;
  $('#flashcard').addEventListener('touchstart', e => { tx = e.touches[0].clientX; }, { passive: true });
  $('#flashcard').addEventListener('touchend', e => {
    if (tx === null) return;
    const dx = e.changedTouches[0].clientX - tx; tx = null;
    if (Math.abs(dx) > 70 && fc.card) { e.preventDefault(); fcAnswer(dx > 0); }
  });

  // ── przykładowe zdjęcia do wskazówki (quiz, fiszki) ──
  const STOPW = new Set('ale bez dla jak jest lub nie oraz pod przy przez tak tam ten tej tez też tym tylko czesto czasem bardzo zwykle sie się the and are with ich jego jej ich ktore które gdzie albo wiele'.split(' '));
  const words = s => fold(s || '').split(/[^a-z0-9]+/).filter(w => w.length > 2 && !STOPW.has(w));
  const CAT_GAL = { slupki: ['bollards'], tablice: ['licensePlates'], slupy: ['utilityPoles'], kamera: ['googleVehicles_cars', 'followCars'],
    znaki: ['signs_chevrons', 'signs_stop', 'signs_yield', 'signs_pedestrian', 'signs_directions', 'signs_citySigns', 'signs_signPosts', 'signs_railwayCrossing', 'signs_speed', 'signs_busStop', 'signs_animalWarning'] };
  const SIGN_KW = { signs_chevrons: 'szewron', signs_stop: 'stop', signs_yield: 'ustap', signs_pedestrian: 'przejsci', signs_directions: 'drogowskaz', signs_citySigns: 'miejscowo', signs_signPosts: 'slup', signs_railwayCrossing: 'kolej', signs_speed: 'predkos', signs_busStop: 'przystan', signs_animalWarning: 'zwierz' };
  async function examplesFor(c, k, v) {
    const out = [];
    try {
      const d = await loadJSON(`data/plonk/${c.id}.json`);
      if (v) {
        const vw = new Set(words(v)); let best = null, bs = 0;
        for (const it of d.items) {
          if (!it[2].length || it[0] > 2) continue;
          const w = words(it[4]); let hit = 0; for (const x of new Set(w)) if (vw.has(x)) hit++;
          const sc = hit < 2 ? 0 : hit / Math.sqrt(w.length + 4) * (it[0] === 1 ? 1.25 : 1);
          if (sc > bs) { bs = sc; best = it; }
        }
        if (best && bs > 0.45) out.push({ thumb: PLONK_IMG(best[2][0]), src: PLONK_IMG(best[2][0], 1200), cap: best[4], map: best[3] });
      } else {
        const first = d.items.find(it => it[0] === 1 && it[2].length);
        if (first) out.push({ thumb: PLONK_IMG(first[2][0]), src: PLONK_IMG(first[2][0], 1200), cap: first[4] || c.name, map: first[3] });
      }
    } catch { /* brak danych */ }
    let keys = CAT_GAL[k] || [];
    if (k === 'znaki') { const fv = fold(v); keys = keys.filter(g => fv.includes(SIGN_KW[g])); }
    if (keys.length && out.length < 3) {
      try {
        const G = await loadJSON('data/gallery.json');
        const items = keys.flatMap(g => (G[g] || []).filter(x => x[0] === c.id).map(x => [g, ...x]));
        for (const [g, , img, map, note] of shuffle(items).slice(0, 3 - out.length))
          out.push({ thumb: GH_IMG(img), src: GH_IMG(img), cap: `${c.name} · ${GAL[g][1]}${note ? ' · ' + note : ''}`, map });
      } catch { /* brak galerii */ }
    }
    return out;
  }
  function renderExamples(el, list, withCaption = true) {
    if (!list.length) { el.innerHTML = ''; return; }
    el.innerHTML = `<div class="qex-title">Przykład</div><div class="qex-grid">${list.map((x, i) => `<button class="qex-img" data-lb="${i}"><img src="${esc(x.thumb)}" alt="" loading="lazy" onerror="this.closest('button')?.remove()"></button>`).join('')}</div>` +
      (withCaption && list[0].cap && list[0].thumb.includes('plonkit') ? `<div class="qex-cap">${txt(list[0].cap)}</div>` : '');
    bindLightbox(el, list);
  }

  // ═════════ QUIZ ═════════
  const q = { list: [], i: 0, score: 0, answered: false, mistakes: [], opts: {} };
  let mistakes = store.get('mistakes', []);
  const specKey = sp => `${sp.t}|${sp.c}|${sp.v || sp.img || ''}`;
  const qKey = () => `${$('#qType').value}|${$('#qCat').value}|${$('#qRegion').value}`;
  function bestTxt() {
    const best = store.get('best', {});
    $('#qBest').textContent = best[qKey()] != null ? `🏆 Twój rekord w tych ustawieniach: ${best[qKey()]}%` : 'Jeszcze nie grałeś w tych ustawieniach.';
    $('#qCat').closest('label').classList.toggle('hidden', !['mix', 'clue'].includes($('#qType').value));
    $('#qMistakes').textContent = `❌ Powtórz moje błędy (${mistakes.length})`;
    $('#qMistakes').disabled = !mistakes.length;
  }
  ['#qType', '#qRegion', '#qCat'].forEach(s => $(s).onchange = bestTxt);

  function distractors(correct, n, pool) {
    const others = C.filter(c => !c.minor && c.id !== correct.id);
    const inPool = shuffle((pool || []).filter(c => c.id !== correct.id));
    const same = shuffle(others.filter(c => c.region === correct.region && !inPool.includes(c)));
    const rest = shuffle(others.filter(c => c.region !== correct.region && !inPool.includes(c)));
    return [...inPool.slice(0, n), ...same, ...rest].slice(0, n);
  }
  const PHOTO_GAL = ['bollards', 'licensePlates', 'utilityPoles', 'googleVehicles_cars', 'signs_chevrons', 'signs_directions', 'signs_citySigns', 'signs_pedestrian', 'signs_stop', 'signs_signPosts'];
  // spec = minimalny opis pytania (da się zapisać w „błędach”)
  function makeSpec(type, pool, cat, P, G) {
    if (type === 'clue') {
      const cands = pool.filter(c => cat === 'all' ? allClues(c).length : (c.clues[cat] || []).length);
      const c = pick(cands); const [k, v] = pick(cat === 'all' ? allClues(c) : c.clues[cat].map(v => [cat, v]));
      return { t: 'clue', c: c.id, k, v };
    }
    if (type === 'photo') {
      for (let tries = 0; tries < 20; tries++) {
        const c = pick(pool);
        const useGal = G && Math.random() < 0.4;
        if (useGal) {
          const opts = PHOTO_GAL.flatMap(g => (G[g] || []).filter(x => x[0] === c.id).map(x => [g, ...x]));
          if (opts.length) { const [g, , img, , note] = pick(opts); return { t: 'photo', c: c.id, img: GH_IMG(img), lab: GAL[g][1], cap: note ? `${GAL[g][1]} · ${note}` : GAL[g][1] }; }
        }
        const d = P[c.id];
        if (d) {
          const items = d.items.filter((it, i) => it[0] === 1 && it[2].length && (it[4] || '').length > 25 && i > 0);
          if (items.length) { const it = pick(items); return { t: 'photo', c: c.id, img: PLONK_IMG(pick(it[2]), 900), cap: it[4], map: it[3] }; }
        }
      }
      return makeSpec('clue', pool, 'all');
    }
    return { t: type, c: pick(pool).id };
  }
  function buildQ(sp, pool) {
    const c = byId[sp.c];
    const opts = () => shuffle([c, ...distractors(c, 3, pool)]).map(x => x.name);
    const base = { spec: sp, key: specKey(sp), country: c, answer: c.name };
    if (sp.t === 'clue') return { ...base, k: sp.k, v: sp.v, options: opts(), prompt: `<div class="fc-cat">${CATS[sp.k].icon} ${CATS[sp.k].label}</div><div>${esc(sp.v)}</div><div class="muted small">Który to kraj?</div>` };
    if (sp.t === 'photo') return { ...base, options: opts(), prompt: `${sp.lab ? `<div class="fc-cat">📸 ${esc(sp.lab)}</div>` : '<div class="fc-cat">📸 Gdzie zrobiono to zdjęcie?</div>'}<button class="qphoto" data-lb="0"><img src="${esc(sp.img)}" alt=""></button><div class="muted small">Który to kraj? Stuknij zdjęcie, aby powiększyć</div>` };
    if (sp.t === 'drive') return { ...base, answer: c.drive === 'L' ? '⬅️ Lewostronny' : '➡️ Prawostronny', options: ['⬅️ Lewostronny', '➡️ Prawostronny'], prompt: `${flag(c.id, 'xl')}<div>Po której stronie jeździ się w kraju <b>${esc(c.name)}</b>?</div>` };
    if (sp.t === 'flag') return { ...base, options: opts(), prompt: `${flag(c.id, 'xl')}<div>Czyja to flaga?</div>` };
    return { ...base, options: opts(), prompt: `<div style="font-size:2.6rem;font-weight:800">${esc(c.domain)}</div><div>Do jakiego kraju należy ta domena?</div>` };
  }

  async function startQuiz(o) {
    // o: { pool, n, types, cat, specs, title, lesson, key, mistakesMode }
    $('#quizSetup').classList.add('hidden'); $('#quizGame').classList.remove('hidden');
    $('#qQuestion').innerHTML = '<div class="loading">Przygotowuję pytania…</div>'; $('#qAnswers').innerHTML = ''; $('#qFeedback').innerHTML = ''; $('#qNext').classList.add('hidden');
    let specs = o.specs;
    if (!specs) {
      const types = Array.from({ length: o.n }, () => pick(o.types));
      const P = {}; let G = null;
      if (types.includes('photo')) {
        const need = shuffle(o.pool).slice(0, Math.min(o.pool.length, 25));
        await Promise.all(need.map(c => loadJSON(`data/plonk/${c.id}.json`).then(d => { P[c.id] = d; }).catch(() => {})));
        G = await loadJSON('data/gallery.json').catch(() => null);
        o.photoPool = need;
      }
      const used = new Set(); specs = [];
      for (const t of types) {
        let sp, tries = 0;
        do { sp = makeSpec(t, t === 'photo' ? o.photoPool : o.pool, o.cat || 'all', P, G); tries++; } while (used.has(specKey(sp)) && tries < 30);
        used.add(specKey(sp)); specs.push(sp);
      }
    }
    q.list = specs.map(sp => buildQ(sp, o.pool));
    Object.assign(q, { i: 0, score: 0, mistakes: [], opts: o });
    renderQ();
  }
  $('#qStart').onclick = () => {
    const region = $('#qRegion').value, type = $('#qType').value, cat = $('#qCat').value;
    const pool = C.filter(c => !c.minor && (region === 'all' || c.region === region));
    const types = type === 'mix' ? ['clue', 'clue', 'clue', 'photo', 'photo', 'flag', 'drive', 'domain'] : [type];
    startQuiz({ pool, n: +$('#qCount').value, types, cat, key: qKey() });
  };
  $('#qMistakes').onclick = () => {
    if (!mistakes.length) return;
    const specs = shuffle(mistakes).slice(0, 20);
    startQuiz({ pool: C.filter(c => !c.minor), specs, mistakesMode: true, title: 'Powtórka błędów' });
  };
  function renderQ() {
    const cur = q.list[q.i]; q.answered = false;
    $('#qProgress').textContent = `${q.opts.title ? q.opts.title + ' · ' : ''}Pytanie ${q.i + 1} / ${q.list.length}`;
    $('#qScore').textContent = `✅ ${q.score}`;
    $('#qBar').style.width = (q.i / q.list.length * 100) + '%';
    $('#qQuestion').innerHTML = cur.prompt;
    if (cur.spec.t === 'photo') bindLightbox($('#qQuestion'), [{ src: cur.spec.img, cap: '' }]);
    $('#qAnswers').innerHTML = cur.options.map((o, i) => `<button class="btn" data-o="${esc(o)}"><kbd>${i + 1}</kbd> ${esc(o)}</button>`).join('');
    $$('#qAnswers .btn').forEach(b => b.onclick = () => answerQ(b));
    $('#qFeedback').innerHTML = ''; $('#qNext').classList.add('hidden');
  }
  function answerQ(btn) {
    if (q.answered) return; q.answered = true;
    const cur = q.list[q.i], ok = btn.dataset.o === cur.answer;
    logActivity();
    $$('#qAnswers .btn').forEach(b => { b.disabled = true; if (b.dataset.o === cur.answer) b.classList.add('correct'); });
    if (ok) {
      q.score++; $('#qFeedback').innerHTML = '✅ Dobrze!';
      if (q.opts.mistakesMode) mistakes = mistakes.filter(m => specKey(m) !== cur.key);
    } else {
      btn.classList.add('wrong'); q.mistakes.push(cur);
      if (!mistakes.some(m => specKey(m) === cur.key)) mistakes = [cur.spec, ...mistakes].slice(0, 150);
      $('#qFeedback').innerHTML = `❌ Poprawnie: <b>${esc(cur.answer)}</b> · <a href="#kraj/${cur.country.id}">karta kraju</a>`;
    }
    store.set('mistakes', mistakes);
    $('#qScore').textContent = `✅ ${q.score}`;
    $('#qNext').classList.remove('hidden');
    const ex = document.createElement('div'); ex.className = 'qex'; $('#qFeedback').appendChild(ex);
    if (cur.spec.t === 'photo') {
      if (cur.spec.cap) ex.innerHTML = `<div class="qex-title">Co tu widać</div><div class="qex-cap">${txt(cur.spec.cap)}${mapLink(cur.spec.map)}</div>`;
      return;
    }
    const qi = q.i;
    ex.innerHTML = '<div class="qex-title muted">Szukam przykładu…</div>';
    examplesFor(cur.country, cur.k, cur.v).then(list => { if (q.i === qi && ex.isConnected) renderExamples(ex, list); });
  }
  $('#qNext').onclick = () => {
    q.i++;
    if (q.i < q.list.length) return renderQ();
    const o = q.opts, pct = Math.round(q.score / q.list.length * 100);
    let extra = '';
    if (o.key) {
      const best = store.get('best', {}); const record = best[o.key] == null || pct > best[o.key];
      if (record) { best[o.key] = pct; store.set('best', best); extra = ' · 🏆 Nowy rekord!'; }
    }
    if (o.lesson) {
      const L = store.get('lessons', {}); L[o.lesson] = Math.max(L[o.lesson] || 0, pct); store.set('lessons', L);
      extra = pct >= 80 ? ' · ✅ Lekcja zaliczona!' : ' · Do zaliczenia potrzeba 80%';
    }
    $('#qBar').style.width = '100%';
    $('#qAnswers').innerHTML = ''; $('#qFeedback').innerHTML = ''; $('#qNext').classList.add('hidden');
    const uniq = [...new Map(q.mistakes.map(m => [m.country.id, m.country])).values()];
    const next = o.lesson ? nextLesson(o.lesson) : null;
    $('#qQuestion').innerHTML = `<div class="result">
      <div class="score">${pct}%</div>
      <div>${q.score} / ${q.list.length}${extra}</div>
      ${uniq.length ? `<p><b>Do powtórki:</b></p><div class="flaglist" style="justify-content:center">${uniq.map(c => `<a href="#kraj/${c.id}">${flag(c.id, 'sm')}${esc(c.name)}</a>`).join('')}</div><p class="muted small">Błędne pytania trafiły do „Moje błędy”.</p>` : '<p>Bezbłędnie! 🎉</p>'}
      <p class="result-actions"><button class="btn primary" id="qAgain">Jeszcze raz</button>
      ${o.lesson ? `<a class="btn" href="#lekcja/${o.lesson}">↩ Wróć do lekcji</a>${pct >= 80 && next ? `<a class="btn primary" href="#lekcja/${next.id}">Następna lekcja ➜</a>` : ''}` : '<button class="btn" id="qBack">Ustawienia</button>'}
      <a class="btn" href="#nauka">🎓 Nauka</a></p>
    </div>`;
    $('#qAgain').onclick = () => startQuiz(o.specs && !o.mistakesMode ? o : { ...o, specs: o.mistakesMode ? shuffle(mistakes).slice(0, 20) : null });
    if ($('#qBack')) $('#qBack').onclick = () => { $('#quizGame').classList.add('hidden'); $('#quizSetup').classList.remove('hidden'); bestTxt(); };
  };

  // ═════════ NAUKA: ścieżka i panel ═════════
  const LESSON_REGIONS = ['Europa', 'Ameryka Płn.', 'Ameryka Płd.', 'Azja', 'Oceania', 'Afryka'];
  // grupy krajów, które łatwo pomylić — uczysz się je odróżniać
  const GROUPS = [
    ['Europa', 'Polska i sąsiedzi', 'pl cz sk de lt'], ['Europa', 'Europa Zachodnia', 'fr be nl lu ch at'], ['Europa', 'Wyspy Brytyjskie i Iberia', 'gb ie es pt ad im'],
    ['Europa', 'Skandynawia', 'se no fi dk is fo'], ['Europa', 'Bałtyk i Wschód', 'ee lv ru ua by'], ['Europa', 'Bałkany Zachodnie', 'si hr rs me mk al'],
    ['Europa', 'Południowy Wschód', 'hu ro bg gr tr cy'], ['Europa', 'Włochy i Śródziemnomorze', 'it mt sm mc gi li'],
    ['Ameryka Płn.', 'USA i Kanada', 'us ca'], ['Ameryka Płn.', 'Meksyk, Ameryka Środkowa i Karaiby', 'mx gt cr pa do pr'],
    ['Ameryka Płd.', 'Południe kontynentu', 'br ar uy cl'], ['Ameryka Płd.', 'Andy', 'co ec pe bo'],
    ['Azja', 'Azja Wschodnia', 'jp kr tw hk mo cn'], ['Azja', 'Azja Południowo-Wschodnia', 'th kh la vn'], ['Azja', 'Wyspy i Półwysep Malajski', 'id my sg ph'],
    ['Azja', 'Subkontynent indyjski', 'in bd lk np bt pk'], ['Azja', 'Bliski Wschód', 'il jo lb ae qa om'], ['Azja', 'Azja Centralna', 'mn kz kg'],
    ['Oceania', 'Australia i Nowa Zelandia', 'au nz'],
    ['Afryka', 'Południe Afryki', 'za ls sz bw na'], ['Afryka', 'Afryka Wschodnia', 'ke ug rw tz mg'], ['Afryka', 'Afryka Zachodnia i Północna', 'ng gh sn ml tn eg'],
  ];
  const LESSONS = [];
  const used = new Set();
  for (const [r, title, ids] of GROUPS) {
    const cs = ids.split(' ').map(id => byId[id]).filter(c => c && !c.minor && c.region === r && !used.has(c.id));
    if (cs.length < 2) continue;
    cs.forEach(c => used.add(c.id));
    LESSONS.push({ id: fold(title).replace(/[^a-z]/g, '').slice(0, 24), region: r, title, countries: cs });
  }
  for (const r of LESSON_REGIONS) { // reszta, której nie ma w grupach
    const rest = C.filter(c => c.region === r && !c.minor && !used.has(c.id));
    for (let i = 0; i < rest.length; i += 5) LESSONS.push({ id: fold(r).replace(/[^a-z]/g, '') + 'x' + i, region: r, title: `${r} — pozostałe`, countries: rest.slice(i, i + 5) });
  }
  LESSONS.sort((a, b) => LESSON_REGIONS.indexOf(a.region) - LESSON_REGIONS.indexOf(b.region));
  LESSONS.forEach((l, i) => { l.n = LESSONS.filter((x, j) => j <= i && x.region === l.region).length; });
  const lessonById = Object.fromEntries(LESSONS.map(l => [l.id, l]));
  const nextLesson = id => LESSONS[LESSONS.findIndex(l => l.id === id) + 1];
  const lessonPct = id => store.get('lessons', {})[id];

  function renderNauka() {
    const t = act[today()] || 0, st = streak();
    const dueCount = allCards.filter(x => isDue(x.id)).length;
    const L = store.get('lessons', {});
    const nextL = LESSONS.find(l => !(L[l.id] >= 80)) || LESSONS[0];
    const doneL = LESSONS.filter(l => L[l.id] >= 80).length;
    const regionStats = REGIONS.map(r => {
      const cards = allCards.filter(x => x.c.region === r); const m = cards.filter(x => mastered(x.id)).length;
      return `<div class="rstat"><span>${r}</span><div class="progress"><div style="width:${cards.length ? m / cards.length * 100 : 0}%"></div></div><small>${m}/${cards.length}</small></div>`;
    }).join('');
    const days = Array.from({ length: 14 }, (_, i) => today() - 13 + i).map(d => `<span class="day ${act[d] >= GOAL ? 'full' : act[d] ? 'some' : ''}" title="${act[d] || 0} odpowiedzi"></span>`).join('');
    $('#v-nauka').innerHTML = `
      <div class="hero hero-sm">
        <h1>Cześć! Gotowy na trening? 🌍</h1>
        <div class="stats4">
          <div class="stat"><b>🔥 ${st}</b><small>${st === 1 ? 'dzień' : 'dni'} z rzędu</small></div>
          <div class="stat"><b>${t}/${GOAL}</b><small>dzisiejszy cel</small><div class="progress light"><div style="width:${Math.min(100, t / GOAL * 100)}%"></div></div></div>
          <div class="stat"><b>🔁 ${dueCount}</b><small>do powtórki</small></div>
          <div class="stat"><b>🎓 ${doneL}/${LESSONS.length}</b><small>lekcji zaliczonych</small></div>
        </div>
        <div class="days" title="Ostatnie 14 dni">${days}</div>
      </div>
      <div class="actions-grid">
        <a class="action big" href="#lekcja/${nextL.id}"><span class="ai">▶️</span><b>Kontynuuj ścieżkę</b><small>Lekcja: ${esc(nextL.title)} — ${nextL.countries.map(c => esc(c.name)).join(', ')}</small></a>
        <button class="action" id="goReview"><span class="ai">🔁</span><b>Powtórki na dziś</b><small>${dueCount ? dueCount + ' kart czeka' : 'brak zaległych — weź nowe karty'}</small></button>
        <button class="action" id="goPhoto"><span class="ai">📸</span><b>Zgadnij ze zdjęcia</b><small>10 zdjęć jak w GeoGuessr</small></button>
        <button class="action" id="goMix"><span class="ai">🎲</span><b>Szybki quiz</b><small>10 mieszanych pytań</small></button>
        <button class="action" id="goMistakes" ${mistakes.length ? '' : 'disabled'}><span class="ai">❌</span><b>Moje błędy</b><small>${mistakes.length ? mistakes.length + ' do poprawy' : 'brak — tak trzymaj!'}</small></button>
      </div>
      <h2 class="vtitle">Ścieżka nauki</h2>
      <p class="lead">Każda lekcja to grupa krajów, które łatwo ze sobą pomylić. Przejrzyj karty, przećwicz fiszki i zalicz test (80%) — nauczysz się je odróżniać.</p>
      ${LESSON_REGIONS.map(r => `<h3 class="region-title">${r}</h3><div class="lessons">${LESSONS.filter(l => l.region === r).map(l => {
        const pc = L[l.id]; const st = pc >= 80 ? 'done' : pc != null ? 'tried' : l.id === nextL.id ? 'next' : '';
        return `<a class="lesson ${st}" href="#lekcja/${l.id}"><div class="lnum">${pc >= 80 ? '✓' : l.n}</div><div class="lbody"><b class="ltitle">${esc(l.title)}</b><div class="lflags">${l.countries.map(c => flag(c.id, 'sm')).join('')}</div><small>${l.countries.map(c => esc(c.name)).join(', ')}</small></div>${pc != null ? `<span class="lpct">${pc}%</span>` : ''}</a>`;
      }).join('')}</div>`).join('')}
      <h2 class="vtitle">Opanowanie wskazówek</h2>
      <div class="card rstats">${regionStats}<p class="muted small">Wskazówka jest opanowana po 3 poprawnych powtórkach w fiszkach.</p></div>`;
    $('#goReview').onclick = () => { fc.only = null; fc.extra = false; Object.assign(fcSet, { region: 'all', cat: 'all', mode: 'clue' }); $('#fcRegion').value = 'all'; $('#fcCat').value = 'all'; $('#fcMode').value = 'clue'; location.hash = 'fiszki'; fcNext(); };
    $('#goPhoto').onclick = () => { location.hash = 'quiz'; startQuiz({ pool: C.filter(c => !c.minor), n: 10, types: ['photo'], title: 'Zdjęcia' }); };
    $('#goMix').onclick = () => { location.hash = 'quiz'; startQuiz({ pool: C.filter(c => !c.minor), n: 10, types: ['clue', 'clue', 'photo', 'flag', 'drive'], title: 'Szybki quiz' }); };
    $('#goMistakes').onclick = () => { location.hash = 'quiz'; $('#qMistakes').click(); };
  }

  function renderLesson(id) {
    const l = lessonById[id], pc = lessonPct(id), i = LESSONS.indexOf(l);
    const prev = LESSONS[i - 1], next = LESSONS[i + 1];
    $('#v-lekcja').innerHTML = `
      <a class="back" href="#nauka">← Nauka</a>
      <div class="cp-head lesson-head"><div><div class="tags"><span class="tag">${l.region}</span><span class="tag">lekcja ${l.n}</span>${pc != null ? `<span class="tag ${pc >= 80 ? 'd1' : ''}">wynik ${pc}%</span>` : ''}</div>
        <h1>${esc(l.title)}</h1><p class="cp-summary">${l.countries.length} krajów. Krok 1: poznaj je. Krok 2: fiszki. Krok 3: test (80% = zaliczone).</p></div></div>
      <h3 class="phead">① Poznaj kraje</h3>
      <div class="lcountries">${l.countries.map(c => `<a class="lcard" href="#kraj/${c.id}">${flag(c.id, 'lg')}<div><b>${esc(c.name)}</b><p>${esc(c.summary)}</p>${(c.tips || []).slice(0, 2).map(t => `<div class="tip small">💡 ${esc(t)}</div>`).join('')}<span class="more">Otwórz kartę ze zdjęciami →</span></div></a>`).join('')}</div>
      <h3 class="phead">② Przećwicz</h3>
      <div class="actions-grid">
        <button class="action" id="lFc"><span class="ai">🃏</span><b>Fiszki z lekcji</b><small>wskazówka → kraj</small></button>
        <button class="action" id="lPhoto"><span class="ai">📸</span><b>Zdjęcia z lekcji</b><small>10 zdjęć z tych krajów</small></button>
      </div>
      <h3 class="phead">③ Sprawdź się</h3>
      <button class="btn primary big" id="lTest">🎯 Test lekcji — 12 pytań</button>
      <div class="cp-nav">${prev ? `<a href="#lekcja/${prev.id}">← ${esc(prev.title)}</a>` : '<span></span>'}${next ? `<a class="next" href="#lekcja/${next.id}">${esc(next.title)} →</a>` : ''}</div>`;
    const ids = l.countries.map(c => c.id);
    $('#lFc').onclick = () => { fc.only = ids; fc.extra = true; fcSet.mode = 'clue'; $('#fcMode').value = 'clue'; location.hash = 'fiszki'; fcNext(); };
    $('#lPhoto').onclick = () => { location.hash = 'quiz'; startQuiz({ pool: l.countries, n: 10, types: ['photo'], title: l.title }); };
    $('#lTest').onclick = () => { location.hash = 'quiz'; startQuiz({ pool: l.countries, n: 12, types: ['clue', 'clue', 'clue', 'photo', 'photo'], title: `Test: ${l.title}`, lesson: id }); };
  }

  // ═════════ MOJE (prywatne, za logowaniem) ═════════
  const api = (path, opts = {}) => fetch('/api' + path, { credentials: 'same-origin', headers: { 'content-type': 'application/json' }, ...opts })
    .then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(d.error || r.status), { status: r.status }); return d; });
  let mojeCache = null;

  function importujBledy(rundy) {
    let dodane = 0;
    for (const r of rundy) {
      if (r.trafiony_kraj || !r.zagadka || !byId[r.poprawny_kod]) continue;
      const sp = { t: 'clue', c: r.poprawny_kod, k: 'inne', v: r.zagadka };
      if (!mistakes.some(m => specKey(m) === specKey(sp))) { mistakes.unshift(sp); dodane++; }
    }
    mistakes = mistakes.slice(0, 200); store.set('mistakes', mistakes);
    return dodane;
  }

  function renderMoje() {
    const v = $('#v-moje');
    v.innerHTML = '<div class="loading">Sprawdzam logowanie…</div>';
    api('/me').then(d => d.zalogowany ? renderMojeDane() : renderLogin()).catch(e => {
      v.innerHTML = `<a class="back" href="#nauka">← Nauka</a><div class="card setup"><h2>🔒 Prywatna sekcja</h2><p class="muted">${e.status === 503 ? esc(e.message) : 'Prywatna sekcja działa tylko na stronie wdrożonej na Cloudflare Pages (z funkcjami i KV).'}</p></div>`;
    });
  }
  function renderLogin() {
    const v = $('#v-moje');
    v.innerHTML = `<a class="back" href="#nauka">← Nauka</a>
      <form class="card setup" id="loginForm"><h2>🔒 Zaloguj się</h2>
        <p class="muted small">Prywatna sekcja z rundami z GeoMeta Asystenta.</p>
        <label>Login <input name="user" autocomplete="username" required></label>
        <label>Hasło <input name="pass" type="password" autocomplete="current-password" required></label>
        <button class="btn primary big">Zaloguj</button><p class="muted small" id="loginErr"></p></form>`;
    $('#loginForm').onsubmit = e => {
      e.preventDefault();
      const f = new FormData(e.target);
      api('/login', { method: 'POST', body: JSON.stringify({ user: f.get('user'), pass: f.get('pass') }) })
        .then(() => renderMojeDane()).catch(err => { $('#loginErr').textContent = '❌ ' + err.message; });
    };
  }
  function renderMojeDane() {
    const v = $('#v-moje');
    v.innerHTML = '<div class="loading">Wczytuję twoje rundy…</div>';
    api('/rundy').then(({ rundy }) => {
      mojeCache = rundy;
      const dodane = importujBledy(rundy);
      const traf = rundy.filter(r => r.trafiony_kraj).length;
      const kraje = {};
      for (const r of rundy) { const k = kraje[r.poprawny_kod] = kraje[r.poprawny_kod] || { n: 0, ok: 0, name: r.poprawny_kraj }; k.n++; if (r.trafiony_kraj) k.ok++; }
      const najg = Object.entries(kraje).sort((a, b) => a[1].ok / a[1].n - b[1].ok / b[1].n || b[1].n - a[1].n).slice(0, 8);
      const lb = [];
      v.innerHTML = `<a class="back" href="#nauka">← Nauka</a>
        <div class="hero hero-sm"><h1>🔒 Moje rundy</h1>
          <div class="stats4">
            <div class="stat"><b>${rundy.length}</b><small>rund z Asystenta</small></div>
            <div class="stat"><b>${rundy.length ? Math.round(traf / rundy.length * 100) : 0}%</b><small>trafiony kraj</small></div>
            <div class="stat"><b>${mistakes.length}</b><small>w „Moje błędy”${dodane ? ` (+${dodane} nowe)` : ''}</small></div>
            <div class="stat"><button class="btn" id="logout">Wyloguj</button></div>
          </div></div>
        ${najg.length ? `<h3 class="phead">Najczęściej mylone kraje</h3><div class="flaglist">${najg.map(([id, k]) => `<a href="#kraj/${esc(id)}">${byId[id] ? flag(id, 'sm') : ''}${esc(k.name)} ${k.ok}/${k.n}</a>`).join('')}</div>` : ''}
        <div class="actions-grid" style="margin-top:14px"><button class="action" id="mojeQuiz" ${mistakes.length ? '' : 'disabled'}><span class="ai">❌</span><b>Powtórz moje błędy</b><small>quiz z rund, w których nie trafiłeś</small></button></div>
        <h3 class="phead">Historia</h3>
        <div class="moje-list">${rundy.map(r => `<div class="mr ${r.trafiony_kraj ? 'ok' : 'zle'}">
          <div class="mr-h">${byId[r.poprawny_kod] ? flag(r.poprawny_kod, 'sm') : ''}<b>${esc(r.poprawny_kraj)}</b><span class="muted small">${esc(r.miejsce || '')}</span>
            <span class="mr-s">${r.trafiony_kraj ? '✅ trafiony' : '❌ ' + esc(r.twoj_strzal || '')}</span>
            <small class="muted">${esc((r.czas || '').replace('T', ' ').slice(0, 16))}</small>
            <button class="link" data-del="${esc(r.id)}">usuń</button></div>
          <div class="ggrid">${Array.from({ length: r.obrazy || 0 }, (_, i) => { lb.push({ src: `/api/img/${r.id}/${i}`, cap: r.lekcja }); return `<button class="gthumb" data-lb="${lb.length - 1}"><img src="/api/img/${esc(r.id)}/${i}" alt="" loading="lazy"></button>`; }).join('')}</div>
          <p>${esc(r.lekcja)}</p>${(r.przeoczone || []).length ? `<ul>${r.przeoczone.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        </div>`).join('') || '<div class="empty">Brak rund. Uruchom GeoMeta Asystenta i po rundzie naciśnij F10.</div>'}</div>`;
      bindLightbox(v, lb);
      $('#logout').onclick = () => api('/logout').then(renderLogin);
      $('#mojeQuiz').onclick = () => { location.hash = 'quiz'; $('#qMistakes').click(); };
      v.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { if (confirm('Usunąć tę rundę?')) api('/rundy/' + b.dataset.del, { method: 'DELETE' }).then(renderMojeDane); });
    }).catch(e => { if (e.status === 401) renderLogin(); else v.innerHTML = `<div class="empty">Błąd: ${esc(e.message)}</div>`; });
  }

  // ── klawiatura ──
  document.addEventListener('keydown', e => {
    if (e.target.matches('input, select, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (!lbEl.classList.contains('hidden')) {
      if (e.key === 'Escape') lbClose(); else if (e.key === 'ArrowLeft') lbMove(-1); else if (e.key === 'ArrowRight') lbMove(1);
      return;
    }
    const v = (location.hash.slice(1) || 'nauka').split('/')[0];
    if (v === 'fiszki') {
      if (e.code === 'Space') { e.preventDefault(); fcFlip(); }
      else if (e.key === '1' || e.key === 'ArrowLeft') fcAnswer(false);
      else if (e.key === '2' || e.key === 'ArrowRight') fcAnswer(true);
    } else if (v === 'quiz' && !$('#quizGame').classList.contains('hidden')) {
      const btns = $$('#qAnswers .btn'), n = parseInt(e.key, 10);
      if (n >= 1 && n <= btns.length && !q.answered) answerQ(btns[n - 1]);
      else if ((e.key === 'Enter' || e.code === 'Space') && q.answered && document.activeElement?.id !== 'qNext') { e.preventDefault(); $('#qNext').click(); }
    } else if (v === 'kraj') {
      if (e.key === 'ArrowLeft') $('.cp-nav a:not(.next)')?.click();
      if (e.key === 'ArrowRight') $('.cp-nav .next')?.click();
    } else if (v === 'kraje' && e.key === '/') { e.preventDefault(); $('#search').focus(); }
  });

  // ── start ──
  renderGrid(); renderCompare(); renderGuides(); bestTxt();
  if (!location.hash) location.replace('#' + store.get('tab', 'nauka'));
  route();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
