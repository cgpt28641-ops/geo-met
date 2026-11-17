// Prywatne API GeoMeta (Cloudflare Pages Functions).
// Wymaga w ustawieniach projektu Cloudflare Pages:
//   • KV namespace binding:  GEOMETA_KV
//   • Zmienne (jako „Secret”): ADMIN_USER, ADMIN_PASS, SESSION_SECRET, UPLOAD_TOKEN
//   • Opcjonalnie: MAPILLARY_TOKEN (klucz klienta Mapillary do trybu „Prawdziwe ulice”)
// Bez nich API zwraca 503, a reszta strony działa normalnie.

const COOKIE = 'gm_sess';
const SESSION_DAYS = 30;
const enc = new TextEncoder();

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });

async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// porównanie w stałym czasie (nie zdradza długości pasującego prefiksu)
async function safeEqual(a, b) {
  const k = 'cmp';
  return (await hmac(k, String(a))) === (await hmac(k, String(b)));
}

async function makeSession(env) {
  const exp = Date.now() + SESSION_DAYS * 864e5;
  const payload = `${env.ADMIN_USER}.${exp}`;
  return `${payload}.${await hmac(env.SESSION_SECRET, payload)}`;
}

async function checkSession(env, request) {
  const m = (request.headers.get('cookie') || '').match(new RegExp(`${COOKIE}=([^;]+)`));
  if (!m) return false;
  const parts = decodeURIComponent(m[1]).split('.');
  if (parts.length < 3) return false;
  const sig = parts.pop(), payload = parts.join('.');
  const exp = +parts[parts.length - 1];
  if (!exp || exp < Date.now()) return false;
  return safeEqual(sig, await hmac(env.SESSION_SECRET, payload));
}

async function checkUpload(env, request) {
  const h = request.headers.get('authorization') || '';
  return h.startsWith('Bearer ') && env.UPLOAD_TOKEN && safeEqual(h.slice(7), env.UPLOAD_TOKEN);
}

// prosta blokada zgadywania hasła: max 8 nieudanych prób na 15 min z jednego IP
async function tooManyAttempts(env, ip) {
  const n = +(await env.GEOMETA_KV.get(`fail:${ip}`)) || 0;
  return n >= 8;
}
async function noteFailure(env, ip) {
  const n = (+(await env.GEOMETA_KV.get(`fail:${ip}`)) || 0) + 1;
  await env.GEOMETA_KV.put(`fail:${ip}`, String(n), { expirationTtl: 900 });
}

