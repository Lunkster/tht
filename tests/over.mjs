import { chromium } from 'playwright';
const db = {
  tht: [{ nr: 29, artal: 2026, ort: 'Visby' }, { nr: 28, artal: 2025, ort: 'Lindesberg' }],
  person: [{ fornamn: 'Robert', efternamn: 'Lindström', aktiv: true }, { fornamn: 'Henrik', efternamn: 'Lundqvist', aktiv: true }],
  overnattning: [{ id: 36, tht_nr: 28, platsnamn: 'Roberts hus, Lindesberg', antal_natter: 3, organisator: 'Robert Lindskog', lat: null, lon: null }],
};
let seq = 40; const log = [];
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.addInitScript(() => localStorage.setItem('tht-session', JSON.stringify({ access_token: 'x.eyJhcHBfbWV0YWRhdGEiOnsicm9sbCI6ImFkbWluIn19.y', refresh_token: 'r', expires_at: Date.now() / 1000 + 3600 })));
await p.route('**/*', async (r) => {
  const u = new URL(r.request().url());
  if (!u.hostname.includes('supabase')) return r.continue();
  const t = u.pathname.replace('/rest/v1/', ''), q = decodeURIComponent(u.search), m = r.request().method();
  const J = (body, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  if (m === 'GET') { if (t === 'overnattning') { if (q.includes('lat=is.null')) return J(db.overnattning.filter((o) => o.lat == null)); const nr = Number(q.match(/tht_nr=eq\.(\d+)/)[1]); return J(db.overnattning.filter((o) => o.tht_nr === nr)); } return J(db[t] ?? []); }
  log.push(`${m} ${t}${q} ${r.request().postData() ?? ''}`);
  const id = Number((q.match(/id=eq\.(\d+)/) || [])[1]);
  if (m === 'POST') db.overnattning.push({ id: ++seq, ...JSON.parse(r.request().postData()) });
  if (m === 'PATCH') Object.assign(db.overnattning.find((o) => o.id === id), JSON.parse(r.request().postData()));
  if (m === 'DELETE') db.overnattning = db.overnattning.filter((o) => o.id !== id);
  return r.fulfill({ status: m === 'POST' ? 201 : 204, body: '' });
});
await p.goto('http://localhost:8765/#/admin'); await p.waitForTimeout(400);
await p.click('a[href="#/admin/overnattning"]'); await p.waitForTimeout(600);
console.log('tom 2026:', await p.locator('.rounds').textContent(), '| ny öppen:', await p.locator('details.adm-ny').getAttribute('open'));
await p.fill('#oplats-ny', 'Fårö stugby'); await p.fill('#onatt-ny', 'tre'); await p.click('#of-ny [type=submit]');
console.log('fel nätter:', await p.locator('#omsg-ny').textContent());
await p.fill('#onatt-ny', '3'); await p.fill('#oorg-ny', 'Henrik Lundqvist'); await p.fill('#olat-ny', '57.9123, 19.0456');
console.log('koord:', await p.inputValue('#olat-ny'), await p.inputValue('#olon-ny'));
await p.click('#of-ny [type=submit]'); await p.waitForTimeout(600);
console.log('efter ny:', await p.locator('.ok').textContent(), '|', await p.locator('.okort .meta').first().textContent());
await p.screenshot({ path: 'over-1.png', fullPage: true });
await p.selectOption('#overtht', '28'); await p.waitForTimeout(600);
await p.click('[data-andra="36"]'); await p.fill('#oorg-36', 'Robert Lindström'); await p.click('#of-36 [type=submit]'); await p.waitForTimeout(600);
console.log('efter ändra:', await p.locator('.ok').textContent(), '|', await p.locator('.okort .meta').first().textContent());
await p.click('[data-andra="36"]'); await p.screenshot({ path: 'over-2.png', fullPage: true });
await p.click('[data-bort]'); console.log('bort steg1:', await p.locator('[data-bort]').textContent());
await p.click('[data-bort]'); await p.waitForTimeout(600);
console.log('efter bort:', await p.locator('.ok').textContent(), '|', await p.locator('.rounds').textContent());
console.log('\n' + log.join('\n'));
await b.close();
