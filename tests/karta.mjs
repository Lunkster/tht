import { chromium } from 'playwright';
import fs from 'fs';
const fx = JSON.parse(fs.readFileSync(new URL('./fixture.json', import.meta.url)));
const mock = fs.readFileSync(new URL('./leaflet-mock.js', import.meta.url), 'utf8');
const tht = [{ nr: 27, artal: 2024, ort: 'Praia Del Rey', klar: true }, { nr: 28, artal: 2025, ort: 'Lindesberg', klar: true }];
const banor = [
  { id: 74, namn: 'Lindesberga GK', lat: 59.58, lon: 15.24, banversion: [{ deltavling: [{ ordning: 1, datum: '2025-09-05', tht_nr: 28 }] }] },
  { id: 71, namn: 'Praia Del Rey', lat: 39.37, lon: -9.28, banversion: [{ deltavling: [{ ordning: 4, datum: '2024-09-27', tht_nr: 27 }, { ordning: 2, datum: '2024-09-24', tht_nr: 27 }] }] },
  { id: 5, namn: 'Utan koord GK', lat: null, lon: null, banversion: [{ deltavling: [{ ordning: 2, datum: '2025-09-06', tht_nr: 28 }] }] },
  { id: 6, namn: 'Ospelad GK', lat: 60, lon: 15, banversion: [{ deltavling: [] }] },
];
const over = [{ id: 36, tht_nr: 28, platsnamn: "Roberts hus", antal_natter: 3, organisator: 'Robert', lat: 59.6, lon: 15.2 }, { id: 35, tht_nr: 27, platsnamn: 'Praia', antal_natter: 7, organisator: null, lat: null, lon: null }];
const b = await chromium.launch(); const log = [];
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.addInitScript(() => localStorage.setItem('tht-session', JSON.stringify({ access_token: 'x.eyJhcHBfbWV0YWRhdGEiOnsicm9sbCI6ImFkbWluIn19.y', refresh_token: 'r', expires_at: Date.now() / 1000 + 3600 })));
await p.route('**/*', (r) => {
  const u = new URL(r.request().url());
  if (u.hostname === 'unpkg.com') return u.pathname.endsWith('.js') ? r.fulfill({ contentType: 'application/javascript', body: mock }) : r.fulfill({ contentType: 'text/css', body: '' });
  if (u.hostname.includes('nominatim')) { log.push('NOMINATIM ' + u.searchParams.get('q')); return r.fulfill({ contentType: 'application/json', body: JSON.stringify([{ lat: '59.5848', lon: '15.2433', display_name: 'Lindesberga golfklubb, Lindesberg, Örebro län, Sverige' }]) }); }
  if (!u.hostname.includes('supabase')) return r.continue();
  const t = u.pathname.replace('/rest/v1/', ''), q = decodeURIComponent(u.search);
  const J = (x) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(x) });
  if (t === 'bana') return J(q.includes('deltavling(tht(artal))') ? banor.map((b) => ({ ...b, banversion: [{ id: 1, deltavling: b.banversion[0].deltavling.map((d) => ({ tht: { artal: d.tht_nr === 28 ? 2025 : 2024 } })) }] })) : q.includes('banversion(deltavling') ? banor : q.includes('id=eq.') ? [{ id: 74, namn: 'Lindesberga GK', lat: null, lon: null, restaurang: true, rattigheter: true }] : []);
  if (t === 'overnattning') return J(q.includes('lat=is.null') ? over.filter((o) => o.lat == null) : q.includes('tht_nr=eq.') ? over.filter((o) => o.tht_nr === Number(q.match(/tht_nr=eq\.(\d+)/)[1])) : over);
  if (t === 'tht') return J(q.includes('select=nr,artal,ort,klar') || q.includes('select=nr,artal,ort&') ? tht : tht);
  if (t === 'v_tht_resultat') return J(q.includes('tht_nr') ? fx.res : fx.resall);
  if (t === 'v_runda') return J(fx.rundor.map((x) => ({ ...x, fornamn: 'X', artal: 2025 })));
  if (t === 'v_tht_kurva') return J(fx.kurva);
  if (t === 'deltavling') return J(fx.delt);
  if (t === 'pris') return J(q.includes('person(fornamn)') && !q.includes('deltavling_id') ? [{ typ: 'narmast', person_id: 1, person: { fornamn: 'Jörgen' } }, { typ: 'longest', person_id: 3, person: { fornamn: 'Robert' } }, { typ: 'narmast', person_id: 3, person: { fornamn: 'Robert' } }] : fx.pris);
  if (t === 'banversion') return J([]);
  return J([]);
});
const reg = () => p.evaluate(() => ({ kartor: window.__karta.kartor.length, markorer: window.__karta.markorer.length, popups: window.__karta.popups.slice(-3), fit: window.__karta.fit.at(-1) }));
await p.goto('http://localhost:8765/#/karta'); await p.waitForTimeout(900);
console.log('KARTA alla:', await p.locator('#kartsub').textContent(), '|', JSON.stringify((await reg()).popups).slice(0, 220));
await p.click('.kartknapp'); console.log('VISA ALLA-knapp:', await p.locator('.kartknapp').count(), '| fit efter klick:', JSON.stringify((await reg()).fit?.o));
console.log('saknar-hint:', await p.locator('.hint').textContent());
await p.selectOption('#kartar', '2024'); await p.waitForTimeout(200);
console.log('KARTA 2024:', await p.locator('#kartsub').textContent(), '| hash', await p.evaluate(() => location.hash));
await p.goto('http://localhost:8765/#/ar/2025'); await p.waitForTimeout(1200);
console.log('ÅR minikarta:', await p.locator('#minikarta[data-mock]').count(), '| länk', await p.locator('.minikarta a').getAttribute('href'));
await p.goto('http://localhost:8765/#/alltime'); await p.waitForTimeout(800);
console.log('ALLTIME priser:', (await p.locator('h2:has-text("Närmast") + .tablewrap tbody tr').allTextContents()).map((s) => s.replace(/\s+/g, ' ')).join(' | '), '| kartlänk', await p.locator('a.kartlank').count());
// Admin: välj plats på karta för en bana
await p.goto('http://localhost:8765/#/admin/banor/74'); await p.waitForTimeout(800);
await p.click('.kartval-knapp'); await p.waitForTimeout(400);
await p.fill('.kartval-sok input', 'Lindesberga golfklubb'); await p.click('.kartval-sok button'); await p.waitForTimeout(300);
console.log('SÖK:', await p.locator('.kartval .hint').textContent());
await p.evaluate(() => window.__karta.kartor.at(-1).klick(59.584812, 15.243399));
console.log('KLICK → lat/lon:', await p.inputValue('#blat'), await p.inputValue('#blon'));
await p.screenshot({ path: 'kartval.png', fullPage: true });
await p.goto('http://localhost:8765/#/admin/banor'); await p.waitForTimeout(700);
await p.click('#utankoord'); console.log('BANOR filter saknar:', await p.locator('#utankoord').textContent(), '| synliga:', (await p.locator('#banlista a:not([hidden]) .rn').allTextContents()).join(','));
await p.goto('http://localhost:8765/#/admin/overnattning'); await p.waitForTimeout(700);
console.log('ÖVERN saknar:', await p.locator('.saknar-lista summary').textContent());
await p.click('.saknar-lista summary'); await p.click('[data-fixa="35"]'); await p.waitForTimeout(900);
console.log('ÖVERN öppnad:', await p.locator('#overtht option:checked').textContent(), '| form öppen:', await p.locator('#of-35').count(), '| karta öppen:', await p.locator('[data-oid="35"] .kartval-box:not([hidden])').count());
await p.goto('http://localhost:8765/#/admin'); await p.waitForTimeout(500);
console.log('ADMIN backup-knapp:', await p.locator('#backup').count());
console.log(log.join('\n'));
await b.close();
