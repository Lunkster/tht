import { chromium } from 'playwright';
import fs from 'fs';
const d = JSON.parse(fs.readFileSync(new URL('./fixture.json', import.meta.url)));
// Sista året (2025, nr 28) = pågående i det här testet
const tht = d.tht.map((t) => ({ ...t, klar: t.artal !== 2025, start: null, kronika: null }));
const kurva1 = d.kurva.filter((k) => k.hal_i_tht === 1);
const log = [];
const b = await chromium.launch();
async function sida(kurva, w = 390) {
  const p = await b.newPage({ viewport: { width: w, height: 844 } });
  p.on('pageerror', (e) => console.log('ERR', e.message));
  await p.addInitScript(() => localStorage.setItem('tht-session', JSON.stringify({ access_token: 'x.eyJhcHBfbWV0YWRhdGEiOnsicm9sbCI6ImFkbWluIn19.y', refresh_token: 'r', expires_at: Date.now() / 1000 + 3600 })));
  await p.route('**/*', async (r) => {
    const u = new URL(r.request().url()); if (!u.hostname.includes('supabase')) return r.continue();
    const path = u.pathname.replace('/rest/v1/', ''), q = decodeURIComponent(u.search), m = r.request().method();
    const J = (body) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    if (m !== 'GET') { log.push(`${m} ${path}${q} ${r.request().postData()}`); return r.fulfill({ status: 204, body: '' }); }
    if (path === 'tht') return J(q.includes('nr=eq.') ? tht.filter((t) => t.nr === Number(q.match(/nr=eq\.(\d+)/)[1])) : tht);
    if (path === 'v_tht_resultat') return J(q.includes('tht_nr') ? d.res : d.resall);
    if (path === 'v_runda') return J(q.includes('select=ordning,fornamn,antal_hal') ? [{ ordning: 1, fornamn: 'Pär', antal_hal: 18 }, { ordning: 2, fornamn: 'Robert', antal_hal: 12 }] : d.rundor.map((x) => ({ ...x, fornamn: 'X' + x.person_id, artal: 2025, placering: x.poang > 38 ? 1 : 5 })));
    if (path === 'v_tht_kurva') return J(kurva);
    if (path === 'deltavling') return J(q.includes('select=tht_nr') ? [{ tht_nr: 28 }] : d.delt.map((x) => ({ ...x, banversion_id: 1, tee_id: 1, runda: [{ count: 5 }] })));
    if (path === 'pris') return J(d.pris);
    return J([]);
  });
  return p;
}
let p = await sida(d.kurva);
await p.goto('http://localhost:8765/#/ar/2025'); await p.waitForTimeout(900);
console.log('ÅR pågår-ruta:', (await p.locator('.pagar').textContent()).trim(), '| podium dold:', await p.locator('.podium').isHidden(), '| win i tabell:', await p.locator('td.win').count(), '| delt meta:', await p.locator('.round .win .meta').first().textContent());
console.log('menyordning:', (await p.locator('.tabs a').allTextContents()).join(' / '));
await p.goto('http://localhost:8765/#/ar/2024'); await p.waitForTimeout(900);
console.log('2024 (klar): pagar', await p.locator('.pagar').count(), '| podium synlig', await p.locator('.podium').isVisible());
await p.goto('http://localhost:8765/#/alltime'); await p.waitForTimeout(900);
console.log('ALLTIME hint:', (await p.locator('.hint').first().textContent()).slice(-70), '| vinnare 2025 i lista:', await p.locator('a[href="#/ar/2025"]').count());
await p.goto('http://localhost:8765/#/leaderboard'); await p.waitForTimeout(900);
console.log('LB sub:', await p.locator('.sub').textContent(), '| pagar', await p.locator('.pagar').count());
// Admin: avsluta med ofullständig runda
await p.goto('http://localhost:8765/#/admin/tht/28'); await p.waitForTimeout(800);
await p.click('#avsluta'); await p.waitForTimeout(400);
console.log('AVSLUTA 1:', await p.locator('#avslutamsg').textContent(), '| knapp:', await p.locator('#avsluta').textContent());
await p.screenshot({ path: 'klar-admin.png', fullPage: true });
await p.click('#avsluta'); await p.waitForTimeout(500);
console.log('AVSLUTA 2:', log.at(-1));
await p.close();
// Grafen med bara ett hål spelat
p = await sida(kurva1);
await p.goto('http://localhost:8765/#/leaderboard'); await p.waitForTimeout(900);
const ylab = await p.locator('#kurvabox svg text').allTextContents();
console.log('GRAF 1 hål, etiketter:', ylab.join(' '), '| alla heltal:', ylab.filter((t) => /^[+-]?\d+$/.test(t)).length, 'av', ylab.filter((t) => /\d/.test(t) && !/^R\d/.test(t)).length);
await p.locator('.chartcard').screenshot({ path: 'graf-1hal.png' });
await p.close();
await b.close();
