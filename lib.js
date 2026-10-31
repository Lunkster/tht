// Gemensamt: Supabase-anrop, inloggning med gemensam kod, hjälpfunktioner.

export const SUPABASE_URL = 'https://nlvgisjssbjethumvgdz.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_3wzcVvDgcoupfWSqAis4eg_bz2e6jiG'; // publik nyckel, skyddet är RLS
// Två delade konton – koden är lösenordet. Rollen (admin/markor) står i kontots app_metadata
// och följer med i inloggningens JWT; databasens regler (RLS) avgör vad rollen får skriva.
const KONTON = ['h.lundqvist+tht@gmail.com', 'h.lundqvist+thtmarkor@gmail.com', 'h.lundqvist+thtlasare@gmail.com']; // admin, markör, läsare (visningskoden)
const SESSION_KEY = 'tht-session';

const cache = new Map();

// Navigering: varje ny sida får ett nummer. En sida som laddar klart efter att man
// hunnit gå vidare får inte skriva över den nya sidan.
let navCount = 0;
export const nyNav = () => ++navCount;
export const nuNav = () => navCount;
export const aktuell = (id) => id === navCount;
export const clearCache = () => cache.clear();

// ---------- läsa ----------
export async function api(path, { fresh = false } = {}) {
  if (!fresh && cache.has(path)) return cache.get(path);
  const headers = { apikey: SUPABASE_KEY, Accept: 'application/json' };
  const s = await session(false);
  if (s) headers.Authorization = `Bearer ${s.access_token}`;
  const p = fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers }).then(async (r) => {
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    return r.json();
  });
  if (!fresh) cache.set(path, p);
  try { return await p; } catch (e) { cache.delete(path); throw e; }
}

// PostgREST levererar högst 1000 rader per anrop – hämta i sidor (path måste ha ?select=… och order=…).
export async function allaRader(path) {
  const ut = [];
  for (let off = 0; ; off += 1000) {
    const del = await api(`${path}&limit=1000&offset=${off}`, { fresh: true });
    ut.push(...del);
    if (del.length < 1000) return ut;
  }
}

// ---------- funktioner i databasen (rpc) som anon, t.ex. banbetyg via personlig länk ----------
export async function rpc(name, args) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(args),
  });
  if (!r.ok) { const t = await r.text(); let m = t; try { m = JSON.parse(t).message || t; } catch { /* text */ } throw new Error(m); }
  const txt = await r.text();
  return txt ? JSON.parse(txt) : null;
}

// ---------- skriva (kräver inloggning) ----------
export async function write(method, path, body, prefer = 'return=representation') {
  const s = await session(true);
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SUPABASE_KEY, Authorization: `Bearer ${s.access_token}`,
      'Content-Type': 'application/json', Prefer: prefer,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text();
    let msg = t; try { msg = JSON.parse(t).message || t; } catch { /* text */ }
    const err = new Error(msg); err.status = r.status; err.code = (() => { try { return JSON.parse(t).code; } catch { return null; } })();
    throw err;
  }
  clearCache();
  const txt = await r.text();
  return txt ? JSON.parse(txt) : null;
}