const cookieHeader = (value, maxAge) =>
  `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;

export async function onRequest({ request, env, params }) {
  const path = '/' + [].concat(params.path || []).join('/');
  const method = request.method;

  // ── publiczne: konfiguracja i wyzwanie dnia (bez logowania) ──
  if (path === '/config') return json({ mapillary: env.MAPILLARY_TOKEN || null, ranking: !!env.GEOMETA_KV });
  const daily = path.match(/^\/daily\/(\d{4}-\d{2}-\d{2})$/);
  if (daily) {
    if (!env.GEOMETA_KV) return json({ error: 'Ranking nie jest skonfigurowany (brak KV).' }, 503);
    const day = daily[1], key = `daily:${day}`;
    if (method === 'GET') return json({ wyniki: (await env.GEOMETA_KV.get(key, 'json')) || [] });
    if (method === 'POST') {
      // tylko dzisiejszy wynik (±1 dzień na strefy czasowe), jeden na nick
      const now = Date.now(), d = Date.parse(day + 'T12:00:00Z');
      if (!(Math.abs(now - d) < 40 * 3600e3)) return json({ error: 'To wyzwanie jest już zamknięte.' }, 400);
      let body = {};
      try { body = await request.json(); } catch { /* puste */ }
      const nick = String(body.nick || '').replace(/[<>&"'`]/g, '').trim().slice(0, 20);
      const score = Math.round(+body.score);
      const rundy = Array.isArray(body.rundy) ? body.rundy.slice(0, 5).map(x => Math.max(0, Math.min(5000, Math.round(+x) || 0))) : [];
      if (!nick || !(score >= 0 && score <= 25000) || rundy.reduce((a, b) => a + b, 0) !== score) return json({ error: 'Nieprawidłowy wynik.' }, 400);
      const list = (await env.GEOMETA_KV.get(key, 'json')) || [];
      if (list.some(x => x.nick.toLowerCase() === nick.toLowerCase())) return json({ error: 'Ten nick ma już dziś wynik — wybierz inny.' }, 409);
      list.push({ nick, score, rundy, t: new Date().toISOString() });
      list.sort((a, b) => b.score - a.score);
      await env.GEOMETA_KV.put(key, JSON.stringify(list.slice(0, 500)), { expirationTtl: 60 * 864e2 });
      return json({ ok: true, miejsce: list.findIndex(x => x.nick === nick) + 1, wyniki: list });
    }
  }

  if (!env.GEOMETA_KV || !env.ADMIN_USER || !env.ADMIN_PASS || !env.SESSION_SECRET) {
    return json({ error: 'Prywatna sekcja nie jest skonfigurowana (brak KV lub zmiennych w Cloudflare).' }, 503);
  }
  const ip = request.headers.get('cf-connecting-ip') || 'x';

  // ── logowanie ──
  if (path === '/login' && method === 'POST') {
    if (await tooManyAttempts(env, ip)) return json({ error: 'Za dużo prób. Spróbuj za 15 minut.' }, 429);
    let body = {};
    try { body = await request.json(); } catch { /* puste */ }
    const ok = (await safeEqual(body.user || '', env.ADMIN_USER)) & (await safeEqual(body.pass || '', env.ADMIN_PASS));
    if (!ok) { await noteFailure(env, ip); return json({ error: 'Zły login lub hasło.' }, 401); }
    return json({ ok: true }, 200, { 'set-cookie': cookieHeader(await makeSession(env), SESSION_DAYS * 86400) });
  }
  if (path === '/logout') return json({ ok: true }, 200, { 'set-cookie': cookieHeader('', 0) });
  if (path === '/me') return json({ zalogowany: await checkSession(env, request) });

  // ── aplikacja na komputer (token) ──
  if (path === '/ping') {
    if (!(await checkUpload(env, request))) return json({ error: 'Zły token.' }, 401);
    return json({ ok: true });
  }
  if (path === '/rundy' && method === 'POST') {
    if (!(await checkUpload(env, request))) return json({ error: 'Zły token.' }, 401);
    const d = await request.json();
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const obrazy = (d.obrazy || []).slice(0, 4);
    await Promise.all(obrazy.map((b64, i) => env.GEOMETA_KV.put(`img:${id}:${i}`, b64)));
    const wpis = {
      id, czas: d.czas || new Date().toISOString(), obrazy: obrazy.length,
      poprawny_kod: String(d.poprawny_kod || '').toLowerCase().slice(0, 2), poprawny_kraj: d.poprawny_kraj || '',
      miejsce: d.miejsce || '', twoj_strzal: d.twoj_strzal || '', trafiony_kraj: !!d.trafiony_kraj,
      lekcja: d.lekcja || '', przeoczone: d.przeoczone || [], zagadka: d.zagadka || '',
    };
    await env.GEOMETA_KV.put(`runda:${id}`, JSON.stringify(wpis));
    return json({ ok: true, id });
  }

  // ── wszystko dalej tylko po zalogowaniu ──
  if (!(await checkSession(env, request))) return json({ error: 'Zaloguj się.' }, 401);

  if (path === '/rundy' && method === 'GET') {
    const out = [];
    let cursor;
    do {
      const page = await env.GEOMETA_KV.list({ prefix: 'runda:', cursor });
      const vals = await Promise.all(page.keys.map(k => env.GEOMETA_KV.get(k.name, 'json')));
      out.push(...vals.filter(Boolean));
      cursor = page.list_complete ? null : page.cursor;
    } while (cursor && out.length < 2000);
    out.sort((a, b) => (a.czas < b.czas ? 1 : -1));
    return json({ rundy: out });
  }
  const img = path.match(/^\/img\/([\w-]+)\/(\d)$/);
  if (img && method === 'GET') {
    const b64 = await env.GEOMETA_KV.get(`img:${img[1]}:${img[2]}`);
    if (!b64) return new Response('brak', { status: 404 });
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    return new Response(bytes, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=86400' } });
  }
  const del = path.match(/^\/rundy\/([\w-]+)$/);
  if (del && method === 'DELETE') {
    await env.GEOMETA_KV.delete(`runda:${del[1]}`);
    await Promise.all([0, 1, 2, 3].map(i => env.GEOMETA_KV.delete(`img:${del[1]}:${i}`)));
    return json({ ok: true });
  }
  return json({ error: 'Nie znaleziono.' }, 404);
}
