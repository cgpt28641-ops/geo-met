(() => {
  'use strict';

  const C = window.COUNTRIES;
  const L = window.CLUE_LABELS;
  const R = window.REGIONS;
  const byId = Object.fromEntries(C.map(c => [c.id, c]));
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];

  // ── storage (bezpieczne w trybie prywatnym) ──
  const store = {
    get(k, d) { try { const v = localStorage.getItem('geometa:' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem('geometa:' + k, JSON.stringify(v)); } catch { /* ignore */ } },
  };

  const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const flag = (id, cls = '') => `<img class="flag ${cls}" src="https://flagcdn.com/w160/${id}.png" alt="" loading="lazy">`;
  const driveTxt = d => d === 'L' ? 'lewostronny' : 'prawostronny';
  const fold = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');

  // ── motyw ──
  const applyTheme = t => { if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; };
  applyTheme(store.get('theme', null));
  $('#themeBtn').onclick = () => {
    const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const t = cur === 'dark' ? 'light' : 'dark';
    store.set('theme', t); applyTheme(t);
  };

  // ── zakładki ──
  function showTab(tab) {
    $$('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    $$('.panel').forEach(p => p.classList.toggle('active', p.id === tab));
    store.set('tab', tab);
    if (tab === 'fiszki' && !fc.card) fcNext();
    window.scrollTo({ top: 0 });
  }
  $$('#tabs button').forEach(b => b.onclick = () => showTab(b.dataset.tab));

  // ═══════════ KRAJE ═══════════
  let learned = new Set(store.get('learned', []));
  const filt = { region: 'all', drive: 'all', hideLearned: false, q: '' };

  $('#regionChips').innerHTML = ['all', ...R].map(r => `<button class="chip" data-region="${r}">${r === 'all' ? 'Wszystkie regiony' : r}</button>`).join('');
  $$('[data-region]').forEach(b => b.onclick = () => { filt.region = b.dataset.region; renderGrid(); });
  $$('[data-drive]').forEach(b => b.onclick = () => { filt.drive = b.dataset.drive; renderGrid(); });
  $('[data-learned]').onclick = () => { filt.hideLearned = !filt.hideLearned; renderGrid(); };
  $('#search').oninput = e => { filt.q = fold(e.target.value.trim()); renderGrid(); };

  function haystack(c) {
    return fold([c.name, c.region, c.domain, c.phone, ...Object.values(c.clues), ...(c.tips || [])].join(' '));
  }
  C.forEach(c => { c._hay = haystack(c); });

  function renderGrid() {
    $$('[data-region]').forEach(b => b.classList.toggle('active', b.dataset.region === filt.region));
    $$('[data-drive]').forEach(b => b.classList.toggle('active', b.dataset.drive === filt.drive));
    $('[data-learned]').classList.toggle('active', filt.hideLearned);

    const list = C.filter(c =>
      (filt.region === 'all' || c.region === filt.region) &&
      (filt.drive === 'all' || c.drive === filt.drive) &&
      (!filt.hideLearned || !learned.has(c.id)) &&
      (!filt.q || c._hay.includes(filt.q))
    );
    $('#countryGrid').innerHTML = list.length ? list.map(c => {
      const first = Object.values(c.clues)[0] || '';
      return `<button class="ccard ${learned.has(c.id) ? 'learned' : ''}" data-id="${c.id}">
        <div class="ccard-head">${flag(c.id)}<h3>${esc(c.name)}</h3>${learned.has(c.id) ? '✅' : ''}</div>
        <div class="badges">
          <span class="badge ${c.drive}">${c.drive === 'L' ? '⬅️ lewostronny' : '➡️ prawostronny'}</span>
          <span class="badge">${c.domain}</span>
          <span class="badge d${c.diff}">${['', 'łatwy', 'średni', 'trudny'][c.diff]}</span>
        </div>
        <p>${esc(first)}</p>
      </button>`;
    }).join('') : '<div class="empty">Brak wyników 🤷</div>';
    $$('.ccard').forEach(el => el.onclick = () => openCountry(el.dataset.id));

    const pct = Math.round(learned.size / C.length * 100);
    $('#learnedBar').style.width = pct + '%';
    $('#learnedTxt').textContent = `Opanowane: ${learned.size}/${C.length}`;
  }

  const dlg = $('#countryDialog');
  function openCountry(id) {
    const c = byId[id];
    const clues = Object.entries(c.clues).map(([k, v]) => `
      <div class="clue"><span class="ic">${L[k].icon}</span><div><small>${L[k].label}</small>${esc(v)}</div></div>`).join('');
    const tips = (c.tips || []).map(t => `<div class="tip">💡 ${esc(t)}</div>`).join('');
    $('#dialogBody').innerHTML = `
      <button class="close" aria-label="Zamknij">✕</button>
      <div class="dlg">
        <div class="dlg-head">${flag(c.id, 'big')}<div><h2>${esc(c.name)}</h2><span class="muted">${c.region}</span></div></div>
        <div class="facts">
          <div class="fact"><small>Ruch</small><b>${c.drive === 'L' ? '⬅️ lewy' : '➡️ prawy'}</b></div>
          <div class="fact"><small>Domena</small><b>${c.domain}</b></div>
          <div class="fact"><small>Kierunkowy</small><b>${c.phone}</b></div>
        </div>
        ${clues}${tips}
        <div class="dlg-actions">
          <button class="btn ${learned.has(id) ? '' : 'primary'}" id="toggleLearned">${learned.has(id) ? '↩️ Oznacz jako nieopanowany' : '✅ Opanowałem'}</button>
          <a class="btn" href="https://www.plonkit.net/" target="_blank" rel="noopener">Plonk It ↗</a>
          <a class="btn" href="https://www.google.com/maps/search/${encodeURIComponent(c.name)}" target="_blank" rel="noopener">Mapa ↗</a>
        </div>
      </div>`;
    $('#dialogBody .close').onclick = () => dlg.close();
    $('#toggleLearned').onclick = () => {
      learned.has(id) ? learned.delete(id) : learned.add(id);
      store.set('learned', [...learned]);
      renderGrid(); openCountry(id);
    };
    if (!dlg.open) dlg.showModal();
  }
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });

  // ═══════════ PORÓWNAJ ═══════════
  let cmpCat = store.get('cmpCat', 'slupki');
  const cmpCats = { ...L, drive: { label: 'Strona ruchu', icon: '↔️' }, domain: { label: 'Domeny i kierunkowe', icon: '🌐' } };
  $('#compareChips').innerHTML = Object.entries(cmpCats).map(([k, v]) => `<button class="chip" data-cmp="${k}">${v.icon} ${v.label}</button>`).join('');
  $$('[data-cmp]').forEach(b => b.onclick = () => { cmpCat = b.dataset.cmp; store.set('cmpCat', cmpCat); renderCompare(); });

  function renderCompare() {
    $$('[data-cmp]').forEach(b => b.classList.toggle('active', b.dataset.cmp === cmpCat));
    let html = '';
    for (const r of R) {
      const rows = C.filter(c => c.region === r).map(c => {
        let val;
        if (cmpCat === 'drive') val = `Ruch ${driveTxt(c.drive)}`;
        else if (cmpCat === 'domain') val = `${c.domain} · ${c.phone}`;
        else val = c.clues[cmpCat];
        return val ? `<div class="crow" data-id="${c.id}">${flag(c.id)}<div><b>${esc(c.name)}</b><span>${esc(val)}</span></div></div>` : '';
      }).join('');
      if (rows) html += `<h3 class="group-title">${r}</h3>${rows}`;
    }
    $('#compareList').innerHTML = html;
    $$('#compareList .crow').forEach(el => el.onclick = () => openCountry(el.dataset.id));
  }

  // ═══════════ PORADNIKI ═══════════
  const flagList = list => `<div class="flaglist">${list.map(c => `<span>${flag(c.id)}${esc(c.name)}</span>`).join('')}</div>`;
  const autoGuides = [
    {
      id: 'lewy', icon: '⬅️', title: 'Ruch lewostronny — pełna lista',
      html: `<p>Sprawdź, po której stronie jeżdżą auta i gdzie stoją znaki. Kraje z ruchem lewostronnym w tej bazie:</p>
        ${flagList(C.filter(c => c.drive === 'L'))}
        <p class="muted">Poza bazą: Malta, Cypr, Makau, Brunei, wyspy Karaibów (np. Wyspy Dziewicze USA).</p>`,
    },
    {
      id: 'zolte', icon: '🟨', title: 'Żółte linie na drodze',
      html: `<p><b>Żółta linia środkowa:</b> obie Ameryki (USA, Kanada, Meksyk, Brazylia, Kolumbia…), Norwegia, Finlandia.</p>
        <p><b>Żółta linia krawędziowa:</b> Irlandia, RPA.</p>
        <p><b>Żółte przejścia dla pieszych:</b> Szwajcaria.</p>
        <p><b>Białe linie środkowe:</b> większość Europy, Chile, Australia, Japonia.</p>`,
    },
    {
      id: 'tablice', icon: '🚗', title: 'Tablice — kolory na pierwszy rzut oka',
      html: `<table>
        <tr><th>Wygląd</th><th>Kraj</th></tr>
        <tr><td>Żółte z przodu i z tyłu</td><td>Holandia, Luksemburg, Kolumbia</td></tr>
        <tr><td>Biała z przodu, żółta z tyłu</td><td>Wielka Brytania</td></tr>
        <tr><td>Czerwony tekst</td><td>Belgia</td></tr>
        <tr><td>Niebieskie paski po obu stronach</td><td>Francja, Włochy</td></tr>
        <tr><td>Żółty pasek po prawej</td><td>Portugalia</td></tr>
        <tr><td>Czerwono-białe paski góra/dół</td><td>Austria</td></tr>
        <tr><td>Czarne</td><td>Malezja, Indonezja (starsze), stare w Argentynie</td></tr>
        <tr><td>Małe, kwadratowe</td><td>Japonia</td></tr>
        <tr><td>Niebieski pasek u góry (Mercosur)</td><td>Brazylia, Argentyna, Urugwaj</td></tr>
      </table>`,
    },
  ];
  const allGuides = [window.GUIDES[0], ...autoGuides, ...window.GUIDES.slice(1)];
  $('#guideList').innerHTML = allGuides.map((g, i) => `
    <details class="guide" ${i === 0 ? 'open' : ''}><summary><span>${g.icon}</span>${esc(g.title)}</summary><div class="gbody">${g.html}</div></details>`).join('');

  // ═══════════ FISZKI ═══════════
  const regionOpts = `<option value="all">Wszystkie</option>` + R.map(r => `<option>${r}</option>`).join('');
  $('#fcRegion').innerHTML = regionOpts;
  $('#qRegion').innerHTML = regionOpts;
  $('#fcCat').innerHTML = `<option value="all">Wszystkie</option>` + Object.entries(L).map(([k, v]) => `<option value="${k}">${v.icon} ${v.label}</option>`).join('');

  const allCards = C.flatMap(c => Object.entries(c.clues).map(([k, v]) => ({ id: `${c.id}:${k}`, c, k, v })));
  let boxes = store.get('boxes', {}); // id -> 0..4
  const fc = { card: null, flipped: false, last: [] };

  const fcSettings = store.get('fcSettings', { region: 'all', cat: 'all', mode: 'clue' });
  $('#fcRegion').value = fcSettings.region; $('#fcCat').value = fcSettings.cat; $('#fcMode').value = fcSettings.mode;
  ['#fcRegion', '#fcCat', '#fcMode'].forEach(s => $(s).onchange = () => {
    Object.assign(fcSettings, { region: $('#fcRegion').value, cat: $('#fcCat').value, mode: $('#fcMode').value });
    store.set('fcSettings', fcSettings); fcNext();
  });

  const deck = () => allCards.filter(x => (fcSettings.region === 'all' || x.c.region === fcSettings.region) && (fcSettings.cat === 'all' || x.k === fcSettings.cat));

  function fcNext() {
    const d = deck();
    const el = $('#flashcard');
    el.classList.remove('flipped'); fc.flipped = false;
    if (!d.length) { fc.card = null; $('#fcFront').innerHTML = 'Brak kart dla tych filtrów.'; $('#fcBack').innerHTML = ''; renderFcStats(d); return; }
    // ważone losowanie: niższe pudełko = większa szansa
    const pool = d.filter(x => !fc.last.includes(x.id) || d.length <= 3);
    const weights = pool.map(x => [16, 8, 4, 2, 1][boxes[x.id] || 0]);
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    let card = pool[0];
    for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) { card = pool[i]; break; } }
    fc.card = card;
    fc.last = [card.id, ...fc.last].slice(0, 5);
    const lab = L[card.k];
    const countryHtml = `${flag(card.c.id, 'big')}<div><b style="font-size:1.4rem">${esc(card.c.name)}</b></div>`;
    const clueHtml = `<div>${esc(card.v)}</div>`;
    if (fcSettings.mode === 'clue') {
      $('#fcFront').innerHTML = `<div class="fc-cat">${lab.icon} ${lab.label}</div>${clueHtml}<div class="fc-hint">Jaki to kraj? Dotknij, aby odwrócić</div>`;
      $('#fcBack').innerHTML = `${countryHtml}<div class="fc-cat">${card.c.region} · ruch ${driveTxt(card.c.drive)}</div>`;
    } else {
      $('#fcFront').innerHTML = `${countryHtml}<div class="fc-cat">${lab.icon} ${lab.label}?</div><div class="fc-hint">Dotknij, aby odwrócić</div>`;
      $('#fcBack').innerHTML = `<div class="fc-cat">${lab.icon} ${lab.label}</div>${clueHtml}`;
    }
    renderFcStats(d);
  }
  function renderFcStats(d) {
    const cnt = [0, 0, 0, 0, 0];
    d.forEach(x => cnt[boxes[x.id] || 0]++);
    $('#fcStats').innerHTML = `<span>Kart: ${d.length}</span>` +
      ['Nowe/słabe', 'Pudełko 2', 'Pudełko 3', 'Pudełko 4', 'Opanowane'].map((n, i) => `<span>${n}: ${cnt[i]}</span>`).join('');
  }
  function fcFlip() { if (!fc.card) return; fc.flipped = !fc.flipped; $('#flashcard').classList.toggle('flipped', fc.flipped); }
  function fcAnswer(ok) {
    if (!fc.card) return;
    const b = boxes[fc.card.id] || 0;
    boxes[fc.card.id] = ok ? Math.min(4, b + 1) : 0;
    store.set('boxes', boxes);
    fcNext();
  }
  $('#flashcard').onclick = fcFlip;
  $('#fcFlip').onclick = fcFlip;
  $('#fcGood').onclick = () => fcAnswer(true);
  $('#fcBad').onclick = () => fcAnswer(false);
  $('#fcReset').onclick = () => { if (confirm('Wyzerować postęp fiszek?')) { boxes = {}; store.set('boxes', boxes); fcNext(); } };

  // gesty swipe na telefonie: w prawo = wiedziałem, w lewo = nie
  let touchX = null;
  $('#flashcard').addEventListener('touchstart', e => { touchX = e.touches[0].clientX; }, { passive: true });
  $('#flashcard').addEventListener('touchend', e => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX; touchX = null;
    if (Math.abs(dx) > 70 && fc.flipped) { e.preventDefault(); fcAnswer(dx > 0); }
  });

  // ═══════════ QUIZ ═══════════
  const q = { list: [], i: 0, score: 0, answered: false, mistakes: [] };

  function bestTxt() {
    const best = store.get('best', {});
    const k = `${$('#qType').value}|${$('#qRegion').value}`;
    $('#qBest').textContent = best[k] != null ? `Twój rekord w tym ustawieniu: ${best[k]}%` : 'Jeszcze nie grałeś w tym ustawieniu.';
  }
  $('#qType').onchange = bestTxt; $('#qRegion').onchange = bestTxt;

  function distractors(correct, n, pool) {
    const same = shuffle(pool.filter(c => c.id !== correct.id && c.region === correct.region));
    const other = shuffle(pool.filter(c => c.id !== correct.id && c.region !== correct.region));
    return [...same, ...other].slice(0, n);
  }

  function makeQuestion(type, pool) {
    const c = pick(pool);
    if (type === 'drive') {
      return { prompt: `${flag(c.id, 'big')}<div>Po której stronie jeździ się w kraju <b>${esc(c.name)}</b>?</div>`,
        options: ['Lewostronny', 'Prawostronny'], answer: c.drive === 'L' ? 'Lewostronny' : 'Prawostronny', country: c };
    }
    const opts = shuffle([c, ...distractors(c, 3, C)]).map(x => x.name);
    if (type === 'flag') return { prompt: `${flag(c.id, 'big')}<div>Czyja to flaga?</div>`, options: opts, answer: c.name, country: c };
    if (type === 'domain') return { prompt: `<div style="font-size:2.2rem;font-weight:800">${c.domain}</div><div>Do jakiego kraju należy ta domena?</div>`, options: opts, answer: c.name, country: c };
    // clue
    const [k, v] = pick(Object.entries(c.clues));
    return { prompt: `<div class="fc-cat">${L[k].icon} ${L[k].label}</div><div>${esc(v)}</div><div class="muted">Który to kraj?</div>`, options: opts, answer: c.name, country: c };
  }

  $('#qStart').onclick = () => {
    const region = $('#qRegion').value, type = $('#qType').value, n = +$('#qCount').value;
    const pool = C.filter(c => region === 'all' || c.region === region);
    q.list = []; const used = new Set();
    for (let i = 0; i < n; i++) {
      const t = type === 'mix' ? pick(['clue', 'clue', 'clue', 'flag', 'drive', 'domain']) : type;
      let qq, tries = 0;
      do { qq = makeQuestion(t, pool); tries++; } while (used.has(t + qq.prompt) && tries < 20);
      used.add(t + qq.prompt); q.list.push(qq);
    }
    Object.assign(q, { i: 0, score: 0, mistakes: [], type, region });
    $('#quizSetup').classList.add('hidden'); $('#quizGame').classList.remove('hidden');
    renderQ();
  };

  function renderQ() {
    const cur = q.list[q.i];
    q.answered = false;
    $('#qProgress').textContent = `Pytanie ${q.i + 1}/${q.list.length}`;
    $('#qScore').textContent = `Wynik: ${q.score}`;
    $('#qBar').style.width = (q.i / q.list.length * 100) + '%';
    $('#qQuestion').innerHTML = cur.prompt;
    $('#qAnswers').innerHTML = cur.options.map((o, i) => `<button class="btn" data-o="${esc(o)}"><kbd>${i + 1}</kbd> ${esc(o)}</button>`).join('');
    $$('#qAnswers .btn').forEach(b => b.onclick = () => answerQ(b));
    $('#qFeedback').innerHTML = '';
    $('#qNext').classList.add('hidden');
  }

  function answerQ(btn) {
    if (q.answered) return;
    q.answered = true;
    const cur = q.list[q.i];
    const ok = btn.dataset.o === cur.answer;
    $$('#qAnswers .btn').forEach(b => { b.disabled = true; if (b.dataset.o === cur.answer) b.classList.add('correct'); });
    if (ok) { q.score++; $('#qFeedback').innerHTML = '✅ Dobrze!'; }
    else {
      btn.classList.add('wrong');
      q.mistakes.push(cur);
      $('#qFeedback').innerHTML = `❌ Poprawnie: <b>${esc(cur.answer)}</b> · <button class="link" id="seeCountry">zobacz kartę kraju</button>`;
      $('#seeCountry').onclick = () => openCountry(cur.country.id);
    }
    $('#qScore').textContent = `Wynik: ${q.score}`;
    $('#qNext').classList.remove('hidden');
  }

  $('#qNext').onclick = () => {
    q.i++;
    if (q.i < q.list.length) return renderQ();
    const pct = Math.round(q.score / q.list.length * 100);
    const best = store.get('best', {}); const k = `${q.type}|${q.region}`;
    const record = best[k] == null || pct > best[k];
    if (record) { best[k] = pct; store.set('best', best); }
    $('#qBar').style.width = '100%';
    $('#qAnswers').innerHTML = ''; $('#qFeedback').innerHTML = ''; $('#qNext').classList.add('hidden');
    const uniq = [...new Map(q.mistakes.map(m => [m.country.id, m.country])).values()];
    $('#qQuestion').innerHTML = `<div class="result">
      <div class="score">${pct}%</div>
      <div>${q.score} / ${q.list.length} ${record ? '· 🏆 Nowy rekord!' : ''}</div>
      ${uniq.length ? `<div class="mistakes"><b>Do powtórki:</b>${flagList(uniq)}</div>` : '<p>Bezbłędnie! 🎉</p>'}
      <p><button class="btn primary" id="qAgain">Zagraj jeszcze raz</button> <button class="btn" id="qBack">Ustawienia</button></p>
    </div>`;
    $('#qAgain').onclick = () => $('#qStart').click();
    $('#qBack').onclick = () => { $('#quizGame').classList.add('hidden'); $('#quizSetup').classList.remove('hidden'); bestTxt(); };
  };

  // ── klawiatura (komputer) ──
  document.addEventListener('keydown', e => {
    if (e.target.matches('input, select, textarea') || dlg.open) return;
    const tab = $('.panel.active').id;
    if (tab === 'fiszki') {
      if (e.code === 'Space') { e.preventDefault(); fcFlip(); }
      else if (e.key === '1' || e.key === 'ArrowLeft') fcAnswer(false);
      else if (e.key === '2' || e.key === 'ArrowRight') fcAnswer(true);
    } else if (tab === 'quiz' && !$('#quizGame').classList.contains('hidden')) {
      const btns = $$('#qAnswers .btn');
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= btns.length && !q.answered) answerQ(btns[n - 1]);
      else if ((e.key === 'Enter' || e.code === 'Space') && q.answered && !$('#qNext').classList.contains('hidden')) { e.preventDefault(); $('#qNext').click(); }
    }
  });

  // ── start ──
  renderGrid();
  renderCompare();
  bestTxt();
  showTab(store.get('tab', 'kraje'));

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
