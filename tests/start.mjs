import { chromium } from 'playwright';
const iso = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const base = [{ nr: 27, artal: 2024, ort: 'Praia Del Rey', start: null }, { nr: 28, artal: 2025, ort: 'Lindesberg', start: null }];
const bdelt = [{ tht_nr: 27, datum: '2024-09-23' }, { tht_nr: 27, datum: '2024-09-27' }, { tht_nr: 28, datum: '2025-09-05' }, { tht_nr: 28, datum: '2025-09-07' }];
const fall = {
  ingen: [base, bdelt],
  nasta: [[...base, { nr: 29, artal: 2027, ort: 'Visby', start: iso(40) }], bdelt],
  live: [[...base, { nr: 29, artal: 2026, ort: 'Visby', start: null }], [...bdelt, { tht_nr: 29, datum: iso(-1) }, { tht_nr: 29, datum: iso(1) }]],
};
const b = await chromium.launch();
for (const [namn, [tht, delt]] of Object.entries(fall)) for (const [w, h, v] of [[390, 844, 'mobil'], [1100, 900, 'dator']]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  p.on('pageerror', (e) => console.log('ERR', e.message));
  await p.route('**/*', (r) => {
    const u = new URL(r.request().url());
    if (!u.hostname.includes('supabase')) return r.continue();
    const path = u.pathname.replace('/rest/v1/', '');
    return r.fulfill({ contentType: 'application/json', body: JSON.stringify(path === 'tht' ? tht : path === 'deltavling' ? delt : []) });
  });
  await p.goto('http://localhost:8765/'); await p.waitForTimeout(1300);
  console.log(namn, v, (await p.locator('.nasta').innerText()).replace(/\s+/g, ' '), '| aktiv flik:', await p.locator('.tabs a.active').count());
  await p.screenshot({ path: `start-${namn}-${v}.png`, fullPage: true });
  await p.close();
}
await b.close();
