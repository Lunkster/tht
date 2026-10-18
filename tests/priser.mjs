import { chromium } from 'playwright';
const pars = [4,3,5,4,4,3,4,5,4,4,4,3,5,4,4,3,5,4];
const db = {
  tht: [{ nr: 28, artal: 2025, ort: 'Lindesberg', deltavling: [{ id: 98 }, { id: 99 }] }, { nr: 29, artal: 2026, ort: 'Visby', deltavling: [{ id: 201 }] }, { nr: 30, artal: 2027, ort: 'X', deltavling: [] }],
  deltavling: [
    { id: 98, tht_nr: 28, ordning: 1, namn: 'Bockjävel open', datum: '2025-09-05', banversion_id: 74, narmast_hal: 2, longest_hal: null, banversion: { bana: { namn: 'Lindesberga GK' } }, runda: [{ person_id: 1 }, { person_id: 9 }] },
    { id: 99, tht_nr: 28, ordning: 2, namn: 'Onion cup', datum: '2025-09-06', banversion_id: 75, narmast_hal: null, longest_hal: null, banversion: { bana: { namn: 'Kårsta GK' } }, runda: [] },
    { id: 201, tht_nr: 29, ordning: 1, namn: 'Sheep', datum: '2026-09-04', banversion_id: 81, narmast_hal: null, longest_hal: null, banversion: { bana: { namn: 'Visby' } }, runda: [] }],
  pris: [{ deltavling_id: 98, typ: 'narmast', person_id: 9 }],
  person: [{ id: 1, fornamn: 'Jörgen', efternamn: 'Nilsson', aktiv: true }, { id: 9, fornamn: 'Henrik', efternamn: 'Lundqvist', aktiv: true }, { id: 3, fornamn: 'Robert', efternamn: 'Lindström', aktiv: true }],
  hal: pars.map((p, i) => ({ banversion_id: 74, nr: i + 1, par: p })),
};
const log = [];
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.addInitScript(() => localStorage.setItem('tht-session', JSON.stringify({ access_token: 'x.eyJhcHBfbWV0YWRhdGEiOnsicm9sbCI6ImFkbWluIn19.y', refresh_token: 'r', expires_at: Date.now() / 1000 + 3600 })));
await p.route('**/*', async (r) => {
  const u = new URL(r.request().url());
  if (!u.hostname.includes('supabase')) return r.continue();
  const t = u.pathname.replace('/rest/v1/', ''), q = decodeURIComponent(u.search), m = r.request().method();
  const J = (body, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  if (m === 'GET') {
    if (t === 'deltavling') { const nr = Number(q.match(/tht_nr=eq\.(\d+)/)[1]); return J(db.deltavling.filter((d) => d.tht_nr === nr)); }
    if (t === 'pris') { const ids = q.match(/in\.\(([\d,]+)\)/)[1].split(',').map(Number); return J(db.pris.filter((x) => ids.includes(x.deltavling_id))); }
    if (t === 'hal') { const ids = q.match(/in\.\(([\d,]+)\)/)[1].split(',').map(Number); return J(db.hal.filter((x) => ids.includes(x.banversion_id))); }
    return J(db[t] ?? []);
  }
  if (m === 'DELETE') { log.push(`DELETE ${t}${q}`); const did = Number(q.match(/deltavling_id=eq\.(\d+)/)[1]), typ = q.match(/typ=eq\.(\w+)/)[1]; db.pris = db.pris.filter((x) => !(x.deltavling_id === did && x.typ === typ)); return r.fulfill({ status: 204, body: '' }); }
  const body = JSON.parse(r.request().postData()); log.push(`${m} ${t}${q} ${JSON.stringify(body)}`);
  if (m === 'PATCH') Object.assign(db.deltavling.find((d) => d.id === Number(q.match(/id=eq\.(\d+)/)[1])), body);
  if (m === 'POST') body.forEach((x) => { const e = db.pris.find((y) => y.deltavling_id === x.deltavling_id && y.typ === x.typ); e ? Object.assign(e, x) : db.pris.push(x); });
  return r.fulfill({ status: m === 'POST' ? 201 : 204, body: '' });
});
await p.goto('http://localhost:8765/#/admin'); await p.waitForTimeout(400);
await p.click('a[href="#/admin/priser"]'); await p.waitForTimeout(700);
console.log('THT-val:', await p.locator('#pristht option').allTextContents());
console.log('närmast R1:', await p.locator('#h-narmast-98 option:checked').textContent(), '/', await p.locator('#p-narmast-98 option:checked').textContent());
console.log('grupper R1:', await p.locator('#p-longest-98 optgroup').evaluateAll((g) => g.map((x) => x.label + ':' + x.children.length)));
await p.selectOption('#h-longest-98', '1'); console.log('tips par4 longest:', await p.locator('#tips-longest-98').textContent());
await p.selectOption('#h-longest-98', '3'); console.log('tips par5:', JSON.stringify(await p.locator('#tips-longest-98').textContent()));
await p.selectOption('#p-longest-98', '1'); await p.selectOption('#p-narmast-98', '3');
await p.screenshot({ path: 'pris-1.png', fullPage: true });
await p.click('#pf-98 [type=submit]'); await p.waitForTimeout(700);
console.log('efter:', await p.locator('.ok').textContent(), '| longest', await p.locator('#h-longest-98 option:checked').textContent(), await p.locator('#p-longest-98 option:checked').textContent(), '| tom-option disabled:', await p.locator('#p-narmast-98 option[value=""]').isDisabled());
console.log('R2 utan hål i db → 18 hål:', await p.locator('#h-narmast-99 option').count());
await p.selectOption('#p-narmast-98', ''); await p.selectOption('#h-narmast-98', '');
console.log('tom-option text:', await p.locator('#p-longest-98 option[value=""]').textContent());
await p.click('#pf-98 [type=submit]'); await p.waitForTimeout(700);
console.log('efter borttag:', await p.locator('.ok').textContent(), '| närmast', await p.locator('#h-narmast-98 option:checked').textContent(), '/', await p.locator('#p-narmast-98 option:checked').textContent(), '| longest kvar:', await p.locator('#p-longest-98 option:checked').textContent());
await p.selectOption('#pristht', '29'); await p.waitForTimeout(600);
console.log('bytt till 29:', await p.locator('.priskort .rn').allTextContents());
console.log('\n' + log.join('\n'));
await b.close();
