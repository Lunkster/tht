// Gemensamt: Supabase-anrop, inloggning med gemensam kod, hjälpfunktioner.

export const SUPABASE_URL = 'https://nlvgisjssbjethumvgdz.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_3wzcVvDgcoupfWSqAis4eg_bz2e6jiG'; // publik nyckel, skyddet är RLS
const AUTH_EMAIL = 'h.lundqvist+tht@gmail.com'; // delat konto – koden är lösenordet
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

// ---------- inloggning ----------
function load() { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; } }
function save(s) { try { s ? localStorage.setItem(SESSION_KEY, JSON.stringify(s)) : localStorage.removeItem(SESSION_KEY); } catch { /* privat läge */ } }
let current = load();

async function auth(grant, body) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=${grant}`, {
    method: 'POST', headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!r.ok) return null;
  const j = await r.json();
  return { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at };
}

export async function login(code) {
  const s = await auth('password', { email: AUTH_EMAIL, password: code });
  current = s; save(s);
  return !!s;
}
export function logout() { current = null; save(null); }
export const isLoggedIn = () => !!current;

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
