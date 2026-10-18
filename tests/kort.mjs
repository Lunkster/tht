import { chromium } from 'playwright';
const par = [4,3,5,4,4,3,4,5,4,4,4,3,5,4,4,3,5,4], idx = [7,17,1,11,3,15,9,5,13,8,2,18,6,14,4,16,10,12];
const db = {
  deltavling: [{ id: 101, ordning: 1, namn: 'The sheep return', datum: '2026-09-04', banversion_id: 81, tht: { artal: 2026, ort: 'Visby' }, banversion: { bana: { namn: 'Visby GK' } } }],
  person: [{ id: 1, fornamn: 'Jörgen', efternamn: 'Nilsson', aktiv: true }, { id: 9, fornamn: 'Henrik', efternamn: 'Lundqvist', aktiv: true }, { id: 3, fornamn: 'Robert', efternamn: 'Lindström', aktiv: true }],
  hal: par.map((p, i) => ({ nr: i + 1, par: p, hcp_index: idx[i] })),
  runda: [{ id: 700, deltavling_id: 101, person_id: 9, spel_hcp: 13, boll_nr: 1, score: [{ hal_nr: 1, slag: 5, puttar: 2 }, { hal_nr: 2, slag: 4, puttar: 2 }] }],
};
let seq = 800; const log = [];
const b = await chromium.launch();
for (const [w, h, v] of [[390, 900, 'mobil'], [1200, 900, 'dator']]) {
const p = await b.newPage({ viewport: { width: w, height: h } });
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.addInitScript(() => localStorage.setItem('tht-session', JSON.stringify({ access_token: 'x.eyJhcHBfbWV0YWRhdGEiOnsicm9sbCI6ImFkbWluIn19.y', refresh_token: 'r', expires_at: Date.now() / 1000 + 3600 })));
await p.route('**/*', async (r) => {
  const u = new URL(r.request().url());
  if (!u.hostname.includes('supabase')) return r.continue();
  const t = u.pathname.replace('/rest/v1/', ''), q = decodeURIComponent(u.search), m = r.request().method();
  const J = (body, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  if (m === 'GET') return J(db[t] ?? []);
  log.push(`${v} ${m} ${t}${q} ${r.request().postData() ?? ''}`.slice(0, 260));
  if (m === 'POST' && t === 'runda') return J([{ id: ++seq }], 201);
  return r.fulfill({ status: m === 'POST' ? 201 : 204, body: '' });
});
await p.goto('http://localhost:8765/#/mata/101/kort'); await p.waitForTimeout(800);
console.log(v, 'kort:', await p.locator('.sk-kort').count(), '| Henrik tot:', await p.locator('#tot-r700').textContent());
// Henrik: fortsätt från hål 3 med tangentbordet: 6 1 0 (10 – skrivs '1','0') 4 ...
await p.click('.sk-slag[data-k="r700"][data-h="3"]');
await p.keyboard.type('6');
console.log(v, 'fokus efter 6:', await p.evaluate(() => document.activeElement.dataset.h));
await p.keyboard.type('10');
console.log(v, 'fokus efter 10:', await p.evaluate(() => document.activeElement.dataset.h), 'värde h4:', await p.inputValue('.sk-slag[data-k="r700"][data-h="4"]'));
// Lägg till Robert, klistra in 18 slag
await p.selectOption('#nyspelare', '3'); await p.fill('#nyhcp', '12'); await p.click('#laggtill');
const robert = par.map((x) => x + 1);
await p.evaluate((txt) => { const el = document.activeElement; const dt = new DataTransfer(); dt.setData('text', txt); el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }, robert.join('\t'));
// förväntat: bogey överallt, hcp 12 → slag på index ≤12 → 3 p på 12 hål, 2 p på 6 = 48
console.log(v, 'Robert tot:', await p.locator('#tot-n1').textContent(), '(väntat 48) | ut-slag', await p.locator('#ss-n1-0').textContent(), 'in', await p.locator('#ss-n1-9').textContent());
// fel: puttar >= slag
await p.fill('.sk-puttar[data-k="n1"][data-h="1"]', '5'); await p.locator('.sk-puttar[data-k="n1"][data-h="1"]').dispatchEvent('input');
await p.click('#spara'); await p.waitForTimeout(200);
console.log(v, 'fel:', await p.locator('#sparmsg').textContent(), '|', await p.locator('#msg-n1').textContent());
await p.screenshot({ path: `kort-${v}.png`, fullPage: true });
await p.fill('.sk-puttar[data-k="n1"][data-h="1"]', '2'); await p.locator('.sk-puttar[data-k="n1"][data-h="1"]').dispatchEvent('input');
// Henrik: töm hål 2
await p.fill('.sk-slag[data-k="r700"][data-h="2"]', ''); await p.fill('.sk-puttar[data-k="r700"][data-h="2"]', ''); await p.locator('.sk-slag[data-k="r700"][data-h="2"]').dispatchEvent('input');
await p.fill('#hcp-r700', '14'); await p.locator('#hcp-r700').dispatchEvent('input');
console.log(v, 'bollval Henrik:', await p.locator('#boll-r700 option').allTextContents(), '| Robert valt:', await p.locator('#boll-n1 option:checked').textContent());
await p.selectOption('#boll-n1', '1'); await p.selectOption('#boll-r700', '2');
await p.click('#spara'); await p.waitForTimeout(800);
console.log(v, 'efter spara:', await p.locator('.ok').textContent().catch(() => 'ingen ok – ' ));
await p.close();
}
console.log('\n' + log.join('\n'));
await b.close();
