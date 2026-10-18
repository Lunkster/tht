// THT utan scorekort (1999): årssida, all-time och spelarsida.
import { chromium } from 'playwright';
import fs from 'fs';
const mock = fs.readFileSync(new URL('./leaflet-mock.js', import.meta.url), 'utf8');
const tht = [{ nr: 2, artal: 1999, ort: 'Alvesta', klar: true }, { nr: 3, artal: 2000, ort: 'Hässleholm', klar: true }];
const res2 = [
  { tht_nr: 2, artal: 1999, person_id: 3, fornamn: 'Robert', rundor: 5, poang: 159, slag: null, puttar_per_runda: null, snitt_spel_hcp: null, placering: 1, puttar_per_hal: null },
  { tht_nr: 2, artal: 1999, person_id: 2, fornamn: 'Marcus', rundor: 5, poang: 146, slag: null, puttar_per_runda: null, snitt_spel_hcp: null, placering: 2, puttar_per_hal: null },
  { tht_nr: 2, artal: 1999, person_id: 1, fornamn: 'Jörgen', rundor: 5, poang: 144, slag: null, puttar_per_runda: null, snitt_spel_hcp: null, placering: 3, puttar_per_hal: null },
  { tht_nr: 2, artal: 1999, person_id: 5, fornamn: 'Johan', rundor: 5, poang: 138, slag: null, puttar_per_runda: null, snitt_spel_hcp: null, placering: 4, puttar_per_hal: null }];
const res3 = [{ tht_nr: 3, artal: 2000, person_id: 5, fornamn: 'Johan', rundor: 1, poang: 40, slag: 90, snitt_spel_hcp: 12, placering: 1, puttar_per_hal: 1.8 },
  { tht_nr: 3, artal: 2000, person_id: 3, fornamn: 'Robert', rundor: 1, poang: 30, slag: 95, snitt_spel_hcp: 10, placering: 2, puttar_per_hal: 1.9 }];
const rundor3 = [{ person_id: 5, fornamn: 'Johan', tht_nr: 3, artal: 2000, ordning: 1, deltavling: 'NoWhere', poang: 40, slag: 90, antal_hal: 18, puttar: 32, hal_med_puttar: 18, placering: 1, spel_hcp: 12 },
  { person_id: 3, fornamn: 'Robert', tht_nr: 3, artal: 2000, ordning: 1, deltavling: 'NoWhere', poang: 30, slag: 95, antal_hal: 18, puttar: 34, hal_med_puttar: 18, placering: 2, spel_hcp: 10 }];
const delt2 = [1, 2, 3, 4, 5].map((o) => ({ id: 21 + o, ordning: o, namn: 'D' + o, datum: `1999-07-${28 + o}`, narmast_hal: null, longest_hal: null, vinnare_utan_kort: { 1: 5, 2: 2, 3: 3, 4: 3, 5: 5 }[o], banversion: { bana: { id: 4, namn: 'Alvesta GK' } } }));
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.route('**/*', (r) => {
  const u = new URL(r.request().url()); const q = decodeURIComponent(u.search);
  if (u.hostname === 'unpkg.com') return u.pathname.endsWith('.js') ? r.fulfill({ contentType: 'application/javascript', body: mock }) : r.fulfill({ contentType: 'text/css', body: '' });
  if (!u.hostname.includes('supabase')) return r.continue();
  const J = (x) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(x) });
  const t = u.pathname.replace('/rest/v1/', '');
  if (t === 'tht') return J(tht);
  if (t === 'v_tht_resultat') {
    if (q.includes('person_id=eq.5')) return J([res2[3], res3[0]]);
    if (q.includes('tht_nr=eq.2')) return J(res2);
    if (q.includes('tht_nr=eq.3')) return J(res3);
    return J([...res2, ...res3]);
  }
  if (t === 'v_runda') { if (q.includes('tht_nr=eq.2')) return J([]); if (q.includes('person_id=eq.5')) return J([rundor3[0]]); return J(q.includes('tht_nr=eq.3') ? rundor3 : rundor3); }
  if (t === 'deltavling') {
    if (q.includes('vinnare_utan_kort=not.is.null')) return J(delt2.map((d) => ({ vinnare_utan_kort: d.vinnare_utan_kort, tht: { artal: 1999 } })));
    if (q.includes('vinnare_utan_kort=eq.5')) return J([{ tht_nr: 2, ordning: 1 }, { tht_nr: 2, ordning: 5 }]);
    if (q.includes('tht_nr=eq.2')) return J(delt2);
    return J([]);
  }
  if (t === 'person') return J(q.includes('id=eq.5') ? [{ id: 5, fornamn: 'Johan', efternamn: 'Watz', aktiv: true }] : [{ id: 5, fornamn: 'Johan' }]);
  return J([]);
});
await p.goto('http://localhost:8765/#/ar/1999'); await p.waitForTimeout(900);
console.log('ÅR sub:', await p.textContent('.sub'), '| pall:', (await p.locator('.pod .name').allTextContents()).join(','));
console.log('ÅR hint:', (await p.locator('#app > .hint').allTextContents()).join(' / '));
console.log('ÅR rader:', (await p.locator('.tablewrap tbody tr').allTextContents()).map((x) => x.replace(/\s+/g, ' ').trim()).join(' | '));
console.log('ÅR deltävl:', (await p.locator('.rounds .round .win').allTextContents()).map((x) => x.replace(/\s+/g, ' ').trim()).join(' | '));
console.log('ÅR graf:', await p.locator('#kurvabox').count());
await p.screenshot({ path: 'utan-ar.png', fullPage: true });
await p.goto('http://localhost:8765/#/alltime'); await p.waitForTimeout(700);
const hdr = await p.locator('table').first().locator('thead th').allTextContents();
console.log('ALLTIME kol:', hdr.join('/'));
console.log('ALLTIME rader:', (await p.locator('table').first().locator('tbody tr').allTextContents()).map((x) => x.replace(/\s+/g, ' ').trim()).join(' | '));
await p.goto('http://localhost:8765/#/spelare/5'); await p.waitForTimeout(700);
console.log('SPELARE nyckel:', (await p.locator('.sp-tile').allTextContents()).slice(0, 3).map((x) => x.replace(/\s+/g, ' ').trim()).join(' | '));
await p.click('.sp-seg button:has-text("år")').catch(async () => { const bs = await p.locator('.sp-seg button').allTextContents(); console.log('knappar', bs); });
await p.waitForTimeout(300);
console.log('SPELARE ar-graf etiketter:', (await p.locator('svg text').allTextContents()).filter((x) => /^(19|20)\d\d$/.test(x)).join(','));
await b.close();
