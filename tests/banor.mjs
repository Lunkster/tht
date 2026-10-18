import { chromium } from 'playwright';
const db = {
  bana: [{ id: 74, namn: 'Lindesberga GK', lat: 59.58, lon: 15.24, restaurang: true, rattigheter: true }, { id: 3, namn: 'The Island GK', lat: null, lon: null, restaurang: false, rattigheter: false }],
  banversion: [{ id: 74, bana_id: 74, giltig_fran: '2025-01-01', kommentar: null }, { id: 3, bana_id: 3, giltig_fran: '2019-01-01', kommentar: null }],
  tee: [{ id: 76, banversion_id: 74, namn: 'gul', slope: null, course_rating: null }],
  hal: [], hal_langd: [],
};
let seq = 1000;
const par = [4,3,5,4,4,3,4,5,4,4,4,3,5,4,4,3,5,4], idx = [7,17,1,11,3,15,9,5,13,8,2,18,6,14,4,16,10,12];
par.forEach((p, i) => { db.hal.push({ id: 500 + i, banversion_id: 74, nr: i + 1, par: p, hcp_index: idx[i] }); db.hal_langd.push({ hal_id: 500 + i, tee_id: 76, langd: 300 + i }); });
const delt = [{ id: 98, banversion_id: 74, namn: 'Lindesberga', ordning: 1, tht: { nr: 28, artal: 2025 } }];
const log = [];
function get(t, q) {
  const eq = (k) => { const m = q.match(new RegExp(`[?&]${k}=eq\\.(\\d+)`)); return m ? Number(m[1]) : null; };
  if (t === 'bana') {
    let r = db.bana; if (eq('id')) r = r.filter((b) => b.id === eq('id'));
    return r.map((b) => ({ ...b, banversion: db.banversion.filter((v) => v.bana_id === b.id).map((v) => ({ id: v.id, deltavling: delt.filter((d) => d.banversion_id === v.id) })) }));
  }
  if (t === 'banversion') {
    let r = db.banversion; if (eq('id')) r = r.filter((v) => v.id === eq('id')); if (eq('bana_id')) r = r.filter((v) => v.bana_id === eq('bana_id'));
    return r.map((v) => ({ ...v, bana: db.bana.find((b) => b.id === v.bana_id), tee: db.tee.filter((x) => x.banversion_id === v.id), hal: [{ count: db.hal.filter((h) => h.banversion_id === v.id).length }], deltavling: delt.filter((d) => d.banversion_id === v.id) }));
  }
  if (t === 'tee') return db.tee.filter((x) => x.banversion_id === eq('banversion_id'));
  if (t === 'hal') return db.hal.filter((h) => h.banversion_id === eq('banversion_id')).sort((a, b) => a.nr - b.nr).map((h) => ({ ...h, hal_langd: db.hal_langd.filter((l) => l.hal_id === h.id) }));
  return [];
}
function post(t, q, body) {
  const rows = Array.isArray(body) ? body : [body];
  const conflict = (q.match(/on_conflict=([\w,]+)/) || [])[1]?.split(',');
  return rows.map((r) => {
    if (conflict) { const ex = db[t].find((x) => conflict.every((k) => x[k] === r[k])); if (ex) { Object.assign(ex, r); return ex; } }
    if (t === 'tee' && db.tee.some((x) => x.banversion_id === r.banversion_id && x.namn === r.namn)) throw Object.assign(new Error('dup'), { code: '23505' });
    const n = t === 'hal_langd' ? { ...r } : { id: ++seq, ...r }; db[t].push(n); return n;
  });
}
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.addInitScript(() => localStorage.setItem('tht-session', JSON.stringify({ access_token: 'x.eyJhcHBfbWV0YWRhdGEiOnsicm9sbCI6ImFkbWluIn19.y', refresh_token: 'r', expires_at: Date.now() / 1000 + 3600 })));
await p.route('**/*', async (r) => {
  const u = new URL(r.request().url());
  if (!u.hostname.includes('supabase')) return r.continue();
  const t = u.pathname.replace('/rest/v1/', ''), q = decodeURIComponent(u.search), m = r.request().method();
  const J = (body, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  try {
    if (m === 'GET') return J(get(t, q));
    const body = JSON.parse(r.request().postData() || 'null');
    log.push(`${m} ${t}${q.includes('on_conflict') ? ' (upsert)' : ''} ${Array.isArray(body) ? body.length + ' rader' : JSON.stringify(body)}`);
    if (m === 'POST') return J(post(t, q, body), 201);
    if (m === 'PATCH') { const id = Number(q.match(/id=eq\.(\d+)/)[1]); Object.assign(db[t].find((x) => x.id === id), body); return r.fulfill({ status: 204, body: '' }); }
  } catch (e) { return J({ message: e.message, code: e.code }, 409); }
});
const vis = async (n) => { await p.waitForTimeout(500); await p.screenshot({ path: `ban-${n}.png`, fullPage: true }); };

await p.goto('http://localhost:8765/#/admin'); await p.waitForTimeout(400);
await p.click('a[href="#/admin/banor"]'); await vis('1-lista');
console.log('lista:', (await p.locator('#banlista .rn').allTextContents()).join(' | '), '|', (await p.locator('#banlista .meta').first().textContent()));
await p.fill('#sok', 'isl'); console.log('sök isl synliga:', await p.locator('#banlista a:not([hidden])').count());

// Ny bana med koordinater inklistrade och likhetsvarning
await p.goto('http://localhost:8765/#/admin/banor/ny'); await p.waitForTimeout(400);
await p.fill('#namn', 'Lindesberga'); console.log('liknande:', await p.locator('#liknande').textContent());
await p.fill('#namn', 'Visby GK'); await p.fill('#lat', '57.55, 18.24');
console.log('lat/lon:', await p.inputValue('#lat'), await p.inputValue('#lon'));
await p.check('#rest'); await p.fill('#giltig', '2026-01-01');
await vis('2-ny');
await p.click('#nybana [type=submit]'); await p.waitForTimeout(800);
console.log('hash efter skapa:', await p.evaluate(() => location.hash));
await vis('3-tom-version');

// Lägg till tee röd, klistra in scorekort (format B med summor)
await p.click('#nytee'); await p.fill('[id^="tn-n"]', 'röd');
await p.click('#klistra summary');
const s = (a, x, y) => a.slice(x, y).reduce((q, w) => q + w, 0);
const gul = par.map((v, i) => v * 90 + i), rod = gul.map((v) => v - 40);
await p.fill('#klistertext', [`Par ${par.slice(0,9).join(' ')} ${s(par,0,9)} ${par.slice(9).join(' ')} ${s(par,9,18)} ${s(par,0,18)}`, `Hcp ${idx.join(' ')}`, `Gul ${gul.join(' ')}`, `Röd ${rod.join(' ')}`].join('\n'));
await p.click('#fyll');
console.log('klister:', await p.locator('#klistermsg').textContent());
console.log('summor: ut', await p.locator('#ut-par').textContent(), 'tot', await p.locator('#tot-par').textContent(), 'röd tot', await p.locator('[id^="tot-n"]').textContent());
await vis('4-ifylld');
await p.click('#spara'); await p.waitForTimeout(800);
console.log('efter spara:', await p.locator('.ok').textContent().catch(() => p.locator('#sparmsg').textContent()));
await vis('5-sparad');

// Ändra index så att det krockar → varning, spara igen
await p.fill('#i-2', '7'); await p.locator('#i-2').blur();
await p.click('#spara'); console.log('varning:', await p.locator('#sparmsg').textContent());
await p.click('#spara'); await p.waitForTimeout(700);
console.log('efter andra spara:', await p.locator('.ok').textContent());
// Försök tömma ett par → fel
await p.fill('#p-3', ''); await p.click('#spara'); console.log('tömma:', await p.locator('#sparmsg').textContent());

// Befintlig bana: ny version med kopia
await p.goto('http://localhost:8765/#/admin/banor/74'); await p.waitForTimeout(500);
await vis('6-bana');
await p.click('#nyversion').catch(() => {}); await p.click('details.adm-ny summary'); await p.fill('#vgiltig', '2026-05-01'); await p.fill('#vkomm', 'nya hål 3–5');
await p.click('#nyversion [type=submit]'); await p.waitForTimeout(900);
console.log('ny version hash:', await p.evaluate(() => location.hash), '| varn:', await p.locator('.varn').count(), '| tot par', await p.locator('#tot-par').textContent(), '| gul tot', await p.locator('[id^="tot-t"]').first().textContent());
await p.goto('http://localhost:8765/#/admin/banor/74/74'); await p.waitForTimeout(500);
console.log('gammal version varning:', await p.locator('.varn').textContent());
await vis('7-anvand');
console.log('\nSKRIVNINGAR:\n' + log.join('\n'));
await b.close();
