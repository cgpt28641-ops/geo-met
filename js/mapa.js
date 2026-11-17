// Interaktywna mapa świata (d3-geo + topojson, ładowane dopiero gdy potrzebne).
(() => {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  let ready = null;

  const loadScript = src => new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s);
  });

  function load() {
    if (ready) return ready;
    ready = (async () => {
      if (!window.d3 || !window.d3.geoPath) {
        await loadScript('js/vendor/d3-array.min.js');
        await loadScript('js/vendor/d3-geo.min.js');
      }
      if (!window.topojson) await loadScript('js/vendor/topojson-client.min.js');
      const topo = await fetch('data/world.json').then(r => r.json());
      const fc = topojson.feature(topo, topo.objects.countries);
      const byCode = {};
      for (const f of fc.features) {
        const c = f.properties.c;
        if (c) (byCode[c] = byCode[c] || []).push(f);
      }
      return { features: fc.features, byCode, punkty: topo.punkty || {} };
    })().catch(e => { ready = null; throw e; });
    return ready;
  }

  // ── odległość od punktu do kraju (0, gdy punkt jest w środku) ──
  function distanceKm(world, code, lonlat) {
    const feats = world.byCode[code] || [];
    if (feats.some(f => d3.geoContains(f, lonlat))) return 0;
    let best = Infinity;
    const visit = coords => {
      if (typeof coords[0] === 'number') { const d = d3.geoDistance(lonlat, coords); if (d < best) best = d; return; }
      for (let i = 0; i < coords.length; i += (typeof coords[0][0] === 'number' && coords.length > 400 ? 3 : 1)) visit(coords[i]);
    };
    feats.forEach(f => visit(f.geometry.coordinates));
    if (world.punkty[code]) best = Math.min(best, d3.geoDistance(lonlat, world.punkty[code]));
    return best * 6371;
  }
  const centerOf = (world, code) => world.punkty[code] || (world.byCode[code] ? d3.geoCentroid({ type: 'FeatureCollection', features: world.byCode[code] }) : null);

  /**
   * Rysuje mapę w kontenerze.
   * opts: { fill(code) → kolor, onCountry(code), onPoint(lonlat), title(code) → tekst, height }
   * Zwraca API: { setMarker(lonlat, cls), line(a, b), highlight(code, cls), zoomTo(code), reset(), redraw() }
   */
  function render(el, world, opts = {}) {
    el.innerHTML = '';
    el.classList.add('wmap');
    const W = 1000, H = 520;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('role', 'img');
    const g = document.createElementNS(NS, 'g'); svg.appendChild(g);
    const proj = d3.geoNaturalEarth1().fitExtent([[6, 6], [W - 6, H - 6]], { type: 'Sphere' });
    const path = d3.geoPath(proj);

    const sphere = document.createElementNS(NS, 'path');
    sphere.setAttribute('d', path({ type: 'Sphere' })); sphere.setAttribute('class', 'wm-sea'); g.appendChild(sphere);
    const grat = document.createElementNS(NS, 'path');
    grat.setAttribute('d', path(d3.geoGraticule10())); grat.setAttribute('class', 'wm-grat'); g.appendChild(grat);

    const countryEls = {};
    for (const f of world.features) {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', path(f) || '');
      const c = f.properties.c;
      p.setAttribute('class', 'wm-c' + (c ? ' has' : ''));
      if (c) { p.dataset.c = c; (countryEls[c] = countryEls[c] || []).push(p); }
      if (opts.title) { const t = document.createElementNS(NS, 'title'); t.textContent = c ? opts.title(c) : f.properties.n; p.appendChild(t); }
      g.appendChild(p);
    }
    for (const [c, ll] of Object.entries(world.punkty)) {
      const [x, y] = proj(ll);
      const dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('cx', x); dot.setAttribute('cy', y); dot.setAttribute('r', 3.2); dot.dataset.r = 3.2;
      dot.setAttribute('class', 'wm-c has wm-dot'); dot.dataset.c = c;
      (countryEls[c] = countryEls[c] || []).push(dot);
      if (opts.title) { const t = document.createElementNS(NS, 'title'); t.textContent = opts.title(c); dot.appendChild(t); }
      g.appendChild(dot);
    }
    const overlay = document.createElementNS(NS, 'g'); g.appendChild(overlay);
    el.appendChild(svg);

    const controls = document.createElement('div');
    controls.className = 'wm-ctrl';
    controls.innerHTML = '<button type="button" data-z="1" aria-label="Przybliż">+</button><button type="button" data-z="-1" aria-label="Oddal">−</button><button type="button" data-z="0" aria-label="Cała mapa">⟲</button>';
    el.appendChild(controls);

    function paint() {
      if (!opts.fill) return;
      for (const [c, els] of Object.entries(countryEls)) { const col = opts.fill(c); els.forEach(e => { e.style.fill = col || ''; }); }
    }
    paint();

    // ── przybliżanie i przesuwanie ──
    let k = 1, tx = 0, ty = 0;
    const apply = () => {
      g.setAttribute('transform', `translate(${tx},${ty}) scale(${k})`);
      g.querySelectorAll('circle').forEach(c => c.setAttribute('r', (+c.dataset.r || 4) / Math.sqrt(k) / (c.classList.contains('wm-mark') ? Math.sqrt(k) : 1)));
    };
    const clampT = () => { tx = Math.min(0, Math.max(W - W * k, tx)); ty = Math.min(0, Math.max(H - H * k, ty)); };
    const toSvg = (cx, cy) => { const r = svg.getBoundingClientRect(); return [(cx - r.left) / r.width * W, (cy - r.top) / r.height * H]; };
    function zoomAt(f, sx, sy) {
      const nk = Math.max(1, Math.min(40, k * f));
      tx = sx - (sx - tx) * nk / k; ty = sy - (sy - ty) * nk / k; k = nk; clampT(); apply();
    }
    controls.onclick = e => {
      const z = e.target.dataset.z; if (z === undefined) return;
      if (z === '0') { k = 1; tx = ty = 0; apply(); } else zoomAt(z === '1' ? 1.8 : 1 / 1.8, W / 2, H / 2);
    };
    svg.addEventListener('wheel', e => { e.preventDefault(); const [sx, sy] = toSvg(e.clientX, e.clientY); zoomAt(e.deltaY < 0 ? 1.25 : 0.8, sx, sy); }, { passive: false });

    const pts = new Map(); let moved = 0, start = null, pinch = null;
    svg.addEventListener('pointerdown', e => {
      svg.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 1) { start = [e.clientX, e.clientY, tx, ty]; moved = 0; }
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), k }; }
    });
    svg.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      const r = svg.getBoundingClientRect(), sc = W / r.width;
      if (pts.size === 2 && pinch) {
        const [a, b] = [...pts.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        const [sx, sy] = toSvg((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
        zoomAt((pinch.k * d / pinch.d) / k, sx, sy); moved = 99; return;
      }
      if (start && k > 1) {
        const dx = e.clientX - start[0], dy = e.clientY - start[1];
        moved = Math.max(moved, Math.hypot(dx, dy));
        tx = start[2] + dx * sc; ty = start[3] + dy * sc; clampT(); apply();
      } else if (start) moved = Math.max(moved, Math.hypot(e.clientX - start[0], e.clientY - start[1]));
    });
    const end = e => {
      const wasTap = pts.size === 1 && moved < 8;
      pts.delete(e.pointerId); if (pts.size < 2) pinch = null;
      if (!wasTap || e.type === 'pointercancel') return;
      const [sx, sy] = toSvg(e.clientX, e.clientY);
      const lonlat = proj.invert([(sx - tx) / k, (sy - ty) / k]);
      if (opts.onPoint && lonlat) opts.onPoint(lonlat);
      const tgt = document.elementFromPoint(e.clientX, e.clientY);
      if (opts.onCountry && tgt && tgt.dataset && tgt.dataset.c) opts.onCountry(tgt.dataset.c);
    };
    svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);

    const api = {
      proj, svg,
      redraw: paint,
      clear() { overlay.innerHTML = ''; Object.values(countryEls).flat().forEach(e => e.classList.remove('hl', 'hl-bad', 'hl-good')); },
      setMarker(ll, cls = 'guess') {
        const [x, y] = proj(ll); const m = document.createElementNS(NS, 'circle');
        m.setAttribute('cx', x); m.setAttribute('cy', y); m.dataset.r = 6; m.setAttribute('r', 6 / k); m.setAttribute('class', 'wm-mark ' + cls);
        overlay.appendChild(m); return m;
      },
      line(a, b) {
        const l = document.createElementNS(NS, 'path');
        l.setAttribute('d', path({ type: 'LineString', coordinates: [a, b] })); l.setAttribute('class', 'wm-line');
        overlay.appendChild(l);
      },
      highlight(code, cls = 'hl') { (countryEls[code] || []).forEach(e => e.classList.add(cls)); },
      zoomTo(lls) {
        const xy = lls.map(ll => proj(ll));
        const xs = xy.map(p => p[0]), ys = xy.map(p => p[1]);
        const bw = Math.max(80, Math.max(...xs) - Math.min(...xs)) * 1.6, bh = Math.max(50, Math.max(...ys) - Math.min(...ys)) * 1.6;
        k = Math.max(1, Math.min(12, Math.min(W / bw, H / bh)));
        const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
        tx = W / 2 - cx * k; ty = H / 2 - cy * k; clampT(); apply();
      },
      reset() { k = 1; tx = ty = 0; apply(); },
    };
    return api;
  }

  window.GMMap = { load, render, distanceKm, centerOf };
})();
