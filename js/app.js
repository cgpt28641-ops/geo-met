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
    const [view, arg, ...rest] = h.split('/');
    if (currentRoute) scrollPos[currentRoute] = scrollY;
    const tab = view === 'kraj' ? 'kraje' : ['lekcja', 'moje', 'gra', 'dzien'].includes(view) ? 'nauka' : view;
    if (view !== 'kraj') document.title = 'GeoMeta — meta GeoGuessr po polsku';
    $$('#tabs a').forEach(a => a.classList.toggle('active', a.dataset.tab === tab));
    $$('.view').forEach(v => v.classList.toggle('active', v.id === 'v-' + (view === 'dzien' ? 'gra' : view)));
    if (view === 'kraj' && byId[arg]) renderCountry(arg);
    else if (view === 'kraj') return (location.hash = 'kraje');
    if (view === 'nauka') renderNauka();
    if (view === 'moje') renderMoje();
    if (view === 'gra') renderGra();
    if (view === 'dzien') renderDzien();
    if (view === 'porownaj' && arg === 'vs') { cmpMode = 'vs'; if (byId[rest[0]]) vsA = rest[0]; vsB = byId[rest[1]] ? rest[1] : partnerOf(vsA, vsB); renderCompare(); }
    if (view === 'lekcja') { if (lessonById[arg]) renderLesson(arg); else return (location.hash = 'nauka'); }
    if (view === 'fiszki') fcNext();
    if (view === 'poradniki' && arg) { const d = document.getElementById('g-' + arg); if (d) { d.open = true; setTimeout(() => d.scrollIntoView({ block: 'start' }), 30); } }
    currentRoute = h;
    if (!(view === 'poradniki' && arg)) requestAnimationFrame(() => scrollTo(0, ['kraj', 'lekcja', 'quiz', 'moje', 'gra', 'dzien'].includes(view) ? 0 : (scrollPos[h] || 0)));
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
    if (filt.q && filt.q.length >= 3) hits += `<div class="deep"><button class="btn" id="deepBtn">🔎 Szukaj „${esc(filt.q)}” w ${'5000+'} opisach zdjęć</button><div id="deepRes"></div></div>`;
    $('#searchHits').innerHTML = hits;
    if ($('#deepBtn')) { $('#deepBtn').onclick = () => deepSearch(filt.q); if (deepIndex) deepSearch(filt.q); }
    renderCountryMap(ok);

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

  // ── wyszukiwanie w opisach zdjęć (Plonk It, ładowane na żądanie) ──
  let deepIndex = null, deepLoading = null;
  function loadDeepIndex(onProgress) {
    if (deepIndex) return Promise.resolve(deepIndex);
    if (deepLoading) return deepLoading;
    let done = 0;
    deepLoading = Promise.all(C.map(c => loadJSON(`data/plonk/${c.id}.json`).then(d => { onProgress && onProgress(++done); return d.items.map((it, i) => ({ c, i, step: it[0], head: it[1], imgs: it[2], map: it[3], t: it[4], f: fold(it[4] + ' ' + it[1]) })); }).catch(() => [])))
      .then(arrs => (deepIndex = arrs.flat()));
    return deepLoading;
  }
  function deepSearch(q) {
    const box = $('#deepRes'); if (!box) return;
    box.innerHTML = '<div class="loading">Wczytuję opisy… <span id="deepProg">0</span>/' + C.length + '</div>';
    loadDeepIndex(n => { const el = $('#deepProg'); if (el) el.textContent = n; }).then(idx => {
      if (filt.q !== q || !$('#deepRes')) return;
      const res = idx.filter(x => x.f.includes(q) && (filt.region === 'all' || x.c.region === filt.region));
      const lb = [];
      const snip = t => { const i = fold(t).indexOf(q); const a = Math.max(0, i - 80); return (a ? '…' : '') + t.slice(a, a + 260) + (t.length > a + 260 ? '…' : ''); };
      $('#deepRes').innerHTML = `<h3 class="region-title">W opisach zdjęć <span>${res.length}${res.length > 60 ? ' (pierwsze 60)' : ''}</span></h3>` + (res.length ? `<div class="pgrid">${res.slice(0, 60).map(x => {
        const pics = x.imgs.slice(0, 1).map(pth => { lb.push({ src: PLONK_IMG(pth, 1200), cap: `${x.c.name}: ${x.t}`, map: x.map }); return `<button class="pimg" data-lb="${lb.length - 1}"><img src="${esc(PLONK_IMG(pth))}" alt="" loading="lazy"></button>`; }).join('');
        return `<div class="pcard">${pics}<div class="ptext"><a class="gname" href="#kraj/${x.c.id}">${flag(x.c.id, 'sm')} ${esc(x.c.name)} <span>${['', 'rozpoznanie', 'regiony', 'szczegóły'][x.step]}${x.head ? ' · ' + esc(x.head) : ''}</span></a>${highlight(snip(x.t), q)}</div></div>`;
      }).join('')}</div>` : '<div class="empty">Brak wyników w opisach zdjęć.</div>');
      bindLightbox($('#deepRes'), lb);
    });
  }

  // ── mapa w zakładce Kraje ──
  let viewMode = store.get('vm', 'list'), countryMap = null;
  $$('[data-vm]').forEach(b => b.onclick = () => { viewMode = b.dataset.vm; store.set('vm', viewMode); renderGrid(); });
  function masteryOf(c) {
    if (learned.has(c.id)) return 3;
    const cards = allCards.filter(x => x.c === c);
    if (!cards.length) return 0;
    const m = cards.filter(x => mastered(x.id)).length / cards.length, seen = cards.filter(x => srs[x.id]).length;
    return m >= 0.5 ? 2 : seen ? 1 : 0;
  }
  function renderCountryMap(ok) {
    $$('[data-vm]').forEach(b => b.classList.toggle('active', b.dataset.vm === viewMode));
    const isMap = viewMode === 'map';
    $('#countryMapWrap').classList.toggle('hidden', !isMap);
    $('#countryGrid').classList.toggle('hidden', isMap);
    if (!isMap) return;
    const fill = code => { const c = byId[code]; if (!c) return null; return ok(c) ? `var(--m${masteryOf(c)})` : 'var(--m-off)'; };
    if (countryMap) { countryMap.fillFn = fill; countryMap.api.redraw(); return; }
    const el = $('#countryMap');
    el.innerHTML = '<div class="loading">Ładowanie mapy…</div>';
    GMMap.load().then(world => {
      const holder = { fillFn: fill };
      holder.api = GMMap.render(el, world, { fill: c => holder.fillFn(c), title: c => byId[c] ? byId[c].name : c, onCountry: c => { if (byId[c]) location.hash = 'kraj/' + c; } });
      countryMap = holder;
    }).catch(() => { el.innerHTML = '<div class="empty">Nie udało się wczytać mapy.</div>'; });
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
        <a class="btn" href="#porownaj/vs/${id}">🆚 Porównaj z…</a>
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
    $('#compareMode').innerHTML = `<button class="seg ${cmpMode === 'txt' ? 'active' : ''}" data-cm="txt">📝 Opisy</button><button class="seg ${cmpMode === 'img' ? 'active' : ''}" data-cm="img">🖼️ Zdjęcia</button><button class="seg ${cmpMode === 'vs' ? 'active' : ''}" data-cm="vs">🆚 Dwa kraje</button>`;
    $$('[data-cm]').forEach(b => b.onclick = () => { cmpMode = b.dataset.cm; store.set('cmpMode', cmpMode); renderCompare(); });
    if (cmpMode === 'img') return renderCompareImg();
    if (cmpMode === 'vs') return renderCompareVs();
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
  // pary krajów, które gracze najczęściej mylą
  const PAIRS = 'cz-sk se-no fi-ee lt-lv rs-hr si-hr hr-me bg-mk ua-ru ru-kz at-de de-ch be-nl fr-be es-pt it-gr hu-ro ro-bg pl-cz ie-gb br-pt ar-uy cl-ar co-ec pe-bo mx-gt us-ca au-nz za-bw za-ls ls-sz ke-ug ug-rw gh-ng sn-ml th-kh kh-la my-id id-ph jp-kr tw-hk in-bd in-lk il-jo ae-qa om-ae mn-kz kz-kg tr-cy'.split(' ').map(p => p.split('-'));
  let vsA = store.get('vsA', 'cz'), vsB = store.get('vsB', 'sk');
  function partnerOf(a, fallback) {
    const p = PAIRS.find(([x, y]) => x === a || y === a);
    if (p) return p[0] === a ? p[1] : p[0];
    if (fallback && fallback !== a) return fallback;
    const same = C.find(c => c.region === byId[a].region && c.id !== a && !c.minor);
    return same ? same.id : 'pl';
  }
  function renderCompareVs() {
    store.set('vsA', vsA); store.set('vsB', vsB);
    const opts = sel => C.filter(c => !c.minor || c.id === sel).map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
    $('#compareChips').innerHTML = `<div class="vs-pick"><select id="vsA">${opts(vsA)}</select><span class="vs-x">vs</span><select id="vsB">${opts(vsB)}</select></div>`;
    $('#compareRegions').innerHTML = '<span class="muted small">Często mylone:</span>' + PAIRS.map(([a, b]) => `<button class="chip ${a === vsA && b === vsB ? 'active' : ''}" data-pair="${a}-${b}">${esc(byId[a].name)} – ${esc(byId[b].name)}</button>`).join('');
    $('#vsA').onchange = e => { vsA = e.target.value; renderCompareVs(); };
    $('#vsB').onchange = e => { vsB = e.target.value; renderCompareVs(); };
    $$('[data-pair]').forEach(b => b.onclick = () => { [vsA, vsB] = b.dataset.pair.split('-'); renderCompareVs(); });
    const A = byId[vsA], B = byId[vsB];
    const col = (c, k) => (c.clues[k] || []).length ? `<ul>${c.clues[k].map(v => `<li>${esc(v)}</li>`).join('')}</ul>` : '<p class="muted small">— brak wskazówek —</p>';
    const facts = c => `${c.drive === 'L' ? '⬅️ lewostronny' : '➡️ prawostronny'} · ${esc(c.domain)} · ${esc(c.phone)}`;
    const rows = Object.keys(CATS).filter(k => (A.clues[k] || []).length || (B.clues[k] || []).length).map(k => `
      <div class="vs-row"><h3>${CATS[k].icon} ${CATS[k].label}</h3>
        <div class="vs-cols"><div><div class="vs-who">${flag(A.id, 'sm')} ${esc(A.name)}</div>${col(A, k)}</div><div><div class="vs-who">${flag(B.id, 'sm')} ${esc(B.name)}</div>${col(B, k)}</div></div></div>`).join('');
    $('#compareList').innerHTML = `<div class="vs-wrap">
      <div class="vs-head"><a href="#kraj/${A.id}">${flag(A.id, 'lg')}<b>${esc(A.name)}</b><small>${facts(A)}</small></a><span class="vs-x big">vs</span><a href="#kraj/${B.id}">${flag(B.id, 'lg')}<b>${esc(B.name)}</b><small>${facts(B)}</small></a></div>
      <div class="vs-tips">${[A, B].map(c => (c.tips || []).map(t => `<div class="tip small">💡 ${esc(t)}</div>`).join('')).join('')}</div>
      <button class="btn primary big" id="vsQuiz">🎯 Sprawdź się: rozróżnij ${esc(A.name)} i ${esc(B.name)} (10 pytań)</button>
      ${rows}</div>`;
    $('#vsQuiz').onclick = () => { location.hash = 'quiz'; startQuiz({ pool: [A, B], n: 10, types: ['clue', 'clue', 'photo'], title: `${A.name} vs ${B.name}` }); };
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
  // fiszki ze zdjęć: Plonk It (rozpoznanie) + galerie GeoHints
  const GAL_CAT = { bollards: 'slupki', licensePlates: 'tablice', utilityPoles: 'slupy', googleVehicles_cars: 'kamera', signs_chevrons: 'znaki', signs_stop: 'znaki', signs_yield: 'znaki', signs_pedestrian: 'znaki', signs_directions: 'znaki', signs_citySigns: 'znaki' };
  let photoCards = null, photoLoading = null;
  function buildPhotoCards() {
    if (photoLoading) return photoLoading;
    photoLoading = Promise.all([loadDeepIndex(), loadJSON('data/gallery.json').catch(() => ({}))]).then(([idx, G]) => {
      const cards = [];
      for (const x of idx) {
        if (x.step !== 1 || !x.imgs.length || x.i === 0 || (x.t || '').length < 25 || x.c.minor) continue;
        cards.push({ id: 'ph:' + x.imgs[0], c: x.c, k: null, img: PLONK_IMG(x.imgs[0], 900), cap: x.t, lab: 'Plonk It' });
      }
      for (const [g, k] of Object.entries(GAL_CAT)) {
        const per = {};
        for (const [code, img, , note] of G[g] || []) {
          const c = byId[code]; if (!c || c.minor) continue;
          per[code] = (per[code] || 0) + 1; if (per[code] > 4) continue;
          cards.push({ id: 'gh:' + img, c, k, img: GH_IMG(img), cap: `${GAL[g][1]}${note ? ' · ' + note : ''}`, lab: GAL[g][1] });
        }
      }
      photoCards = cards;
    });
    return photoLoading;
  }

  function deck() {
    if (fcSet.mode === 'photo') return photoCards ? photoCards.filter(x => inScope(x.c) && (fcSet.cat === 'all' || x.k === fcSet.cat)) : null;
    if (fcSet.mode === 'country') {
      return C.filter(c => !c.minor && inScope(c))
        .filter(c => fcSet.cat === 'all' || (c.clues[fcSet.cat] || []).length)
        .map(c => ({ id: `country:${c.id}:${fcSet.cat}`, c, k: fcSet.cat }));
    }
    return allCards.filter(x => inScope(x.c) && (fcSet.cat === 'all' || x.k === fcSet.cat));
  }

  function fcNext() {
    const d = deck();
    if (d === null) {
      fc.card = null; $('#flashcard').classList.remove('flipped');
      $('#fcFront').innerHTML = '<div class="loading">Wczytuję zdjęcia do fiszek…</div>'; $('#fcBack').innerHTML = '';
      buildPhotoCards().then(fcNext).catch(() => { $('#fcFront').innerHTML = '<div class="muted">Nie udało się wczytać zdjęć.</div>'; });
      return;
    }
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
    if (fcSet.mode === 'photo') {
      $('#fcFront').innerHTML = `${badge}<div class="fc-cat">📸 ${esc(card.k ? CATS[card.k].label : 'Zdjęcie ze wskazówką')}</div><img class="fc-photo" src="${esc(card.img)}" alt="" onerror="this.replaceWith(document.createTextNode('(zdjęcie niedostępne)'))"><div class="fc-hint">Jaki to kraj? Stuknij, aby odwrócić</div>`;
      $('#fcBack').innerHTML = `${flag(card.c.id, 'lg')}<div style="font-size:1.4rem;font-weight:800">${esc(card.c.name)}</div><div class="fc-cap">${txt(card.cap || '')}</div>`;
    } else if (fcSet.mode === 'clue') {
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
        <a class="action big game" href="#gra"><span class="ai">🎮</span><b>Zagraj jak w GeoGuessr</b><small>5 zdjęć · zgaduj na mapie · do 25 000 pkt${store.get('graBest', null) != null ? ` · rekord ${store.get('graBest')}` : ''}</small></a>
        <a class="action daily" href="#dzien"><span class="ai">📅</span><b>Wyzwanie dnia</b><small>${store.get('dailyDone', {})[dzisiaj()] ? `✅ dziś: ${fmt(store.get('dailyDone', {})[dzisiaj()].score)} pkt — zobacz ranking` : 'te same 5 zdjęć dla wszystkich · ranking znajomych'}</small></a>
        <button class="action" id="goPhoto"><span class="ai">📸</span><b>Zgadnij ze zdjęcia</b><small>10 zdjęć, 4 odpowiedzi</small></button>
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

  // ═════════ GRA: zgadywanie na mapie (punkty jak w GeoGuessr) ═════════
  // tryby: 'foto' (zdjęcia wskazówek), 'ulice' (prawdziwe panoramy Mapillary), 'dzien' (wyzwanie dnia)
  const gra = { rounds: [], i: 0, total: 0, guess: null, answered: false, mode: 'foto', src: store.get('graSrc', 'foto'), region: store.get('graRegion', 'all'), api: null, viewer: null };
  const graScore = km => km <= 0.025 ? 5000 : Math.round(5000 * Math.exp(-km / 1492.7));
  const fmt = n => n.toLocaleString('pl-PL');

  // ── klucz Mapillary: lokalny (ustawienia) albo z Cloudflare (/api/config) ──
  let mlyConfig = null;
  async function mlyToken() {
    const local = store.get('mlyToken', '');
    if (local) return local;
    if (!mlyConfig) mlyConfig = fetch('/api/config').then(r => r.ok ? r.json() : {}).catch(() => ({}));
    return (await mlyConfig).mapillary || '';
  }
  let mlyLib = null;
  function loadMapillary() {
    if (mlyLib) return mlyLib;
    mlyLib = new Promise((res, rej) => {
      const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'js/vendor/mapillary.css'; document.head.appendChild(css);
      const sc = document.createElement('script'); sc.src = 'js/vendor/mapillary.js'; sc.onload = () => res(window.mapillary); sc.onerror = rej; document.head.appendChild(sc);
    });
    return mlyLib;
  }
  function randomPointIn(world, code) {
    const feats = world.byCode[code] || [];
    if (!feats.length) return world.punkty[code] || null;
    const f = pick(feats.length > 1 ? feats.sort((a, b) => d3.geoArea(b) - d3.geoArea(a)).slice(0, 2) : feats);
    const [[x0, y0], [x1, y1]] = d3.geoBounds(f);
    for (let t = 0; t < 60; t++) {
      const lon = x0 <= x1 ? x0 + Math.random() * (x1 - x0) : x0 + Math.random() * (x1 + 360 - x0);
      const p = [lon > 180 ? lon - 360 : lon, y0 + Math.random() * (y1 - y0)];
      if (d3.geoContains(f, p)) return p;
    }
    return d3.geoCentroid(f);
  }
  // ── minimalny dekoder kafelków wektorowych (MVT) — tylko to, czego potrzebujemy z mapy pokrycia Mapillary ──
  function decodeMvt(buf) {
    const u8 = new Uint8Array(buf); let pos = 0;
    const varint = () => { let r = 0, m = 1, b; do { b = u8[pos++]; r += (b & 0x7f) * m; m *= 128; } while (b & 0x80); return r; };
    const skip = w => { if (w === 0) varint(); else if (w === 1) pos += 8; else if (w === 2) { const l = varint(); pos += l; } else if (w === 5) pos += 4; };
    const str = (s, e) => new TextDecoder().decode(u8.subarray(s, e));
    const layers = {};
    while (pos < u8.length) {
      const tag = varint();
      if (tag >> 3 !== 3 || (tag & 7) !== 2) { skip(tag & 7); continue; }
      const end = varint() + pos, L = { name: '', keys: [], values: [], feats: [], extent: 4096 };
      while (pos < end) {
        const t = varint(), f = t >> 3, w = t & 7;
        if (f === 1) { const l = varint(); L.name = str(pos, pos + l); pos += l; }
        else if (f === 3) { const l = varint(); L.keys.push(str(pos, pos + l)); pos += l; }
        else if (f === 5) L.extent = varint();
        else if (f === 4) {
          const vend = varint() + pos; let val = null;
          while (pos < vend) {
            const vt = varint(), vf = vt >> 3;
            if (vf === 1) { const l = varint(); val = str(pos, pos + l); pos += l; }
            else if (vf === 2) { val = new DataView(u8.buffer, u8.byteOffset + pos, 4).getFloat32(0, true); pos += 4; }
            else if (vf === 3) { val = new DataView(u8.buffer, u8.byteOffset + pos, 8).getFloat64(0, true); pos += 8; }
            else if (vf === 4 || vf === 5) val = varint();
            else if (vf === 6) { const n = varint(); val = n % 2 ? -(n + 1) / 2 : n / 2; }
            else if (vf === 7) val = !!varint();
            else skip(vt & 7);
          }
          L.values.push(val);
        } else if (f === 2) {
          const fend = varint() + pos, F = { tags: [], geom: [] };
          while (pos < fend) {
            const ft = varint(), ff = ft >> 3;
            if (ff === 2 || ff === 4) { const pend = varint() + pos; const arr = ff === 2 ? F.tags : F.geom; while (pos < pend) arr.push(varint()); }
            else skip(ft & 7);
          }
          L.feats.push(F);
        } else skip(w);
      }
      L.feature = i => {
        const F = L.feats[i], props = {};
        for (let k = 0; k < F.tags.length; k += 2) props[L.keys[F.tags[k]]] = L.values[F.tags[k + 1]];
        // pierwszy punkt geometrii (MoveTo)
        const zz = n => (n >> 1) ^ -(n & 1);
        const first = F.geom.length >= 3 ? [zz(F.geom[1]), zz(F.geom[2])] : null;
        return { props, first };
      };
      layers[L.name] = L;
    }
    return layers;
  }
  const tileOf = (lon, lat, z) => { const n = 2 ** z; return [Math.floor((lon + 180) / 360 * n), Math.floor((1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * n)]; };
  const tileToLonLat = (z, x, y, px, py, ext) => { const n = 2 ** z, lon = (x + px / ext) / n * 360 - 180; const yy = Math.PI * (1 - 2 * (y + py / ext) / n); return [lon, Math.atan(Math.sinh(yy)) * 180 / Math.PI]; };
  const withTimeout = (url, ms = 7000) => { const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms); return fetch(url, { signal: ac.signal }).finally(() => clearTimeout(t)); };

  async function findStreet(world, pool, token) {
    const tryOne = async () => {
      const c = pick(pool), p = randomPointIn(world, c.id);
      if (!p) return null;
      const z = 10, [x, y] = tileOf(p[0], p[1], z);
      let res;
      try { res = await withTimeout(`https://tiles.mapillary.com/maps/vtp/mly1_public/2/${z}/${x}/${y}?access_token=${encodeURIComponent(token)}`); }
      catch { return null; }
      if (res.status === 401 || res.status === 403) throw new Error('Zły klucz Mapillary.');
      if (!res.ok) return null;
      const seq = decodeMvt(await res.arrayBuffer()).sequence;
      if (!seq || !seq.feats.length) return null;
      const all = seq.feats.map((_, i) => seq.feature(i)).filter(f => f.props.image_id && f.first);
      const best = all.filter(f => f.props.is_pano && !f.props.foot), car = all.filter(f => !f.props.foot);
      const f = pick(best.length ? best : car.length ? car : all);
      if (!f) return null;
      const ll = tileToLonLat(z, x, y, f.first[0], f.first[1], seq.extent);
      const real = world.features.find(ft => ft.properties.c && d3.geoContains(ft, ll));
      return { t: 'ulice', id: String(f.props.image_id), ll, c: real ? real.properties.c : c.id, pano: !!f.props.is_pano };
    };
    for (let batch = 0; batch < 6; batch++) {
      const got = (await Promise.all([tryOne(), tryOne(), tryOne(), tryOne()])).filter(Boolean);
      if (got.length) return got.find(g => g.pano) || got[0];
    }
    throw new Error('Nie udało się znaleźć zdjęć ulicznych — spróbuj jeszcze raz.');
  }

  function renderGra() {
    const v = $('#v-gra');
    if (gra.rounds.length && gra.mode !== 'dzien') return renderGraRound();
    gra.rounds = [];
    v.innerHTML = `<a class="back" href="#nauka">← Nauka</a>
      <div class="card setup"><h2>🎮 Zagraj jak w GeoGuessr</h2>
        <div class="segs" id="graSrc"><button class="seg ${gra.src === 'foto' ? 'active' : ''}" data-src="foto">📸 Zdjęcia wskazówek</button><button class="seg ${gra.src === 'ulice' ? 'active' : ''}" data-src="ulice">🌐 Prawdziwe ulice</button></div>
        <p class="muted" id="graDesc"></p>
        <div id="graMly"></div>
        <label>Region <select id="graRegion">${`<option value="all">Cały świat</option>` + REGIONS.map(r => `<option ${r === gra.region ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
        <button class="btn primary big" id="graStart">Start — 5 rund ➜</button>
        <p class="muted small">${store.get('graBest', null) != null ? `🏆 Rekord (zdjęcia): ${fmt(store.get('graBest'))} · ` : ''}${store.get('graBestU', null) != null ? `🏆 Rekord (ulice): ${fmt(store.get('graBestU'))} · ` : ''}Mapę przybliżasz kółkiem myszy, dwoma palcami albo przyciskami +/−.</p>
        <a class="btn" href="#dzien">📅 Wyzwanie dnia ze znajomymi</a></div>`;
    const desc = () => {
      $('#graDesc').textContent = gra.src === 'foto'
        ? 'Dostajesz zdjęcie prawdziwej wskazówki (słupek, znak, tablica, krajobraz). Trafiony kraj = 5000 pkt, im dalej od granicy, tym mniej.'
        : 'Prawdziwe zdjęcia uliczne (często 360°) z losowego miejsca — rozglądaj się, chodź po drodze strzałkami. Punkty liczone od dokładnego miejsca, jak w GeoGuessr.';
      mlyToken().then(tok => {
        const box = $('#graMly'); if (!box) return;
        box.innerHTML = gra.src === 'ulice' && !tok ? `<div class="tip small">🔑 Ten tryb potrzebuje darmowego klucza Mapillary. Załóż konto na mapillary.com → Developers → „Register application” → skopiuj <b>Client Token</b> (zaczyna się od MLY|) i wklej poniżej (zapisze się tylko na tym urządzeniu) albo dodaj go w Cloudflare jako MAPILLARY_TOKEN — wtedy zadziała u wszystkich znajomych.</div>
          <label>Klucz Mapillary <input id="mlyTok" placeholder="MLY|…"></label>` : '';
        const inp = $('#mlyTok'); if (inp) inp.onchange = () => { store.set('mlyToken', inp.value.trim()); };
      });
    };
    desc();
    $$('[data-src]').forEach(b => b.onclick = () => { gra.src = b.dataset.src; store.set('graSrc', gra.src); $$('[data-src]').forEach(x => x.classList.toggle('active', x === b)); desc(); });
    $('#graRegion').onchange = e => { gra.region = e.target.value; store.set('graRegion', gra.region); };
    $('#graStart').onclick = () => startGra(gra.src);
  }

  async function photoRounds(pool, n, rnd = Math.random) {
    const P = {};
    const order = [...pool].sort((a, b) => a.id < b.id ? -1 : 1);
    const chosen = [];
    while (chosen.length < Math.min(n * 2, order.length)) { const c = order[Math.floor(rnd() * order.length)]; if (!chosen.includes(c)) chosen.push(c); }
    await Promise.all(chosen.map(c => loadJSON(`data/plonk/${c.id}.json`).then(d => { P[c.id] = d; }).catch(() => {})));
    const rounds = [];
    for (const c of chosen) {
      const d = P[c.id]; if (!d || rounds.length >= n) continue;
      const items = d.items.filter((it, i) => it[0] === 1 && it[2].length && (it[4] || '').length > 25 && i > 0);
      if (!items.length) continue;
      const it = items[Math.floor(rnd() * items.length)];
      rounds.push({ t: 'photo', c: c.id, img: PLONK_IMG(it[2][Math.floor(rnd() * it[2].length)], 900), cap: it[4], map: it[3] });
    }
    return rounds;
  }

  async function startGra(src, preset = null) {
    const v = $('#v-gra');
    v.innerHTML = `<div class="loading">${src === 'ulice' ? 'Szukam miejsca na świecie…' : 'Losuję zdjęcia…'}</div>`;
    const pool = C.filter(c => !c.minor && (gra.region === 'all' || c.region === gra.region));
    Object.assign(gra, { mode: preset ? 'dzien' : src, i: 0, total: 0, results: [], rounds: [] });
    try {
      if (preset) gra.rounds = preset;
      else if (src === 'ulice') {
        const token = await mlyToken();
        if (!token) { renderGra(); return; }
        gra.token = token; gra.pool = pool;
        const world = await GMMap.load(); gra.world = world;
        gra.rounds = [await findStreet(world, pool, token)];
        gra.next = findStreet(world, pool, token).catch(() => null);
      } else {
        const G = await loadJSON('data/gallery.json').catch(() => null);
        gra.rounds = (await photoRounds(shuffle(pool).slice(0, 12), 5));
        // czasem zdjęcie z galerii GeoHints zamiast Plonk It
        if (G) gra.rounds = gra.rounds.map(r => { if (Math.random() >= 0.3) return r; const g = makeSpec('photo', [byId[r.c]], 'all', {}, G); return g.t === 'photo' ? g : r; });
      }
    } catch (e) { v.innerHTML = `<a class="back" href="#gra">← Wróć</a><div class="empty">${esc(e.message || 'Nie udało się przygotować gry.')}</div>`; gra.rounds = []; return; }
    if (!gra.rounds.length) { v.innerHTML = '<div class="empty">Nie udało się wczytać zdjęć. Sprawdź połączenie.</div>'; return; }
    renderGraRound();
  }
  const graCount = () => gra.mode === 'ulice' ? 5 : gra.rounds.length;

  function renderGraRound() {
    const v = $('#v-gra'), sp = gra.rounds[gra.i], street = sp.t === 'ulice';
    gra.guess = null; gra.answered = false;
    if (gra.viewer) { try { gra.viewer.remove(); } catch { /* */ } gra.viewer = null; }
    v.innerHTML = `<div class="gra-head"><a class="back" href="#nauka" id="graQuit">✕</a><b>${gra.mode === 'dzien' ? '📅 Wyzwanie dnia · ' : ''}Runda ${gra.i + 1} / ${graCount()}</b><span>⭐ ${fmt(gra.total)} pkt</span></div>
      <div class="gra-wrap ${street ? 'street' : ''}">
        ${street ? '<div class="gra-photo gra-street"><div id="mly"></div></div>'
          : `<div class="gra-photo">${sp.lab ? `<div class="fc-cat">📸 ${esc(sp.lab)}</div>` : ''}<button class="qphoto" data-lb="0"><img src="${esc(sp.img)}" alt=""></button><p class="muted small">Stuknij zdjęcie, aby powiększyć.</p></div>`}
        <div class="gra-mapcol"><div id="graMap"><div class="loading">Ładowanie mapy…</div></div>
          <button class="btn primary big" id="graGo" disabled>📍 Postaw pinezkę na mapie</button><div id="graRes"></div></div>
      </div>`;
    if (!street) bindLightbox(v.querySelector('.gra-photo'), [{ src: sp.img, cap: '' }]);
    else {
      const fail = () => {
        const el = $('#mly'); if (!el || gra.rounds[gra.i] !== sp) return;
        el.innerHTML = `<div class="empty">😕 Mapillary nie udostępnił tego zdjęcia.<br><small>Jeśli to się powtarza, klucz może jeszcze nie być w pełni aktywny po stronie Mapillary (zwykle trwa to do kilku godzin).</small><br><br><button class="btn primary" id="mlyNext">🔄 Inne miejsce</button> <button class="btn" id="mlyFoto">📸 Graj zdjęciami wskazówek</button></div>`;
        $('#mlyNext').onclick = async () => { el.innerHTML = '<div class="loading">Szukam innego miejsca…</div>'; const loc = await findStreet(gra.world, gra.pool, gra.token).catch(() => null); if (loc) { gra.rounds[gra.i] = loc; renderGraRound(); } else fail(); };
        $('#mlyFoto').onclick = () => { gra.rounds = []; gra.src = 'foto'; store.set('graSrc', 'foto'); startGra('foto'); };
      };
      loadMapillary().then(m => {
        gra.viewer = new m.Viewer({ accessToken: gra.token, container: 'mly', imageId: sp.id, component: { cover: false } });
        let ok = false;
        gra.viewer.on('image', ev => { ok = true; const img = ev.image; if (img && img.lngLat) sp.ll = [img.lngLat.lng, img.lngLat.lat]; });
        if (gra.viewer.moveTo) gra.viewer.moveTo(sp.id).catch(fail);
        setTimeout(() => { if (!ok) fail(); }, 15000);
      }).catch(fail);
    }
    $('#graQuit').onclick = e => { e.preventDefault(); if (confirm('Przerwać grę?')) { gra.rounds = []; location.hash = 'nauka'; } };
    GMMap.load().then(world => {
      gra.world = world;
      let marker = null;
      gra.api = GMMap.render($('#graMap'), world, {
        onPoint: ll => {
          if (gra.answered) return;
          gra.guess = ll; if (marker) marker.remove(); marker = gra.api.setMarker(ll, 'guess');
          const b = $('#graGo'); b.disabled = false; b.textContent = '✅ Zgadnij';
        },
      });
      $('#graGo').onclick = () => gra.answered ? nextGraRound() : answerGra();
    }).catch(() => { $('#graMap').innerHTML = '<div class="empty">Nie udało się wczytać mapy.</div>'; });
  }

  function answerGra() {
    if (!gra.guess || gra.answered) return;
    gra.answered = true; logActivity();
    const sp = gra.rounds[gra.i], c = byId[sp.c], street = sp.t === 'ulice';
    const km = street ? d3.geoDistance(gra.guess, sp.ll) * 6371 : GMMap.distanceKm(gra.world, sp.c, gra.guess);
    const pts = graScore(km), inCountry = street ? GMMap.distanceKm(gra.world, sp.c, gra.guess) === 0 : km === 0;
    gra.total += pts; gra.results.push({ c, pts, km, inCountry });
    const target = street ? sp.ll : GMMap.centerOf(gra.world, sp.c);
    if (c) gra.api.highlight(sp.c, 'hl-good');
    if (target && (km > 0.025)) { gra.api.line(gra.guess, target); gra.api.setMarker(target, 'answer'); gra.api.zoomTo([gra.guess, target]); }
    else if (target) gra.api.zoomTo([target]);
    if (!street && !inCountry && !mistakes.some(m => specKey(m) === specKey(sp))) { mistakes = [sp, ...mistakes].slice(0, 200); store.set('mistakes', mistakes); }
    $('.gra-head span').textContent = `⭐ ${fmt(gra.total)} pkt`;
    const name = c ? `${flag(c.id, 'sm')} ${esc(c.name)}` : esc(sp.c.toUpperCase());
    const msg = street
      ? `${inCountry ? '✅ Dobry kraj!' : '❌'} To był(a) <b>${name}</b> — ${fmt(Math.round(km))} km od Twojej pinezki`
      : km > 0 ? `❌ To był(a) <b>${name}</b> — pinezka ${fmt(Math.round(km))} km od granicy` : `✅ Trafiony kraj: <b>${name}</b>`;
    $('#graRes').innerHTML = `<div class="gra-result ${inCountry ? 'good' : 'bad'}"><div class="gra-pts">${fmt(pts)} <small>pkt</small></div><div>${msg}</div></div>
      ${sp.cap ? `<div class="qex-cap">${txt(sp.cap)}${mapLink(sp.map)}</div>` : ''}
      ${street && c ? `<div class="qex-cap"><b>Po czym rozpoznać ${esc(c.name)}?</b> ${esc(c.summary)}</div>` : ''}
      <p class="muted small">${c ? `<a href="#kraj/${c.id}">Otwórz kartę kraju →</a>` : ''}${street ? ` · <a href="https://www.google.com/maps/@?api=1&map_action=map&center=${sp.ll[1]},${sp.ll[0]}&zoom=12" target="_blank" rel="noopener">Pokaż miejsce w Google Maps ↗</a>` : ''}</p>`;
    $('#graGo').textContent = gra.i + 1 < graCount() ? 'Następna runda ➜' : 'Zobacz wynik 🏁';
  }

  async function nextGraRound() {
    gra.i++;
    if (gra.i < graCount()) {
      if (gra.mode === 'ulice' && !gra.rounds[gra.i]) {
        $('#graGo').disabled = true; $('#graGo').textContent = 'Szukam kolejnego miejsca…';
        let loc = await gra.next;
        if (!loc) loc = await findStreet(gra.world, gra.pool, gra.token).catch(() => null);
        if (!loc) { $('#graGo').textContent = 'Nie znalazłem miejsca — spróbuj ponownie'; $('#graGo').disabled = false; gra.i--; return; }
        gra.rounds[gra.i] = loc;
        if (gra.i + 1 < 5) gra.next = findStreet(gra.world, gra.pool, gra.token).catch(() => null);
      }
      return renderGraRound();
    }
    if (gra.viewer) { try { gra.viewer.remove(); } catch { /* */ } gra.viewer = null; }
    if (gra.mode === 'dzien') return renderDzienKoniec();
    const key = gra.mode === 'ulice' ? 'graBestU' : 'graBest';
    const best = store.get(key, null), record = best == null || gra.total > best;
    if (record) store.set(key, gra.total);
    $('#v-gra').innerHTML = `<div class="card result"><div class="score">${fmt(gra.total)}</div><div>na 25 000 pkt ${record ? '· 🏆 Nowy rekord!' : `· rekord ${fmt(best)}`}</div>
      ${graSummary()}
      ${gra.mode === 'foto' ? '<p class="muted small">Pomylone zdjęcia trafiły do „Moje błędy”.</p>' : ''}
      <p class="result-actions"><button class="btn primary" id="graAgain">Zagraj jeszcze raz</button><a class="btn" href="#dzien">📅 Wyzwanie dnia</a><a class="btn" href="#nauka">🎓 Nauka</a></p></div>`;
    const mode = gra.mode; gra.rounds = [];
    $('#graAgain').onclick = () => startGra(mode);
  }
  const graSummary = () => `<div class="gra-sum">${gra.results.map((r, i) => `<a href="${r.c ? '#kraj/' + r.c.id : '#gra'}">${i + 1}. ${r.c ? flag(r.c.id, 'sm') + ' ' + esc(r.c.name) : '?'} <b>${fmt(r.pts)}</b>${r.inCountry ? ' ✅' : ` <small>(${fmt(Math.round(r.km))} km)</small>`}</a>`).join('')}</div>`;

  // ═════════ WYZWANIE DNIA (te same 5 zdjęć dla wszystkich, ranking znajomych) ═════════
  const dzisiaj = (offset = 0) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw' }).format(new Date(Date.now() + offset * 864e5));
  function seeded(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; }
    let a = h >>> 0;
    return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  const emojiPts = p => p >= 4000 ? '🟩' : p >= 2000 ? '🟨' : p >= 500 ? '🟧' : '🟥';
  const dateLabel = d => new Date(d + 'T12:00:00').toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' });

  function rankingHtml(list, me) {
    if (!list.length) return '<div class="empty small">Jeszcze nikt nie zagrał — bądź pierwszy!</div>';
    return `<table class="rank"><tr><th>#</th><th>Nick</th><th>Rundy</th><th>Pkt</th></tr>${list.slice(0, 50).map((r, i) => `<tr class="${me && r.nick.toLowerCase() === me.toLowerCase() ? 'me' : ''}"><td>${['🥇', '🥈', '🥉'][i] || i + 1}</td><td>${esc(r.nick)}</td><td>${(r.rundy || []).map(emojiPts).join('')}</td><td><b>${fmt(r.score)}</b></td></tr>`).join('')}</table>`;
  }
  function loadRanking(day, el) {
    el.innerHTML = '<div class="loading">Wczytuję ranking…</div>';
    fetch('/api/daily/' + day).then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => { el.innerHTML = rankingHtml(d.wyniki || [], store.get('nick', '')); })
      .catch(() => { el.innerHTML = '<p class="muted small">Ranking działa na stronie wdrożonej na Cloudflare z bazą KV (instrukcja w README). Twój wynik i tak zapisuje się na tym urządzeniu.</p>'; });
  }
  function renderDzien() {
    const v = $('#v-gra');
    const day = dzisiaj(), done = store.get('dailyDone', {})[day];
    v.innerHTML = `<a class="back" href="#nauka">← Nauka</a>
      <div class="card setup daily"><h2>📅 Wyzwanie dnia · ${dateLabel(day)}</h2>
        <p class="muted">Dziś wszyscy grają te same 5 zdjęć. Masz jedno podejście — porównaj wynik ze znajomymi!</p>
        ${done ? `<div class="daily-done"><div class="score">${fmt(done.score)}</div><div>${done.rundy.map(emojiPts).join(' ')}</div><button class="btn" id="dzShare">📋 Kopiuj wynik do wysłania</button></div>`
          : `<label>Twój nick (widoczny w rankingu) <input id="dzNick" maxlength="20" value="${esc(store.get('nick', ''))}" placeholder="np. Kuba"></label><button class="btn primary big" id="dzStart">Zagraj dzisiejsze wyzwanie ➜</button>`}
        <div class="segs"><button class="seg active" data-day="0">Dziś</button><button class="seg" data-day="-1">Wczoraj</button></div>
        <div id="dzRank"></div></div>`;
    loadRanking(day, $('#dzRank'));
    $$('[data-day]').forEach(b => b.onclick = () => { $$('[data-day]').forEach(x => x.classList.toggle('active', x === b)); loadRanking(dzisiaj(+b.dataset.day), $('#dzRank')); });
    if (done) $('#dzShare').onclick = () => shareDaily(day, done);
    else $('#dzStart').onclick = async () => {
      const nick = $('#dzNick').value.trim();
      if (!nick) { $('#dzNick').focus(); return; }
      store.set('nick', nick);
      v.innerHTML = '<div class="loading">Przygotowuję dzisiejsze zdjęcia…</div>';
      const rounds = await photoRounds(C.filter(c => !c.minor && c.diff <= 2), 5, seeded('geometa-' + day));
      gra.dzien = day;
      startGra('foto', rounds);
    };
  }
  function shareDaily(day, done) {
    const text = `🌍 GeoMeta · wyzwanie ${dateLabel(day)}\n${fmt(done.score)} / 25 000 pkt\n${done.rundy.map(emojiPts).join('')}\n${location.origin}${location.pathname}#dzien`;
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => alert('Skopiowano! Wklej znajomym 🙂'), () => prompt('Skopiuj wynik:', text));
  }
  function renderDzienKoniec() {
    const day = gra.dzien, rundy = gra.results.map(r => r.pts), score = gra.total;
    const all = store.get('dailyDone', {}); all[day] = { score, rundy }; store.set('dailyDone', all);
    $('#v-gra').innerHTML = `<div class="card result"><h2>📅 Wyzwanie ${dateLabel(day)}</h2><div class="score">${fmt(score)}</div><div class="daily-emoji">${rundy.map(emojiPts).join(' ')}</div>
      ${graSummary()}
      <p class="result-actions"><button class="btn primary" id="dzShare">📋 Kopiuj wynik do wysłania</button><a class="btn" href="#nauka">🎓 Nauka</a></p>
      <h3>Ranking dnia</h3><div id="dzRank"><div class="loading">Zapisuję wynik…</div></div></div>`;
    gra.rounds = [];
    $('#dzShare').onclick = () => shareDaily(day, { score, rundy });
    fetch('/api/daily/' + day, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nick: store.get('nick', 'Gracz'), score, rundy }) })
      .then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || r.status); return d; })
      .then(d => { $('#dzRank').innerHTML = `<p>Jesteś <b>${d.miejsce}.</b> dzisiaj!</p>` + rankingHtml(d.wyniki, store.get('nick', '')); })
      .catch(e => { $('#dzRank').innerHTML = `<p class="muted small">${/^\d+$/.test(e.message) || e.message === 'Failed to fetch' ? 'Ranking działa na stronie wdrożonej na Cloudflare z bazą KV.' : esc(e.message)}</p>`; loadRankingLater(day); });
  }
  const loadRankingLater = day => { const el = document.createElement('div'); $('#dzRank').appendChild(el); loadRanking(day, el); };

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