// ---------- Storage (foton, migrering 25) ----------
// Inloggad: som admin/markör. Annars som anon (uppladdning via personlig länk, som databasen har reserverat).
export const lagringUrl = (namn) => `${SUPABASE_URL}/storage/v1/object/public/foton/${namn}`;
// Bucketen är privat (migrering 27): tillfälliga bildlänkar, 12 timmar, sparas i minnet en stund
const signCache = new Map();
export async function signera(namn) {
  const nu = Date.now(), ut = {}, saknas = [];
  namn.forEach((n) => { const c = signCache.get(n); if (c && c.tills > nu + 3_600_000) ut[n] = c.url; else saknas.push(n); });
  const s = await session(false);
  if (saknas.length && s) {
    for (let i = 0; i < saknas.length; i += 200) {
      const r = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/foton`, {
        method: 'POST', headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresIn: 12 * 3600, paths: saknas.slice(i, i + 200) }),
      });
      if (!r.ok) throw new Error(`Bildlänkar: ${r.status} ${await r.text()}`);
      (await r.json()).forEach((x) => { if (x.signedURL) { const url = `${SUPABASE_URL}/storage/v1${x.signedURL}`; ut[x.path] = url; signCache.set(x.path, { url, tills: nu + 12 * 3_600_000 }); } });
    }
  }
  return ut;
}
// Edge-funktioner (t.ex. foto-lank) anropas utan inloggning
export async function funktion(namn, body) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/${namn}`, { method: 'POST', headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { /* text */ }
  if (!r.ok) throw new Error(j?.message || t);
  return j;
}
export async function lagring(method, namn, body) {
  const s = await session(false);
  const headers = { apikey: SUPABASE_KEY };
  if (s) headers.Authorization = `Bearer ${s.access_token}`;
  let url = `${SUPABASE_URL}/storage/v1/object/foton`;
  if (method === 'POST') { url += `/${namn}`; headers['Content-Type'] = 'image/jpeg'; headers['cache-control'] = 'max-age=31536000'; headers['x-upsert'] = 'false'; }
  else { headers['Content-Type'] = 'application/json'; body = JSON.stringify({ prefixes: namn }); }   // DELETE: namn = lista
  const r = await fetch(url, { method, headers, body });
  if (!r.ok) { const t = await r.text(); let m = t; try { m = JSON.parse(t).message || t; } catch { /* text */ } throw new Error(m); }
  return r.json().catch(() => null);
}

// ---------- inloggning ----------
function load() { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; } }
function save(s) { try { s ? localStorage.setItem(SESSION_KEY, JSON.stringify(s)) : localStorage.removeItem(SESSION_KEY); } catch { /* privat läge */ } }
let current = load();
if (current && !current.roll) current.roll = rollUr(current.access_token); // äldre sparad session

async function auth(grant, body) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=${grant}`, {
    method: 'POST', headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!r.ok) return null;
  const j = await r.json();
  return { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at, roll: rollUr(j.access_token) };
}
function rollUr(token) {
  try {
    const b = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = new TextDecoder().decode(Uint8Array.from(atob(b), (c) => c.charCodeAt(0)));
    return JSON.parse(json).app_metadata?.roll ?? null;
  } catch { return null; }
}

export async function login(code) {
  let s = null;
  for (const email of KONTON) { s = await auth('password', { email, password: code }); if (s) break; }
  current = s; save(s);
  return !!s;
}
export function logout() { current = null; save(null); }
export const isLoggedIn = () => !!current;
export const roll = () => current?.roll ?? null;          // 'admin', 'markor' eller null
export const arAdmin = () => roll() === 'admin';
export const arMarkor = () => roll() === 'markor';
// Får se foton, karuseller, minnesvärda moment och krönikor (migrering 27): admin, markör eller läsare
export const kanSe = () => ['admin', 'markor', 'lasare'].includes(roll());
// Sessioner sparade före rollerna saknar roll – hämta en ny token (den får rollen) vid start.
export async function uppdateraRoll() {
  if (!current || current.roll) return;
  const s = await auth('refresh_token', { refresh_token: current.refresh_token });
  if (s) { current = s; save(s); }
}

async function session(required) {
  if (!current) { if (required) throw Object.assign(new Error('Inte inloggad'), { status: 401 }); return null; }
  if (current.expires_at * 1000 < Date.now() + 60_000) {
    const s = await auth('refresh_token', { refresh_token: current.refresh_token });
    if (!s) { logout(); if (required) throw Object.assign(new Error('Inloggningen har gått ut'), { status: 401 }); return null; }
    current = s; save(s);
  }
  return current;
}

// ---------- hjälp ----------
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmt = (v, d = 0) => (v === null || v === undefined || Number.isNaN(v)) ? '–' : Number(v).toLocaleString('sv-SE', { minimumFractionDigits: d, maximumFractionDigits: d });
export const datum = (d) => d ?? '';   // datum visas alltid som ÅÅÅÅ-MM-DD (så lagras de också)

// Datum skrivs som ÅÅÅÅ-MM-DD. Tillåter även 20260904 och 2026-9-4. Tomt → null, ogiltigt → NaN.
export function tolkaDatum(txt) {
  const t = String(txt ?? '').trim();
  if (!t) return null;
  const m = t.match(/^(\d{4})[-./ ]?(\d{1,2})[-./ ]?(\d{1,2})$/);
  if (!m) return NaN;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return NaN;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Samma regler som vyn v_score: extraslag fungerar även för plus-hcp, tak par + 5.
export function extraslag(spelHcp, index) {
  return Math.floor(spelHcp / 18) + (index <= (((spelHcp % 18) + 18) % 18) ? 1 : 0);
}
export function poang(slag, par, index, spelHcp) {
  if (slag === null || slag === undefined) return null;
  return Math.max(0, par + extraslag(spelHcp, index) + 2 - slag);
}
