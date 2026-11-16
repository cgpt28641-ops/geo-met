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
  const flag = (id, cls = '') => `<img class="flag ${cls}" src="https://flagcdn.com/w160/${id}.png" alt="" loading="lazy" decoding="async">`;
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
    const h = location.hash.slice(1) || 'kraje';
    const [view, arg] = h.split('/');
    if (currentRoute) scrollPos[currentRoute] = scrollY;
    const tab = view === 'kraj' ? 'kraje' : view;
    if (view !== 'kraj') document.title = 'GeoMeta — meta GeoGuessr po polsku';
    $$('#tabs a').forEach(a => a.classList.toggle('active', a.dataset.tab === tab));
    $$('.view').forEach(v => v.classList.toggle('active', v.id === 'v-' + view));
    if (view === 'kraj' && byId[arg]) renderCountry(arg);
    else if (view === 'kraj') return (location.hash = 'kraje');
    if (view === 'fiszki' && !fc.card) fcNext();
    if (view === 'poradniki' && arg) { const d = document.getElementById('g-' + arg); if (d) { d.open = true; setTimeout(() => d.scrollIntoView({ block: 'start' }), 30); } }
    currentRoute = h;
    if (!(view === 'poradniki' && arg)) requestAnimationFrame(() => scrollTo(0, view === 'kraj' ? 0 : (scrollPos[h] || 0)));
    if (['kraje', 'porownaj', 'poradniki', 'fiszki', 'quiz'].includes(view)) store.set('tab', view);
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
      <div class="toc"><div class="chips">${cats.map(k => `<button class="chip" data-jump="${k}">${CATS[k].icon} ${CATS[k].short}</button>`).join('')}</div></div>
      <div class="sections">
        ${cats.map(k => `<div class="sec" id="sec-${k}"><h3>${CATS[k].icon} ${CATS[k].label}</h3><ul>${c.clues[k].map(v => `<li>${esc(v)}</li>`).join('')}</ul></div>`).join('')}
      </div>
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
    $$('[data-jump]').forEach(b => b.onclick = () => document.getElementById('sec-' + b.dataset.jump).scrollIntoView({ behavior: 'smooth' }));
    $('#toggleLearned').onclick = () => {
      learned.has(id) ? learned.delete(id) : learned.add(id);
      store.set('learned', [...learned]); renderGrid(); renderCountry(id);
    };
    $('#drillCountry').onclick = () => { fc.only = id; location.hash = 'fiszki'; fcNext(); };
  }

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
  let cmpCat = store.get('cmpCat', 'slupki'), cmpRegion = 'all';
  function renderCompare() {
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

  const allCards = C.filter(c => !c.minor).flatMap(c => allClues(c).map(([k, v], i) => ({ id: `${c.id}:${k}:${fold(v).slice(0, 40)}`, c, k, v })));
  let boxes = store.get('boxes2', {});
  const fc = { card: null, flipped: false, last: [], only: null };
  const fcSet = store.get('fcSettings2', { region: 'all', cat: 'all', mode: 'clue' });
  $('#fcRegion').value = fcSet.region; $('#fcCat').value = fcSet.cat; $('#fcMode').value = fcSet.mode;
  ['#fcRegion', '#fcCat', '#fcMode'].forEach(s => $(s).onchange = () => {
    Object.assign(fcSet, { region: $('#fcRegion').value, cat: $('#fcCat').value, mode: $('#fcMode').value });
    fc.only = null; store.set('fcSettings2', fcSet); fcNext();
  });

  function deck() {
    if (fcSet.mode === 'country') {
      return C.filter(c => !c.minor && (fc.only ? c.id === fc.only : (fcSet.region === 'all' || c.region === fcSet.region)))
        .filter(c => fcSet.cat === 'all' || (c.clues[fcSet.cat] || []).length)
        .map(c => ({ id: `country:${c.id}:${fcSet.cat}`, c, k: fcSet.cat }));
    }
    return allCards.filter(x => (fc.only ? x.c.id === fc.only : (fcSet.region === 'all' || x.c.region === fcSet.region)) && (fcSet.cat === 'all' || x.k === fcSet.cat));
  }

  function fcNext() {
    const d = deck();
    $('#flashcard').classList.remove('flipped'); fc.flipped = false;
    if (!d.length) { fc.card = null; $('#fcFront').innerHTML = '<div class="muted">Brak kart dla tych filtrów.</div>'; $('#fcBack').innerHTML = ''; renderFcStats(d); return; }
    const pool = d.length > 6 ? d.filter(x => !fc.last.includes(x.id)) : d;
    const weights = pool.map(x => [24, 10, 5, 2, 1][boxes[x.id] || 0]);
    let r = Math.random() * weights.reduce((a, b) => a + b, 0), card = pool[0];
    for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) { card = pool[i]; break; } }
    fc.card = card; fc.last = [card.id, ...fc.last].slice(0, 6);
    const country = `${flag(card.c.id, 'xl')}<div style="font-size:1.5rem;font-weight:800">${esc(card.c.name)}</div><div class="fc-hint">${card.c.region} · ruch ${driveTxt(card.c.drive)}</div>`;
    if (fcSet.mode === 'clue') {
      const lab = CATS[card.k];
      $('#fcFront').innerHTML = `<div class="fc-cat">${lab.icon} ${lab.label}</div><div>${esc(card.v)}</div><div class="fc-hint">Jaki to kraj? Stuknij, aby odwrócić</div>`;
      $('#fcBack').innerHTML = country;
    } else {
      const items = card.k === 'all' ? allClues(card.c).slice(0, 8) : (card.c.clues[card.k] || []).map(v => [card.k, v]);
      $('#fcFront').innerHTML = `${country}<div class="fc-cat">${card.k === 'all' ? 'Jak go rozpoznać?' : CATS[card.k].icon + ' ' + CATS[card.k].label + '?'}</div>`;
      $('#fcBack').innerHTML = `<div class="fc-cat">${esc(card.c.name)}</div><ul>${items.map(([k, v]) => `<li>${CATS[k].icon} ${esc(v)}</li>`).join('')}</ul>`;
    }
    renderFcStats(d);
  }
  function renderFcStats(d) {
    const cnt = [0, 0, 0, 0, 0]; d.forEach(x => cnt[boxes[x.id] || 0]++);
    $('#fcStats').innerHTML = (fc.only ? `<span>🎯 ${esc(byId[fc.only].name)} <button class="link" id="fcAll">pokaż wszystkie</button></span>` : '') +
      `<span>Kart: ${d.length}</span><span>🆕 Nowe/słabe: ${cnt[0]}</span><span>📈 W nauce: ${cnt[1] + cnt[2] + cnt[3]}</span><span>🏆 Opanowane: ${cnt[4]}</span>`;
    const all = $('#fcAll'); if (all) all.onclick = () => { fc.only = null; fcNext(); };
  }
  function fcFlip() { if (!fc.card) return; fc.flipped = !fc.flipped; $('#flashcard').classList.toggle('flipped', fc.flipped); }
  function fcAnswer(ok) {
    if (!fc.card) return;
    const b = boxes[fc.card.id] || 0;
    boxes[fc.card.id] = ok ? Math.min(4, b + 1) : 0;
    store.set('boxes2', boxes); fcNext();
  }
  $('#flashcard').onclick = fcFlip; $('#fcFlip').onclick = fcFlip;
  $('#fcGood').onclick = () => fcAnswer(true); $('#fcBad').onclick = () => fcAnswer(false);
  $('#fcReset').onclick = () => { if (confirm('Wyzerować postęp fiszek?')) { boxes = {}; store.set('boxes2', boxes); fcNext(); } };
  let tx = null;
  $('#flashcard').addEventListener('touchstart', e => { tx = e.touches[0].clientX; }, { passive: true });
  $('#flashcard').addEventListener('touchend', e => {
    if (tx === null) return;
    const dx = e.changedTouches[0].clientX - tx; tx = null;
    if (Math.abs(dx) > 70) { e.preventDefault(); fcAnswer(dx > 0); }
  });

  // ═════════ QUIZ ═════════
  const q = { list: [], i: 0, score: 0, answered: false, mistakes: [] };
  const qKey = () => `${$('#qType').value}|${$('#qCat').value}|${$('#qRegion').value}`;
  function bestTxt() {
    const best = store.get('best', {});
    $('#qBest').textContent = best[qKey()] != null ? `🏆 Twój rekord w tych ustawieniach: ${best[qKey()]}%` : 'Jeszcze nie grałeś w tych ustawieniach.';
    $('#qCat').closest('label').classList.toggle('hidden', !['mix', 'clue'].includes($('#qType').value));
  }
  ['#qType', '#qRegion', '#qCat'].forEach(s => $(s).onchange = bestTxt);

  function distractors(correct, n) {
    const pool = C.filter(c => !c.minor && c.id !== correct.id);
    const same = shuffle(pool.filter(c => c.region === correct.region));
    const other = shuffle(pool.filter(c => c.region !== correct.region));
    return [...same.slice(0, n), ...other].slice(0, n);
  }
  function makeQuestion(type, pool, cat) {
    if (type === 'clue') {
      const cands = pool.filter(c => cat === 'all' ? allClues(c).length : (c.clues[cat] || []).length);
      const c = pick(cands);
      const [k, v] = pick(cat === 'all' ? allClues(c) : c.clues[cat].map(v => [cat, v]));
      return { key: v, prompt: `<div class="fc-cat">${CATS[k].icon} ${CATS[k].label}</div><div>${esc(v)}</div><div class="muted small">Który to kraj?</div>`, options: shuffle([c, ...distractors(c, 3)]).map(x => x.name), answer: c.name, country: c };
    }
    const c = pick(pool);
    if (type === 'drive') return { key: 'd' + c.id, prompt: `${flag(c.id, 'xl')}<div>Po której stronie jeździ się w kraju <b>${esc(c.name)}</b>?</div>`, options: ['⬅️ Lewostronny', '➡️ Prawostronny'], answer: c.drive === 'L' ? '⬅️ Lewostronny' : '➡️ Prawostronny', country: c };
    const opts = shuffle([c, ...distractors(c, 3)]).map(x => x.name);
    if (type === 'flag') return { key: 'f' + c.id, prompt: `${flag(c.id, 'xl')}<div>Czyja to flaga?</div>`, options: opts, answer: c.name, country: c };
    return { key: 'o' + c.id, prompt: `<div style="font-size:2.6rem;font-weight:800">${esc(c.domain)}</div><div>Do jakiego kraju należy ta domena?</div>`, options: opts, answer: c.name, country: c };
  }
  $('#qStart').onclick = () => {
    const region = $('#qRegion').value, type = $('#qType').value, n = +$('#qCount').value, cat = $('#qCat').value;
    const pool = C.filter(c => !c.minor && (region === 'all' || c.region === region));
    const used = new Set(); q.list = [];
    for (let i = 0; i < n; i++) {
      const t = type === 'mix' ? pick(['clue', 'clue', 'clue', 'clue', 'flag', 'drive', 'domain']) : type;
      let qq, tries = 0;
      do { qq = makeQuestion(t, pool, cat); tries++; } while (used.has(qq.key) && tries < 30);
      used.add(qq.key); q.list.push(qq);
    }
    Object.assign(q, { i: 0, score: 0, mistakes: [], k: qKey() });
    $('#quizSetup').classList.add('hidden'); $('#quizGame').classList.remove('hidden');
    renderQ();
  };
  function renderQ() {
    const cur = q.list[q.i]; q.answered = false;
    $('#qProgress').textContent = `Pytanie ${q.i + 1} / ${q.list.length}`;
    $('#qScore').textContent = `✅ ${q.score}`;
    $('#qBar').style.width = (q.i / q.list.length * 100) + '%';
    $('#qQuestion').innerHTML = cur.prompt;
    $('#qAnswers').innerHTML = cur.options.map((o, i) => `<button class="btn" data-o="${esc(o)}"><kbd>${i + 1}</kbd> ${esc(o)}</button>`).join('');
    $$('#qAnswers .btn').forEach(b => b.onclick = () => answerQ(b));
    $('#qFeedback').innerHTML = ''; $('#qNext').classList.add('hidden');
  }
  function answerQ(btn) {
    if (q.answered) return; q.answered = true;
    const cur = q.list[q.i], ok = btn.dataset.o === cur.answer;
    $$('#qAnswers .btn').forEach(b => { b.disabled = true; if (b.dataset.o === cur.answer) b.classList.add('correct'); });
    if (ok) { q.score++; $('#qFeedback').innerHTML = '✅ Dobrze!'; }
    else {
      btn.classList.add('wrong'); q.mistakes.push(cur);
      $('#qFeedback').innerHTML = `❌ Poprawnie: <b>${esc(cur.answer)}</b> · <a href="#kraj/${cur.country.id}" target="_self">karta kraju</a>`;
    }
    $('#qScore').textContent = `✅ ${q.score}`;
    $('#qNext').classList.remove('hidden');
  }
  $('#qNext').onclick = () => {
    q.i++;
    if (q.i < q.list.length) return renderQ();
    const pct = Math.round(q.score / q.list.length * 100);
    const best = store.get('best', {}); const record = best[q.k] == null || pct > best[q.k];
    if (record) { best[q.k] = pct; store.set('best', best); }
    $('#qBar').style.width = '100%';
    $('#qAnswers').innerHTML = ''; $('#qFeedback').innerHTML = ''; $('#qNext').classList.add('hidden');
    const uniq = [...new Map(q.mistakes.map(m => [m.country.id, m.country])).values()];
    $('#qQuestion').innerHTML = `<div class="result">
      <div class="score">${pct}%</div>
      <div>${q.score} / ${q.list.length} ${record ? '· 🏆 Nowy rekord!' : ''}</div>
      ${uniq.length ? `<p><b>Do powtórki:</b></p><div class="flaglist" style="justify-content:center">${uniq.map(c => `<a href="#kraj/${c.id}">${flag(c.id, 'sm')}${esc(c.name)}</a>`).join('')}</div>` : '<p>Bezbłędnie! 🎉</p>'}
      <p><button class="btn primary" id="qAgain">Jeszcze raz</button> <button class="btn" id="qBack">Ustawienia</button></p>
    </div>`;
    $('#qAgain').onclick = () => $('#qStart').click();
    $('#qBack').onclick = () => { $('#quizGame').classList.add('hidden'); $('#quizSetup').classList.remove('hidden'); bestTxt(); };
  };

  // ── klawiatura ──
  document.addEventListener('keydown', e => {
    if (e.target.matches('input, select, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
    const v = (location.hash.slice(1) || 'kraje').split('/')[0];
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
  if (!location.hash) location.replace('#' + store.get('tab', 'kraje'));
  route();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
