import { chromium } from 'playwright';
const db = {
  tht: [{ nr: 13, artal: 2010, ort: 'Örebro', start: null, kronika: null }, { nr: 28, artal: 2025, ort: 'Lindesberg', start: null, kronika: null }],
  deltavling: [
    { id: 49, tht_nr: 13, ordning: 2, namn: 'Noble Invitational', datum: '2010-09-18', banversion_id: 10, tee_id: 11, cnt: 10 },
    { id: 50, tht_nr: 13, ordning: 3, namn: 'Sheep Sauna Competition', datum: '2010-09-19', banversion_id: 19, tee_id: 22, cnt: 10 },
    { id: 98, tht_nr: 28, ordning: 1, namn: 'The burning bockjävel open', datum: '2025-09-05', banversion_id: 74, tee_id: 76, cnt: 10 }],
  bana: [{ id: 10, namn: 'Kumla GK' }, { id: 19, namn: 'Mosjö Golf & Countryclub' }, { id: 74, namn: 'Lindesberga GK' }, { id: 80, namn: 'Visby GK' }],
  banversion: [
    { id: 10, bana_id: 10, giltig_fran: '2005-01-01', kommentar: null, tee: [{ id: 11, namn: 'gul' }], hal: [{ count: 18 }] },
    { id: 77, bana_id: 19, giltig_fran: '2010-08-14', kommentar: 'Stor ombyggnad', tee: [{ id: 79, namn: 'gul' }], hal: [{ count: 18 }] },
    { id: 19, bana_id: 19, giltig_fran: '2005-07-28', kommentar: null, tee: [{ id: 22, namn: 'gul' }], hal: [{ count: 18 }] },
    { id: 74, bana_id: 74, giltig_fran: '2025-01-01', kommentar: null, tee: [{ id: 76, namn: 'gul' }], hal: [{ count: 18 }] },
    { id: 81, bana_id: 80, giltig_fran: '2026-01-01', kommentar: null, tee: [{ id: 90, namn: 'röd' }, { id: 91, namn: 'gul' }], hal: [{ count: 0 }] }],
};
let seq = 200; const log = [];
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.addInitScript(() => localStorage.setItem('tht-session', JSON.stringify({ access_token: 'x.eyJhcHBfbWV0YWRhdGEiOnsicm9sbCI6ImFkbWluIn19.y', refresh_token: 'r', expires_at: Date.now() / 1000 + 3600 })));
await p.route('**/*', async (r) => {
  const u = new URL(r.request().url());
  if (!u.hostname.includes('supabase')) return r.continue();
  const t = u.pathname.replace('/rest/v1/', ''), q = decodeURIComponent(u.search), m = r.request().method();
  const J = (body, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  const eq = (k) => { const mm = q.match(new RegExp(`[?&]${k}=eq\\.(\\d+)`)); return mm ? Number(mm[1]) : null; };
  if (m === 'GET') {
    if (t === 'tht') { let x = db.tht; if (eq('nr')) x = x.filter((y) => y.nr === eq('nr')); return J(x.map((y) => ({ ...y, deltavling: db.deltavling.filter((d) => d.tht_nr === y.nr).map((d) => ({ datum: d.datum })) })).sort((a, c) => c.nr - a.nr)); }
    if (t === 'deltavling') return J(db.deltavling.filter((d) => d.tht_nr === eq('tht_nr')).sort((a, c) => a.ordning - c.ordning).map((d) => ({ ...d, runda: [{ count: d.cnt ?? 0 }] })));
    if (t === 'bana') return J(db.bana);
    if (t === 'banversion') return J(db.banversion);
    return J([]);
  }
  const body = JSON.parse(r.request().postData());
  log.push(`${m} ${t} ${q} ${JSON.stringify(body)}`);
  if (m === 'POST') { if (t === 'tht') { if (db.tht.some((x) => x.artal === body.artal)) return J({ message: 'duplicate key value violates unique constraint "tht_artal_key"', code: '23505' }, 409); db.tht.push({ kronika: null, ...body }); } else db.deltavling.push({ id: ++seq, ...body }); return r.fulfill({ status: 201, body: '' }); }
  if (m === 'PATCH') { const row = t === 'tht' ? db.tht.find((x) => x.nr === eq('nr')) : db.deltavling.find((x) => x.id === eq('id')); Object.assign(row, body); return r.fulfill({ status: 204, body: '' }); }
});
const vis = async (n) => { await p.waitForTimeout(450); await p.screenshot({ path: `tht-${n}.png`, fullPage: true }); };
await p.goto('http://localhost:8765/#/admin'); await p.waitForTimeout(400);
console.log('meny tht-länk:', await p.locator('a[href="#/admin/tht"]').count());
await p.click('a[href="#/admin/tht"]'); await vis('1-lista');
console.log('förslag nr/år:', await p.inputValue('#tnr'), await p.inputValue('#tar'));
await p.fill('#tar', '2025'); await p.fill('#tort', 'X'); await p.click('#nytht [type=submit]'); await p.waitForTimeout(300);
console.log('dubbelt år:', await p.locator('#tmsg').textContent());
await p.fill('#tar', '2026'); await p.fill('#tort', 'Visby'); await p.fill('#tstart', '2026-09-04');
await p.click('#nytht [type=submit]'); await p.waitForTimeout(700);
console.log('hash:', await p.evaluate(() => location.hash));
await vis('2-ny-tht');
console.log('ny delt defaults: nr', await p.inputValue('#dord-ny'), 'datum', await p.inputValue('#ddat-ny'));
await p.selectOption('#dbana-ny', '80'); await p.waitForTimeout(100);
console.log('tee-val:', await p.locator('#dtee-ny option:checked').textContent(), '| info:', await p.locator('#dinfo-ny').textContent());
await p.fill('#dnamn-ny', 'The sheep return'); await p.click('#df-ny [type=submit]'); await p.waitForTimeout(700);
console.log('efter ny:', await p.locator('.ok').textContent(), '|', await p.locator('#dlista .meta').first().textContent());
console.log('nästa default:', await p.inputValue('#dord-ny'), await p.inputValue('#ddat-ny'));
await vis('3-delt');
// Mosjö 2010: byt version
await p.goto('http://localhost:8765/#/admin/tht/13'); await p.waitForTimeout(600);
await p.click('[data-andra="50"]'); await p.waitForTimeout(200);
console.log('mosjö version nu:', await p.locator('#dver-50 option:checked').textContent());
await p.selectOption('#dver-50', '77'); await p.waitForTimeout(100);
console.log('varning:', await p.locator('#dinfo-50').textContent(), '| tee', await p.locator('#dtee-50 option:checked').textContent());
await vis('4-mosjo');
await p.click('#df-50 [type=submit]'); await p.waitForTimeout(600);
console.log('efter:', await p.locator('.ok').textContent(), '|', (await p.locator('[data-did="50"] .meta').textContent()));
await p.click('[data-andra="49"]'); await p.fill('#dord-49', '3'); await p.click('#df-49 [type=submit]'); await p.waitForTimeout(200);
console.log('krock nr:', await p.locator('#dmsg-49').textContent());
await p.fill('#tkron', 'Bröllopsåret.'); await p.click('#thtform [type=submit]'); await p.waitForTimeout(500);
console.log('tht spara:', await p.locator('.ok').textContent());
console.log('\n' + log.join('\n'));
await b.close();
