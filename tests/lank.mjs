// Banbetyg via personlig länk: publik sida + länkar under Admin → Banbetyg.
import { chromium } from 'playwright';
const ADMIN = 'x.eyJhcHBfbWV0YWRhdGEiOnsicm9sbCI6ImFkbWluIn19.y';
const b = await chromium.launch();
const log = [];
const banor = [{ bana_id: 33, namn: 'Karlskoga GK', betyg: null }, { bana_id: 34, namn: 'Degerfors Golf', betyg: 4.0 }, { bana_id: 77, namn: 'Örebro City Golf & Country Club', betyg: null }];
let lankar = [{ kod: 'abc123', person_id: 9, anvand: null }];
const route = (inlogg) => async (r) => {
  const u = new URL(r.request().url()); if (!u.hostname.includes('supabase')) return r.continue();
  const J = (x, s = 200) => r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(x) });
  const t = u.pathname.replace('/rest/v1/', ''); const m = r.request().method(); const body = r.request().postData();
  if (m !== 'GET') log.push(`${m} ${t}${decodeURIComponent(u.search)} ${body ?? ''} auth=${r.request().headers().authorization ? 'ja' : 'nej'}`);
  if (t === 'rpc/betyg_lank_info') { const k = JSON.parse(body).p_kod; return J(k === 'abc123' ? { fornamn: 'Henrik', tht: [{ tht_nr: 29, artal: 2026, ort: 'Degerfors', banor }, { tht_nr: 28, artal: 2025, ort: 'Lindesberg', banor: [{ bana_id: 74, namn: 'Lindesberga GK', betyg: 3 }] }, { tht_nr: 27, artal: 2024, ort: 'Portugal', banor: [{ bana_id: 71, namn: 'Praia', betyg: null }] }] } : null); }
  if (t === 'rpc/lamna_banbetyg') return J(JSON.parse(body).p_betyg.length);
  if (t === 'tht') return J([{ nr: 29, artal: 2026, ort: 'Degerfors', klar: true, deltavling: [{ id: 201 }] }]);
  if (t === 'deltavling') return J([{ ordning: 1, banversion: { bana: { id: 33, namn: 'Karlskoga GK' } } }, { ordning: 2, banversion: { bana: { id: 34, namn: 'Degerfors Golf' } } }]);
  if (t === 'v_runda') return J([{ person_id: 9, ordning: 1 }, { person_id: 9, ordning: 2 }, { person_id: 1, ordning: 1 }]);
  if (t === 'ban_betyg') return J(u.search.includes('tht_nr') ? [{ bana_id: 34, person_id: 9, betyg: 4 }] : [{ person_id: 9 }, { person_id: 9 }, { person_id: 1 }]);
  if (t === 'v_tht_resultat') return J([{ person_id: 9 }, { person_id: 1 }, { person_id: 3 }, { person_id: 9 }]);
  if (t === 'person') return J([{ id: 1, fornamn: 'Jörgen', efternamn: 'Nilsson' }, { id: 9, fornamn: 'Henrik', efternamn: 'Lundqvist' }, { id: 3, fornamn: 'Robert', efternamn: 'Lindström' }]);
  if (t === 'spelar_lank') { if (m === 'POST') { JSON.parse(body).forEach((x) => lankar.push({ kod: 'ny' + x.person_id, person_id: x.person_id, anvand: null })); return r.fulfill({ status: 201, body: '' }); } return J(lankar); }
  if (t === 'person_kontakt') return J([{ person_id: 9, epost: 'henrik@example.com' }, { person_id: 1, epost: 'jorgen@example.com' }]);
  return J([]);
};
// 1. publik sida, ej inloggad
let p = await b.newPage({ viewport: { width: 390, height: 844 } });
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.route('**/*', route(false));
await p.goto('http://localhost:8765/#/betyg/abc123'); await p.waitForTimeout(700);
console.log('PUBLIK:', (await p.textContent('#app')).replace(/\s+/g, ' ').slice(0, 200));
console.log('PUBLIK texter:', (await p.locator('.betyg-rad .meta').allTextContents()).join(' | '));
console.log('GRUPPER:', (await p.locator('.betyg-ar summary').allTextContents()).map((x) => x.replace(/\s+/g, ' ').trim()).join(' | '), '| öppna:', await p.locator('.betyg-ar[open]').count());
await p.click('.stjarnval button[data-k="29-33"][data-v="5"]'); await p.click('.stjarnval button[data-k="29-34"][data-v="4"]');
console.log('efter klick:', (await p.locator('.betyg-rad .meta').allTextContents()).join(' | '), '|', await p.textContent('#msg'));
await p.click('.betyg-ar:not([open]) summary'); await p.click('.stjarnval button[data-k="27-71"][data-v="2"]');
await p.screenshot({ path: 'lank-publik.png', fullPage: true });
const bredd = await p.evaluate(() => document.documentElement.scrollWidth); console.log('bredd', bredd);
await p.click('#spara'); await p.waitForTimeout(400); console.log('sparat:', await p.textContent('#msg'));
await p.goto('http://localhost:8765/#/betyg/fel'); await p.waitForTimeout(500);
console.log('FEL KOD:', (await p.textContent('#app')).replace(/\s+/g, ' ').slice(0, 80));
await p.close();
// 2. admin
p = await b.newPage({ viewport: { width: 390, height: 844 } });
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.addInitScript((tok) => localStorage.setItem('tht-session', JSON.stringify({ access_token: tok, refresh_token: 'r', expires_at: Date.now() / 1000 + 3600 })), ADMIN);
await p.route('**/*', route(true));
await p.goto('http://localhost:8765/#/admin/banbetyg'); await p.waitForTimeout(800);
console.log('ADMIN rutnät:', (await p.locator('.betygtabell tbody tr').allTextContents()).map((x) => x.replace(/\s+/g, ' ').trim().slice(0, 30)).join(' | '), '| prickar:', await p.locator('.betygtabell td.dim').count());
console.log('ADMIN länkar:', (await p.locator('.lankrad').allTextContents()).map((x) => x.replace(/\s+/g, ' ').trim()).join(' | '));
console.log('mejl:', decodeURIComponent(await p.getAttribute('.lankrad a.btn', 'href')).replace(/\n/g, '⏎').slice(0, 220));
await p.screenshot({ path: 'lank-admin.png', fullPage: true });
await p.click('#allalankar'); await p.waitForTimeout(800);
console.log('efter alla:', await p.textContent('.ok'), '|', (await p.locator('.lankrad .meta').allTextContents()).join(' | '));
await b.close();
console.log(log.join('\n'));
